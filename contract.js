'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const jsonfile = require('jsonfile')
const log = require('simple-node-logger').createSimpleLogger('download.log');
require('dotenv').config()

let browser,page,datePath,downloadPath,
    ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH'],
    ChromeHeadlessMode = (process.env['CHROME_HEADLESS_MODE']=='true'),
    MetaOnly = (process.env['MetaOnly']=='true'),
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
    browser = await puppeteer.launch({args, headless: ChromeHeadlessMode, slowMo: 50,executablePath:ChromeBinPath});
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(DefaultTimeout);
    await page.setDefaultTimeout(DefaultTimeout)
    datePath = `/${new Date().toISOString().replace(/(T.+)/,'')}`
    downloadPath = path.resolve("./download" + datePath)
    await mkdirp(downloadPath)
}

const login = async (username,passwd)=>{
    log.info('start to login')
    await page.goto('https://www.yooli.com/');
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
    log.info('start to get plans')
    const planSelector = "div#itemCurrentContent ul li";
    const planPageNumSelector = "div#financeCurrentPage a:nth-last-child(2)";
    await page.goto('https://www.yooli.com/financePlanRecords.session.action');
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
                return {id:dataId.substr(0,pos),name:dataId.substr(pos+1,length)}
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
    log.info(`get plans success:${JSON.stringify(plans)}`)
    return plans
}

const getContractsInPlan = async(plan)=>{
    log.info(`start to get contract url in plan ${plan.name}`)
    const contractInfoSelector = "a[href^='/dingcunbao/item']";
    const contractDownloadSelector = "a[onclick^='downloadVerify']";
    const contractPageNumSelector = "div#planLoanListPager a:nth-last-child(2)";
    const lendRateSelector = `div#main em#rate`
    const lendAmountSelector = `div#main ul.items:nth-child(1) li.y_2`
    const lendDateSelector = `div#main ul.items:nth-child(2) li.y_2`
    await page.goto(`https://www.yooli.com/userPlan/detail/${plan.id}.html`);
    await page.waitForSelector(contractInfoSelector);
    let lendRate = await page.$eval(lendRateSelector, element => {
        return element.innerText.split('+').reduce((total,rate)=>{
            return total + parseFloat(rate.replace('%',''))
        },0)
    });
    let lendAmount = await page.$eval(lendAmountSelector, element => {
        return parseFloat(element.innerText.replace(',','').replace('元',''))
    });
    let lendDate = await page.$eval(lendDateSelector, element => {
        return element.innerText.replace(/\./g,'-')
    });
    Object.assign(plan,{lendRate,lendAmount,lendDate})
    //get maxPageNum for contracts
    let maxContractPageNum = await page.$eval(contractPageNumSelector, element => {
        return element.innerText
    });
    maxContractPageNum = parseInt(maxContractPageNum)
    //get all contract links
    let getContractLinkInPage = async ()=>{
        let downloads = await page.$$eval(contractDownloadSelector, anchors => {
            return [].map.call(anchors, a => {
                let onclickValue = a.attributes.onclick.value,
                    regex = /^downloadVerify\("(\d+)","(\d+)"\)$/,loanId,loaninvestorId,match
                match = regex.exec(onclickValue)
                if(match&&match.length==3){
                    loanId = match[1]
                    loaninvestorId = match[2]
                    return `https://www.yooli.com/contractDetailDownload.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                }
            })});
        let infos = await page.$$eval(contractInfoSelector, anchors => {
            return [].map.call(anchors, a => {
                return {name:a.innerText,infoUrl:a.href}
            })});
        for(let i=0;i<infos.length;i++){
            Object.assign(infos[i],{downloadUrl:downloads[i]})
        }
        return infos
    }
    let contractLinks = await getContractLinkInPage()
    for(let i=2;i<=maxContractPageNum;i++){
        const pageSelector = `a[href='javascript:getFinancePlanLoanInvestorList(${i});']`
        try{
            await page.click(pageSelector)
            await page.waitForSelector(contractInfoSelector);
            contractLinks = contractLinks.concat(await getContractLinkInPage());
        }catch(e){
        }
    }
    log.info(`success to get contract url in plan ${plan} with contract links:${JSON.stringify(contractLinks)}`)
    return contractLinks
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

const writeMeta = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan.name
    await mkdirp(PlanPath)
    jsonfile.writeFileSync(PlanPath + '/contracts.json', {plan,contracts}, { spaces: 2 })
}

const downloadContracts = async (plans)=>{
    if(PlanName){
        let todos = PlanName.split(',')
        plans = plans.filter((plan)=>{
            return todos.includes(plan.name)
        })
    }
    let metaAll = []
    for(let plan of plans){
        let contracts = await getContractsInPlan(plan)
        await writeMeta(plan,contracts)
        metaAll.push({plan,contracts})
        if(!MetaOnly){
            log.info(`start to download contract in plan ${plan.name}`)
            await downloadContractsInPlan(plan,contracts)
            log.info(`download contract in plan ${plan.name} success`)
        }
    }
    jsonfile.writeFileSync(downloadPath + '/contracts.json', metaAll, { spaces: 2 })
}

const download = async (username,passwd)=>{
    await init()
    await login(username,passwd)
    let plans = await getPlans()
    await downloadContracts(plans)
    await browser.close()
    return datePath
}

module.exports = {download}


