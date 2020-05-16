'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const log = require('simple-node-logger').createSimpleLogger('download.log');
const moment = require('moment')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const search = require('./search')
const search_index_prefix = 'yooli_contract_'
const parse = require('./parse')
const jsonfile = require('jsonfile')

let browser,page,currDate,downloadPath,downloadAllPath,allBorrowerFilePath,
    downloadAllFilePath,allContracts=[],allBorrowers=[],
    allContractFileName = 'contracts.json',allBorrowerFileName = 'borrowers.json',
    ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH'],
    PlanName = process.env['PlanName'],
    ChromeHeadlessMode = process.env['CHROME_HEADLESS_MODE']?(process.env['CHROME_HEADLESS_MODE']=='true'):false,
    WeixinLogin = process.env['WeixinLogin']?(process.env['WeixinLogin']=='true'):true,
    SkipDownload = process.env['SkipDownload']?(process.env['SkipDownload']=='true'):false,
    SkipDetail = process.env['SkipDetail']?(process.env['SkipDetail']=='true'):true,
    SkipParse = process.env['SkipParse']?(process.env['SkipParse']=='true'):false,
    SaveSearch = process.env['SaveSearch']?(process.env['SaveSearch']=='true'):true,
    DownloadRetryInterval = parseInt(process.env['DownloadRetryInterval'])||10000,
    DefaultTimeout = parseInt(process.env['DefaultTimeout'])||30000,
    DownloadPolicy = process.env['DownloadPolicy']||'pdf',
    SkipCheatCheck = process.env['SkipCheatCheck']?(process.env['SkipCheatCheck']=='true'):true,
    CheckCheatMaxNum = parseInt(process.env['CheckCheatMaxNum'])||20,
    CheckCheatMaxPageNum = parseInt(process.env['CheckCheatMaxPageNum'])||10,
    CheckCheatStartYear = process.env['CheckCheatStartYear']||'2015',
    DownloadMaxPage = parseInt(process.env['DownloadMaxPage'])||1000,
    DownloadRetryTime = parseInt(process.env['DownloadRetryTime'])||5

const sleep = async (ms)=>{
    return new Promise(resolve => setTimeout(resolve, ms));
}

const loadPageOption = {waitUntil:'domcontentloaded'}

const init = async ()=>{
    browser = await puppeteer.launch({defaultViewport: null,headless: ChromeHeadlessMode, slowMo: 50, executablePath:ChromeBinPath});
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(DefaultTimeout);
    await page.setDefaultTimeout(DefaultTimeout)
    currDate = new Date().toISOString().replace(/(T.+)/,'').replace(/\-/g,'')
    downloadPath = path.resolve("download",currDate)
    downloadAllPath = path.resolve("download","all")
    downloadAllFilePath = downloadAllPath + '/' + allContractFileName
    allBorrowerFilePath = downloadAllPath + '/' + allBorrowerFileName
    await mkdirp(downloadAllPath)
    if (fs.existsSync(downloadAllFilePath)) {
        allContracts = jsonfile.readFileSync(downloadAllFilePath)
    }
    if (fs.existsSync(allBorrowerFilePath)) {
        allBorrowers = jsonfile.readFileSync(allBorrowerFilePath)
    }
    if(SaveSearch){
        try{
            await search.init()
            await search.del(search_index_prefix + currDate)
        }catch(e){
            //just ignore
        }
        log.info('init elasticsearch success')
    }
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
    let maxPlanPageNum
    try{
        maxPlanPageNum = await page.$eval(planPageNumSelector, element => {
            return element.innerText
        });
    }catch(err){
        maxPlanPageNum = 1
    }
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
    let maxContractPageNum
    try{
        maxContractPageNum = await page.$eval(contractPageNumSelector, element => {
            return element.innerText
        });
    }catch(err){
        maxContractPageNum = 1;
    }
    maxContractPageNum = parseInt(maxContractPageNum)
    maxContractPageNum = maxContractPageNum>DownloadMaxPage?DownloadMaxPage:maxContractPageNum
    //get all contract links
    let getContractsInPage = async ()=>{
        let details = await page.$$eval(contractDetailSelector, anchors => {
            return [].map.call(anchors, a => {
                return {detailUrl:a.href}
            })});
        let downloads = await page.$$eval(contractDownloadSelector, anchors => {
            return [].map.call(anchors, a => {
                let regex = /.*loanId=(\d+)\&loaninvestorId=(\d+)$/,
                    loanId,loaninvestorId,creditUrl,downloadUrl,match
                match = regex.exec(a.href)
                if(match&&match.length==3){
                    loanId = match[1]
                    loaninvestorId = match[2]
                    downloadUrl = a.href
                    creditUrl = `https://www.yooli.com/contractCreditRights.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                    return {loanId,loaninvestorId,downloadUrl,creditUrl}
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
    let plan_amount = 0
    for(let contract of contracts){
        plan_amount+=contract.myAmount
    }
    plan.planActualAmount = plan_amount
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
            log.info(`get contract ${contract.id} detail success`)
        }catch (e) {
            log.error(e.stack||e)
            log.error(`fail to get detail of contract ${contract.id} in plan ${plan.planName}`)
        }
    }
    return contracts
}


const getDownloadToken = async (url,waitUrl)=>{
    await page.goto(url)
    const response = await page.waitForResponse(response => response.url() === waitUrl && response.status() === 200);
    let json = await response.json()
    if(json.verify){
        return json.resultCode
    }
}

const screenshotContract = async (plan,contracts)=>{
    const ContractImageSelector = 'img[src*=\'/viewSignature.session.action\']'
    let PlanPath = downloadPath + "/" + plan.planName
    for(let contract of contracts) {
        try {
            await page.goto(contract.detailUrl, loadPageOption)
            await page.waitForSelector(ContractImageSelector,{timeout:DefaultTimeout});
            await page.click(ContractImageSelector)
            await page.screenshot({path: `${PlanPath}/${contract.id}.png`, fullPage: true});
        } catch (e) {
            log.error(`contract ${contract.detailUrl} download fail!` + e.stack||e)
        }
    }
}

const downloadContract = async (plan,contracts)=>{
    let retryContracts = [],downloaded;
    const VerifyCodeSelector = "div.slide-btn"
    let PlanPath = downloadPath + "/" + plan.planName
    await mkdirp(PlanPath)

    const checkDownloaded = async (plan,contract)=>{
        let exist = false
        let PlanPath = downloadPath + "/" + plan.planName
        let contractFile = `loanagreement_${contract.id}.pdf`
        let tmpPath = ChromeDownloadPath + "/" + contractFile
        let dstPath = PlanPath + "/" + contractFile
        let allPath = downloadAllPath + "/" + contractFile
        if (fs.existsSync(tmpPath)||fs.existsSync(dstPath)||fs.existsSync(allPath)) {
            exist = true
        }
        return exist;
    }

    const findMissingAndMoveDownloaded = async (plan,contracts)=>{
        let contractFile,tmpPath,dstPath,allPath,missingContracts = [],PlanPath = downloadPath + "/" + plan.planName
        for(let contract of contracts){
            contractFile = `loanagreement_${contract.id}.pdf`
            tmpPath = ChromeDownloadPath + "/" + contractFile
            dstPath = PlanPath + "/" + contractFile
            allPath = downloadAllPath + "/" + contractFile
            if(!fs.existsSync(dstPath)){
                if (!fs.existsSync(tmpPath)&&!fs.existsSync(allPath)) {
                    log.warn(`maybe download fail,will retry contract ${contract.id}`)
                    missingContracts.push(contract)
                }else{
                    if(fs.existsSync(tmpPath))
                    {
                        fs.copyFileSync(tmpPath, dstPath)
                        fs.copyFileSync(tmpPath, allPath)
                        fs.unlinkSync(tmpPath)
                    }else if(fs.existsSync(allPath)){
                        fs.copyFileSync(allPath, dstPath)
                    }
                }
            }
        }
        return missingContracts;
    }

    // let downloadToken = await getDownloadToken(contracts[0].downloadUrl,'https://www.yooli.com/rest/slideVerify/verifyX')
    for(let contract of contracts){
        try{
            downloaded = await checkDownloaded(plan,contract)
            if(!downloaded){
                if(contract.retryTime>=DownloadRetryTime) {
                    log.error(`contract ${contract.id} retry too many times still fail,so skip`)
                }else{
                    await page.goto(contract.downloadUrl, loadPageOption)
                    await page.waitForSelector(VerifyCodeSelector);
                    await page.waitForSelector(VerifyCodeSelector, {hidden: true, timeout: DefaultTimeout});
                    log.info(`contract ${contract.id} downloading`)
                }
            }else{
                log.info(`contract ${contract.id} already downloaded,just skip`)
            }
        }catch(e){
            log.warn(`contract ${contract.id} download fail,will retry:` + e.stack||e)
        }finally {
            if(contract.retryTime>=0){
                contract.retryTime +=1
            }else{
                contract.retryTime = 0
            }
        }
    }
    await sleep(DownloadRetryInterval)
    retryContracts = await findMissingAndMoveDownloaded(plan, contracts)
    retryContracts = retryContracts.filter((contract)=>{
        return contract.retryTime<DownloadRetryTime
    })
    if (retryContracts&&retryContracts.length) {
        log.warn(`retry missing contracts:${retryContracts.map(contract=>contract.id)} in plan ${plan.planName}`)
        await downloadContract(plan, retryContracts)
    }
}

const parseDownloadContract = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan.planName,contractFilePath,
        result,exist,valid, checkFields = ['borrowerName','borrowerType','beginDate','assurance','contractType']
    let checkContractField = (contract)=>{
        for(let field of checkFields){
            if(contract[field]==undefined){
                return false
            }
        }
        if(contract['borrowerType']=='个人'){
            if(contract['borrowerYooliID']==undefined) {
                return false
            }
            if(contract['borrowerID']==undefined) {
                return false
            }
        }
        return true
    }
    for(let contract of contracts){
        delete contract['retryTime']
        Object.assign(contract,plan)
        exist = allContracts.find((exist)=>{
            return exist.id === contract.id
        })
        if(exist){
            Object.assign(contract,exist)
        }else {
            try{
                contractFilePath = `${PlanPath}/loanagreement_${contract.id}.pdf`
                if (fs.existsSync(contractFilePath)){
                    result = await parse.parsePdf(contractFilePath)
                    Object.assign(contract,result.parsed)
                    valid = checkContractField(contract)
                    if(!valid){
                        log.warn(`contract ${contract.id} parse success but incomplete`)
                    }else{
                        log.info(`contract ${contract.id} parse success`)
                    }
                    allContracts.push(contract)
                }else {
                    log.warn(`contract ${contract.id} download fail,ignore parse`)
                }
            }catch(e){
                log.error(`contract ${contract.id} parse fail:` + e.stack||e)
            }
        }
    }
    log.info(`${contracts.length} contracts in plan ${plan.planName} crawled`)
    let filtered_contracts = contracts.filter((contract)=>{
        let valid = checkContractField(contract)
        if(!valid){
            log.warn(`contract ${contract.id} not incomplete`)
        }
        return valid
    })
    log.info(`${filtered_contracts.length} contracts in plan ${plan.planName} crawled and parsed`)
}

const saveContract = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan.planName,contractFilePath,result,valid,exist
    await mkdirp(PlanPath)
    const writeCsv = false
    if(writeCsv){
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
                {id: 'myLendsTotal', title: '实际出借'},
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
    }
    await jsonfile.writeFileSync(PlanPath + '/' + allContractFileName,contracts, { spaces: 2 })
    if(SaveSearch){
        try{
            await search.batchSave(search_index_prefix + currDate,contracts)
        }catch(e){
            log.error(`fail to save all contracts in plan ${plan.planName} to ElasticSearch:` + e.stack||e)
        }
    }
    await jsonfile.writeFileSync(downloadAllFilePath,allContracts, { spaces: 2 })
    if(!SkipCheatCheck){
        await jsonfile.writeFileSync(allBorrowerFilePath,allBorrowers, { spaces: 2 })
    }
    log.info(`save contract in plan ${plan.planName} success`)
}

const findCheat = async(plan,contracts)=>{

    const VerifyCodeInvalid = 'code invalid'

    let checkedNum = 0

    const IdProvinceMapping = {
        "11":'京',"12":'津',"13":'冀',"14":'晋',"15":"蒙",
        "21":"辽","22":'吉',"23":'黑',
        "31":'沪',"32":'苏',"33":'浙',"34":'皖',"35":'闽',"36":'赣',"37":'鲁',
        "41":'豫',"42":'鄂',"43":"湘","44":'粤',"45":'桂',"46":'琼',
        "50":'渝',"51":'川',"52":'贵',"53":'云',"54":'藏',
        "61":'陕',"62":'甘',"63":'青',"64":'宁',"65":'新'
    }

    let sameId = (src,dst)=>{
        return (src.substr(0,2)===dst.substr(0,2))&&(src.substr(src.length-2)===dst.substr(dst.length-2))
    }

    let provinceInEnum = (province)=>{
        for(let key in IdProvinceMapping){
            if(province == IdProvinceMapping[key]){
                return true
            }
        }
        return false
    }

    let needCheckID = (contract,borrowerName,info)=>{
        let check = false
        let year = /\(([^)]+)\)/.exec(info)
        if(year&&year.length==2){
            year = year[1]
        }else{
            year = /（([^)]+)）/.exec(info)
            if(year&&year.length==2) {
                year = year[1]
            }
        }
        let province = /\)\s*(.*?)\d/.exec(info)
        if(province&&province.length==2){
            province = province[1].substr(0,1)
        }else{
            province = /）\s*(.*?)\d/.exec(info)
            if(province&&province.length==2){
                province = province[1].substr(0,1)
            }
        }
        let mappingProvince = IdProvinceMapping[contract.borrowerID.substr(0,2)]
        if(borrowerName!=contract.borrowerName){
            check = false
        }else{
            if(province==mappingProvince){
                check = true
            }else{
                if(year&&year>=CheckCheatStartYear&&!provinceInEnum(province)){
                    check = true
                }
            }
        }
        return check
    }

    let isIdNum = (id)=>{
        return id.replace(/\s/,'').match(/\d{2}.*?\d{2}$/)
    }

    let findBorrower = (contract)=>{
        return allBorrowers.find((borrower)=>{
            let found = false
            if(contract.borrowerType==='个人'){
                found = (borrower.borrowerName===contract.borrowerName&&borrower.borrowerYooliID === contract.borrowerYooliID)
            }else if(contract.borrowerType==='公司'){
                found = (borrower.borrowerName===contract.borrowerName)
            }
            return found
        })
    }

    let checkID = async (contract,element)=>{
        let cheat = false,id,target,targetPage;
        const link = await element.$('a');
        try{
            await link.click()
            target = await browser.waitForTarget(target => target.url() === 'http://zxgk.court.gov.cn/zhzxgk/detailZhcx.do',{timeout:DefaultTimeout});
            targetPage = await target.page()
        }catch(err){
            log.error('captcha invalid!' + err.stack ||err)
            throw new Error(VerifyCodeInvalid)
        }
        id = await targetPage.$eval('table tr:nth-child(2) td:nth-child(2)', element => {
            return element.innerText
        })
        if(!isIdNum(id)){
            id = await targetPage.$eval('table tr:nth-child(3) td:nth-child(2)', element => {
                return element.innerText
            })
            if(!isIdNum(id)){
                id = await targetPage.$eval('table tr:nth-child(4) td:nth-child(2)', element => {
                    return element.innerText
                })
            }
        }
        if (sameId(id, contract.borrowerID)) {
            cheat = true;
            log.warn(`contract ${contract.id} is cheat!!!`)
        }
        await targetPage.close()
        return cheat;
    }

    let checkIDs = async (contract) => {
        let elements = await page.$$('#result-block #tbody-result tr'),cheat=false;
        for (let [_, element] of elements.entries()) {
            const borrowerName = await element.$eval('td:nth-child(2)',ele=>ele.innerText)
            const info = await element.$eval('td:nth-child(4)',ele=>ele.innerText)
            if(needCheckID(contract,borrowerName,info)){
                try{
                    cheat = await checkID(contract,element)
                }catch(err){
                    if(err.message===VerifyCodeInvalid){
                        await page.click('img#captchaImg')
                        await page.waitForSelector('#yzm-group div.alert-danger',{visible: true});
                        await page.waitForSelector('#yzm-group div.alert-success',{visible: true});
                    }else{
                        throw err
                    }
                }
                checkedNum++
                if(cheat){
                    break
                }
            }
        }
        return cheat
    }

    for(let contract of contracts){
        let exist = allContracts.find((exist)=>{
            return exist.id === contract.id
        })
        if(exist.cheat===undefined){
            try{
                let existBorrower = findBorrower(contract)
                if(existBorrower){
                    contract.cheat = existBorrower.cheat
                    exist.cheat = existBorrower.cheat
                    continue
                }
                let cheat = false;
                await page.goto(`http://zxgk.court.gov.cn/zhzxgk/`,loadPageOption);
                await page.waitForSelector('#pName');
                await page.type('#pName', contract.borrowerName);
                await sleep(200)
                await page.focus('#yzm')
                await page.waitForSelector('#yzm-group div.alert-success',{visible: true});
                await page.click('#yzm-group button.btn-zxgk')
                await page.waitForSelector('#page-div span#totalPage-show');
                let maxPageNum = await page.$eval('#page-div span#totalPage-show', element => {
                    return parseInt(element.innerText)
                });
                maxPageNum = Math.min(maxPageNum,CheckCheatMaxPageNum)
                if(maxPageNum==0){
                    cheat = false
                }
                else if(maxPageNum&&contract.borrowerType=='公司'){
                    cheat = true
                }else{
                    checkedNum = 0
                    for (let i = 0; i < maxPageNum; i++) {
                        cheat = await checkIDs(contract)
                        if (cheat || i == maxPageNum - 1 || checkedNum>=CheckCheatMaxNum) {
                            break
                        }
                        await page.waitForSelector('#next-btn')
                        await page.click('#next-btn')
                        await sleep(500)
                    }
                }
                contract.cheat = cheat
                exist.cheat = cheat
                allBorrowers.push(
                    {
                        borrowerName: contract.borrowerName,
                        borrowerType: contract.borrowerType,
                        borrowerYooliID: contract.borrowerYooliID,
                        cheat: cheat
                    }
                )
                log.info(`check cheat in contract ${contract.id} success,cheat is ${cheat}`)
            }catch(err){
                log.error(`check cheat in contract ${contract.id} fail!` + err.stack ||err)
            }
        }
    }
}

const download = async (username,passwd)=>{
    await init()
    await login(username,passwd)
    let plans = await getPlans(),todos,find
    if(PlanName){
        todos = PlanName.split(',')
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
        if(!SkipCheatCheck){
            let saveFileTimer = setInterval(async () => {
                await saveContract(plan, contracts)
                log.info('periodical save contracts success')
            }, 120000);
            await findCheat(plan,contracts)
            clearInterval(saveFileTimer)
            log.info(`check cheat in plan ${plan.planName} success`)
        }
        await saveContract(plan,contracts)
    }
    await browser.close()
    return currDate
}

module.exports = {download,search_index_prefix}


