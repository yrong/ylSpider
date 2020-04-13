'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const log = require('simple-node-logger').createSimpleLogger();
const moment = require('moment')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const search = require('./search')
const yooli_contract_prefix = 'yooli_contract_'
const parse = require('./parse')
const jsonfile = require('jsonfile')
require('dotenv').config()

let browser,page,currDate,downloadPath,
    ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH'],
    ChromeHeadlessMode = (process.env['CHROME_HEADLESS_MODE']=='true'),
    SkipDownload = (process.env['SkipDownload']=='true'),
    SkipDetail = (process.env['SkipDetail']=='true'),
    SaveSearch = (process.env['SaveSearch']=='true'),
    WeixinLogin = (process.env['WeixinLogin']=='true'),
    PlanName = process.env['PlanName'],
    DownloadInterval = parseInt(process.env['DownloadInterval']),
    DownBatchSize = parseInt(process.env['DownBatchSize']),
    DefaultTimeout = parseInt(process.env['DefaultTimeout']),
    DownloadPolicy = process.env['DownloadPolicy'],
    SkipParse = (process.env['SkipParse']=='true')

const sleep = async (ms)=>{
    return new Promise(resolve => setTimeout(resolve, ms));
}

const loadPageOption = {waitUntil:'domcontentloaded'}

const init = async ()=>{
    browser = await puppeteer.launch({headless: ChromeHeadlessMode, slowMo: 50, executablePath:ChromeBinPath});
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(DefaultTimeout);
    await page.setDefaultTimeout(DefaultTimeout)
    currDate = new Date().toISOString().replace(/(T.+)/,'').replace(/\-/g,'')
    downloadPath = path.resolve("download",currDate)
    await mkdirp(downloadPath)
}

const login = async (username,passwd)=>{
    await page.goto('https://www.yooli.com/',loadPageOption);
    const loginSelector = "a[href='/secure/login/'][data-hm='navigation, nav_login']";
    await page.waitForSelector(loginSelector);
    await page.click(loginSelector);
    await page.waitForSelector('#loginBt');
    log.info('to login page success')
    await sleep(1000)
    if(WeixinLogin){
        const weixinLoginSelector = "a[data-hm='login_page, wechat_login']";
        await page.click(weixinLoginSelector)
    }else{
        await page.type('#userName', username||process.env['YOOLI_USER']);
        await page.type('#password', passwd||process.env['YOOLI_PASS']);
        await page.click('#checkWeekly')
        await page.click('#loginBt')
    }
    const userSelector = "a[href='/userAccount.session.action']";
    await page.waitForSelector(userSelector);
    log.info('login success')
}

const getPlans = async ()=>{
    const planSelector = "div#itemCurrentContent ul li";
    const planPageNumSelector = "div#financeCurrentPage a:nth-last-child(2)";
    await page.goto('https://www.yooli.com/financePlanRecords.session.action',loadPageOption);
    await page.waitForSelector(planSelector);
    //get maxPageNum for plans
    let maxPlanPageNum = await page.$eval(planPageNumSelector, element => {
        return element.innerText
    });
    maxPlanPageNum = parseInt(maxPlanPageNum)
    //get plans in first page
    let getPlanInPage = async()=>{
        return await page.$$eval(planSelector, plans => {
            return plans.map(plan => {
                let dataId = plan.getAttribute("data-text")
                let pos = dataId.indexOf(':'), planId=dataId.substr(0,pos),
                    planName = dataId.replace(':','-')
                return {planId,planName}
            })});
    }
    let plans = await getPlanInPage()
    //get plans in other pages
    for(let i=2;i<=maxPlanPageNum;i++){
        let pageSelector = `a[href='javascript:getFinanceCurrentPlanList(${i});']`
        await page.click(pageSelector)
        await page.waitForSelector(planSelector);
        plans = plans.concat(await getPlanInPage());
    }
    log.info(`get all plans success`)
    return plans
}

const getContract = async(plan)=>{
    const contractInfoSelector = "a[href^='/dingcunbao/item']";
    const contractDetailSelector = "a[href^='/contractDetail.session.action']";
    const contractDownloadSelector = "a[href^='/contractDetailDownload.session.action']";
    const myAmountSelector = '#financePlanLoanInvestorList div.plan-post:not(:first-child) ul li.col_2'
    const contractPageNumSelector = "div#planLoanListPager a:nth-last-child(2)";
    const lendRateSelector = `div#main em#rate`
    const lendAmountSelector = `div#main ul.items:nth-child(1) li.y_2`
    const lendDateSelector = `div#main ul.items:nth-child(2) li.y_2`
    await page.goto(`https://www.yooli.com/userPlan/detail/${plan.planId}.html`,loadPageOption);
    await page.waitForSelector(contractInfoSelector);
    let planRate = await page.$eval(lendRateSelector, element => {
        return element.innerText.split('+').reduce((total,rate)=>{
            return total + parseFloat(rate.replace('%',''))
        },0)
    });
    let planAmount = await page.$eval(lendAmountSelector, element => {
        return parseFloat(element.innerText.replace(',','').replace('元',''))
    });
    let planDate = await page.$eval(lendDateSelector, element => {
        return element.innerText.replace(/\./g,'-')
    });
    Object.assign(plan,{planRate,planAmount,planDate})
    //get maxPageNum for contracts
    let maxContractPageNum = await page.$eval(contractPageNumSelector, element => {
        return element.innerText
    });
    maxContractPageNum = parseInt(maxContractPageNum)
    //get all contract links
    let getContractsInPage = async ()=>{
        let details = await page.$$eval(contractDetailSelector, anchors => {
            return [].map.call(anchors, a => {
                return {detailUrl:a.href}
            })});
        let downloads = await page.$$eval(contractDownloadSelector, anchors => {
            return [].map.call(anchors, a => {
                let regex = /.*loanId=(\d+)\&loaninvestorId=(\d+)$/,
                    loanId,loaninvestorId,imageUrl,creditUrl,downloadUrl,match
                match = regex.exec(a.href)
                if(match&&match.length==3){
                    loanId = match[1]
                    loaninvestorId = match[2]
                    downloadUrl = a.href
                    imageUrl = `https://www.yooli.com/viewSignature.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                    creditUrl = `https://www.yooli.com/contractCreditRights.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                    return {loanId,loaninvestorId,downloadUrl,imageUrl,creditUrl}
                }
            })});
        let myAmounts = await page.$$eval(myAmountSelector, eles => {
            return [].map.call(eles, ele => {
                let myAmount = parseFloat(ele.innerText.replace(',',''))
                return {myAmount}
            })});
        let infos = await page.$$eval(contractInfoSelector, anchors => {
            return [].map.call(anchors, a => {
                return {name:a.innerText,infoUrl:a.href}
            })});
        for(let i=0;i<infos.length;i++){
            Object.assign(infos[i],details[i],downloads[i],myAmounts[i],{id:downloads[i].loanId})
        }
        return infos
    }
    let contracts = await getContractsInPage()
    for(let i=2;i<=maxContractPageNum;i++){
        const pageSelector = `a[href='javascript:getFinancePlanLoanInvestorList(${i});']`
        try{
            await page.click(pageSelector)
            await page.waitForSelector(contractInfoSelector);
            contracts = contracts.concat(await getContractsInPage());
        }catch(e){
            log.error(e.stack||e)
        }
    }
    //deduplicate by infoUrl
    let contractObj = {},deduplicated = []
    for(let contract of contracts){
        contractObj[contract.infoUrl] = contract
    }
    for (let key in contractObj)
        deduplicated.push(contractObj[key]);
    log.info(`get contract in plan ${plan.planName} success`)
    return deduplicated
}

const getContractDetail = async (plan,contracts)=>{
    const borrowAmountSelector = 'div.invest-top div.profit dl.f dd em'
    const borrowerTypeSelector = 'div.invest-top div.head span.type'
    const borrowRateSelector = 'div.invest-top div.profit dl:nth-child(2) dd em'
    const borrowRateDecimalPartSelector = 'div.invest-top div.profit dl:nth-child(2) dd span'
    const borrowTimeTermSelector = 'div.invest-top div.profit dl:nth-child(3) dd em'
    const borrowRepayTypeSelector = 'div.invest-top div.repay span.t:nth-child(1)'
    const borrowRepayStartDateSelector = 'div.invest-top div.repay span.t:nth-child(2)'
    for(let contract of contracts){
        try{
            await page.goto(contract.infoUrl,loadPageOption)
            await page.waitForSelector(borrowAmountSelector);
            let amount = await page.$eval(borrowAmountSelector, element => {
                return parseFloat(element.innerText.replace(',',''))
            });
            let borrowerType = await page.$eval(borrowerTypeSelector, element => {
                return element.innerText.replace(/^\s*$(?:\r\n?|\n)/gm,'')
            });
            let rate = await page.$eval(borrowRateSelector, element => {
                return parseFloat(element.innerText.replace(',',''))
            });
            let decimalRate = await page.$eval(borrowRateDecimalPartSelector, element => {
                return parseFloat(element.innerText)
            });
            rate = rate + decimalRate
            let term = await page.$eval(borrowTimeTermSelector, element => {
                return parseInt(element.innerText)
            });
            let payType = await page.$eval(borrowRepayTypeSelector, element => {
                let regex = /项目按(.*?)方式还款/
                let result = regex.exec(element.innerText)
                if(result&&result.length==2){
                    return result[1]
                }
            });
            let payStartDate = await page.$eval(borrowRepayStartDateSelector, element => {
                let regex = /已于(\d+)年(\d+)月(\d+)日计息/
                let result = regex.exec(element.innerText)
                if(result&&result.length==4){
                    return `${result[1]}-${result[2]}-${result[3]}`
                }
            });
            let expired
            if(payStartDate&&term){
                expired = moment(payStartDate).add(term, 'M').isBefore(moment())
            }
            contract = Object.assign(contract,{amount,borrowerType,rate,term,payType,payStartDate,expired})
            log.info(`get contract ${contract.name} detail success`)
        }catch (e) {
            log.error(e.stack||e)
            log.error(`fail to get detail of contract ${contract.name} in plan ${plan.planName}`)
        }
    }
    return contracts
}

let downloadToken;

const getDownloadToken = async (url,force)=>{
    while(!downloadToken){
        await page.goto(url,loadPageOption)
        const response = await page.waitForResponse(response => response.url() === 'https://www.yooli.com/rest/slideVerify/verifyX' && response.status() === 200);
        let json = await response.json()
        if(json.verify){
            downloadToken = json.resultCode
            return downloadToken
        }
        await sleep(500)
    }
}

const downloadContract = async (plan,contracts)=>{
    let retryContracts = [];
    const VerifyCodeSelector = "div.slide-btn"
    const ContractImageSelector = 'img[src*=\'/viewSignature.session.action\']'
    let PlanPath = downloadPath + "/" + plan.planName
    await mkdirp(PlanPath)

    if(DownloadPolicy=='pdf') {
        await getDownloadToken(contracts[0].downloadUrl)
        for(let contract of contracts){
            try{
                await page.goto(contract.downloadUrl + `&token=${downloadToken}`,loadPageOption)
                // await page.waitForSelector(VerifyCodeSelector);
                // await page.waitForSelector(VerifyCodeSelector,{hidden: true});
                log.error(`contract ${contract.name} download fail,will retry`)
                await sleep(DownloadInterval)
            }catch(e){
                log.info(`contract ${contract.name} download success`)
                await sleep(500)
            }
        }
        retryContracts = await findMissingAndMoveFinished(plan, contracts)
        if (retryContracts.length) {
            log.info(`retry missing contracts:${retryContracts.map(contract=>contract.name)} in plan ${plan.planName}`)
            await downloadContract(plan, retryContracts)
        }
    }
    else if(DownloadPolicy=='image'){
        for(let contract of contracts) {
            try {
                await page.goto(contract.imageUrl, loadPageOption)
                await page.waitForSelector(ContractImageSelector,{timeout:5000});
                await page.click(ContractImageSelector)
                await page.screenshot({path: `${PlanPath}/${contract.id}.png`, fullPage: true});
            } catch (e) {
                log.error(`imageUrl ${contract.imageUrl} download fail!` + e.stack||e)
            }
        }
    }else{
        throw new Error('contract download source not support')
    }
}

const findMissingAndMoveFinished = async (plan,contracts)=>{
    let contractFile,contractId,match,filePath,dstPath,missingContracts = [],PlanPath = downloadPath + "/" + plan.planName
    for(let contract of contracts){
        match = /loanId=(.*?)&loaninvestorId=(.*?)$/.exec(contract.downloadUrl)
        if(match&&match.length==3){
            contractId = match[1]
            contractFile = `loanagreement_${contractId}.pdf`
            filePath = ChromeDownloadPath + "/" + contractFile
            dstPath = PlanPath + "/" + contractFile
            if (!fs.existsSync(filePath)&&!fs.existsSync(dstPath)) {
                log.error(`${contractFile} not exist,maybe download fail,retry contract ${contract.name}`)
                missingContracts.push(contract)
            }else{
                if(fs.existsSync(filePath))
                {
                    fs.copyFileSync(filePath, dstPath)
                    fs.unlinkSync(filePath)
                }
            }
        }
    }
    return missingContracts;
}

const parseDownloadContract = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan.planName,contractFilePath,result
    for(let contract of contracts){
        try{
            contractFilePath = `${PlanPath}/loanagreement_${contract.id}.pdf`
            result = await parse.parsePdf(contractFilePath)
            contract = Object.assign(contract,result.parsed)
            log.info(`parse contract pdf ${contractFilePath} success`)
        }catch(e){
            log.error(`parse contract pdf ${contractFilePath} fail:` + e.stack||e)
        }
    }
    return contracts
}

const saveContract = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan.planName
    await mkdirp(PlanPath)
    contracts = contracts.map(contract=>Object.assign(contract,plan))
    let header = [{id: 'name', title: '合同名称'},
        {id: 'myAmount', title: '我的待收'},
        {id:'planName',title:'定存宝名'},
        {id:'planAmount',title:'定存宝投资额'},
    ]
    if(!SkipDetail){
        header = header.concat([{id: 'borrowerType', title: '借款人类型'},
            {id: 'amount', title: '金额'},
            {id: 'rate', title: '利率%'},
            {id: 'term', title: '期限(月)'},
            {id: 'payType', title: '还款方式'},
            {id: 'payStartDate', title: '开始时间'},
            {id: 'expired', title: '是否逾期'}])
    }
    if(!SkipParse){
        header = header.concat([
            {id: 'beginDate', title: '合同开始日期'},
            {id: 'endDate', title: '合同结束日期'},
            {id: 'expired', title: '是否逾期'},
            {id: 'myLendsStr', title: '实际出借'},
            {id: 'real', title: '是否包含实际出借'},
            {id: 'borrowerType', title: '借款人类型'},
            {id: 'borrowerName', title: '借款人名'},
            {id: 'borrowerYooliID', title: '借款人ID'},
            {id: 'borrowerID', title: '借款人证件号'},
            {id: 'contractType', title: '还款方式'},
            {id: 'lender', title: '丙方'},
            {id: 'assurance', title: '担保方'}
        ])
    }
    header = header.concat([
    {id: 'infoUrl', title:'合同链接'},
    {id: 'detailUrl', title:'合同详情链接'},
    {id: 'creditUrl', title:'债转链接'}])
    const csvWriter = createCsvWriter({
        path: PlanPath + '/contracts.csv',
        header: header
    });
    await csvWriter.writeRecords(contracts)
    await jsonfile.writeFileSync(PlanPath + '/contracts.json',contracts, { spaces: 2 })
    if(SaveSearch){
        try{
            await search.batchSave(yooli_contract_prefix + currDate,contracts)
        }catch(e){
            log.error(`fail to save all contracts in plan ${plan.planName} to ElasticSearch:` + e.stack||e)
        }
    }
    log.info(`save contract in plan ${plan.planName} success`)
}

const downloadContracts = async ()=>{
    let plans = await getPlans()
    if(PlanName){
        let todos = PlanName.split(','),find
        plans = plans.filter((plan)=>{
            find = false;
            for(let todo of todos){
                find = plan.planName.includes(todo)
                if(find)
                    break;
            }
            return find;
        })
    }
    for(let plan of plans){
        let contracts = await getContract(plan)
        if(!SkipDetail){
            contracts = await getContractDetail(plan,contracts)
            log.info(`get contract detail in plan ${plan.planName} success`)
        }
        if(!SkipDownload){
            await downloadContract(plan,contracts)
            log.info(`download contract in plan ${plan.planName} success`)
        }
        if(!SkipParse){
            await parseDownloadContract(plan,contracts)
            log.info(`parse contract in plan ${plan.planName} success`)
        }
        await saveContract(plan,contracts)
    }
}

const download = async (username,passwd)=>{
    await init()
    await login(username,passwd)
    await downloadContracts()
    await browser.close()
    return currDate
}

module.exports = {download}


