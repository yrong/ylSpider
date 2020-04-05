'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const log = require('simple-node-logger').createSimpleLogger('download.log');
const moment = require('moment')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const search = require('./search')
const yooli_contract_prefix = 'yooli_contract_'
require('dotenv').config()

let browser,page,currDate,downloadPath,
    ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH'],
    ChromeHeadlessMode = (process.env['CHROME_HEADLESS_MODE']=='true'),
    SkipDownload = (process.env['SkipDownload']=='true'),
    SaveSearch = (process.env['SaveSearch']=='true'),
    WeixinLogin = (process.env['Weixin_Login']=='true'),
    PlanName = process.env['PlanName'],
    DownloadInterval = parseInt(process.env['DownloadInterval']),
    DownBatchSize = parseInt(process.env['DownBatchSize']),
    DefaultTimeout = parseInt(process.env['DefaultTimeout'])

const sleep = async (ms)=>{
    return new Promise(resolve => setTimeout(resolve, ms));
}

const init = async ()=>{
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
    ];
    browser = await puppeteer.launch({args, headless: ChromeHeadlessMode, slowMo: 50,
        timeout:DefaultTimeout, executablePath:ChromeBinPath});
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(DefaultTimeout);
    await page.setDefaultTimeout(DefaultTimeout)
    currDate = new Date().toISOString().replace(/(T.+)/,'').replace(/\-/g,'')
    downloadPath = path.resolve("download",currDate)
    await mkdirp(downloadPath)
}

const login = async (username,passwd)=>{
    log.info('start to login')
    await page.goto('https://www.yooli.com/',{waitUntil:'domcontentloaded'});
    const loginSelector = "a[href='/secure/login/'][data-hm='navigation, nav_login']";
    await page.waitForSelector(loginSelector);
    await page.click(loginSelector);
    await page.waitForSelector('#loginBt');
    log.info('to login page success')
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
    await page.goto('https://www.yooli.com/financePlanRecords.session.action',{waitUntil:'domcontentloaded'});
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
                let pos = dataId.indexOf(':'),length = dataId.length
                return {planId:dataId.substr(0,pos),planName:dataId.substr(pos+1,length)}
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

const findMissingAndMoveFinished = async (plan,contracts)=>{
    let contractFile,contractId,match,filePath,missingContracts = [],PlanPath = downloadPath + "/" + plan.name
    for(let contract of contracts){
        match = /loanId=(.*?)&loaninvestorId=(.*?)$/.exec(contract.downloadUrl)
        if(match&&match.length==3){
            contractId = match[1]
            contractFile = `loanagreement_${contractId}.pdf`
            filePath = ChromeDownloadPath + "/" + contractFile
            if (!fs.existsSync(filePath)) {
                log.error(`${contractFile} not exist,maybe download fail,retry contract ${contract.name}`)
                missingContracts.push(contract)
            }else{
                fs.copyFileSync(filePath, PlanPath + "/" + contractFile)
                fs.unlinkSync(filePath)
            }
        }
    }
    return missingContracts;
}

const saveContract = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan.planName
    await mkdirp(PlanPath)
    contracts = contracts.map(contract=>Object.assign(contract,plan))
    const csvWriter = createCsvWriter({
        path: PlanPath + '/contracts.csv',
        header: [
            {id: 'name', title: '名称'},
            {id: 'borrowerType', title: '借款人类型'},
            {id: 'amount', title: '金额'},
            {id: 'rate', title: '利率%'},
            {id: 'timeTerm', title: '期限(月)'},
            {id: 'payType', title: '还款方式'},
            {id: 'payStartDate', title: '开始时间'},
            {id: 'myAmount', title: '我的待收'},
            {id: 'expired', title: '是否逾期'}
        ]
    });
    await csvWriter.writeRecords(contracts)
    if(SaveSearch){
        await search.batchSave(yooli_contract_prefix + currDate,contracts)
    }
    log.info(`success to save all contracts in plan ${plan.planName}`)
}

const getContract = async(plan)=>{
    const contractInfoSelector = "a[href^='/dingcunbao/item']";
    const contractDownloadSelector = "a[onclick^='downloadVerify']";
    const myAmountSelector = '#financePlanLoanInvestorList div.plan-post:not(:first-child) ul li.col_2'
    const contractPageNumSelector = "div#planLoanListPager a:nth-last-child(2)";
    const lendRateSelector = `div#main em#rate`
    const lendAmountSelector = `div#main ul.items:nth-child(1) li.y_2`
    const lendDateSelector = `div#main ul.items:nth-child(2) li.y_2`
    await page.goto(`https://www.yooli.com/userPlan/detail/${plan.planId}.html`,{waitUntil:'domcontentloaded'});
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
        let downloads = await page.$$eval(contractDownloadSelector, anchors => {
            return [].map.call(anchors, a => {
                let onclickValue = a.attributes.onclick.value,
                    regex = /^downloadVerify\("(\d+)","(\d+)"\)$/,
                    loanId,loaninvestorId,downloadUrl,match
                match = regex.exec(onclickValue)
                if(match&&match.length==3){
                    loanId = match[1]
                    loaninvestorId = match[2]
                    downloadUrl = `https://www.yooli.com/contractDetailDownload.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                    return {loanId,loaninvestorId,downloadUrl}
                }
            })});
        let infos = await page.$$eval(contractInfoSelector, anchors => {
            return [].map.call(anchors, a => {
                return {name:a.innerText,infoUrl:a.href}
            })});
        let myAmounts = await page.$$eval(myAmountSelector, eles => {
            return [].map.call(eles, ele => {
                return {myAmount:parseFloat(ele.innerText)}
            })});
        for(let i=0;i<infos.length;i++){
            Object.assign(infos[i],downloads[i],myAmounts[i],{id:downloads[i].loanId})
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
    log.info(`success to get all contracts in plan ${plan.planName}`)
    return contracts
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
            await page.goto(contract.infoUrl,{waitUntil:'domcontentloaded'})
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
            log.info(`success to get contract ${contract.name}`)
        }catch (e) {
            log.error(e.stack||e)
            log.error(`fail to get detail of contract ${contract.name} in plan ${plan.planName}`)
        }
    }
    log.info(`success to get all detail contracts in plan ${plan.planName}`)
    return contracts
}

const downloadContractsInPlan = async (plan,contracts)=>{
    let cnt = 0,retryContracts = [];
    for(let contract of contracts){
        try{
            await page.goto(contract.downloadUrl)
            //comes here means download fail,curios!!
            log.error(`{link:${contract.name}} download fail,will retry`)
            await sleep(DownloadInterval);
        }catch(e){//just ignore
            await sleep(500);
            if(e.message.startsWith('net::ERR_ABORTED')){
                //comes here means download success
                log.info(`{link:${contract.name}} download success`)
            }else{
                log.error(e.stack||e)
            }
            cnt++;
            if(cnt==DownBatchSize){
                log.info(`just wait after download every ${DownBatchSize} files`)
                await sleep(DownloadInterval);
                cnt=0
            }
        }
    }
    await sleep(DownloadInterval)
    retryContracts = await findMissingAndMoveFinished(contracts)
    if(retryContracts.length){
        log.info(`retry contracts:${JSON.stringify(retryContracts)}`)
        await downloadContractsInPlan(plan,retryContracts)
    }
}

const downloadContracts = async (plans)=>{
    if(PlanName){
        let todos = PlanName.split(',')
        plans = plans.filter((plan)=>{
            return todos.includes(plan.planName)
        })
    }
    for(let plan of plans){
        let contracts = await getContract(plan)
        contracts = await getContractDetail(plan,contracts)
        await saveContract(plan,contracts)
        if(!SkipDownload){
            log.info(`start to download contract in plan ${plan.planName}`)
            await downloadContractsInPlan(plan,contracts)
            log.info(`download contract in plan ${plan.planName} success`)
        }
    }
}

const download = async (username,passwd)=>{
    await init()
    await login(username,passwd)
    let plans = await getPlans()
    await downloadContracts(plans)
    await browser.close()
    return currDate
}

module.exports = {download}


