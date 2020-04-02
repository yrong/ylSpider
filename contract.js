'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const jsonfile = require('jsonfile')
const log = require('simple-node-logger').createSimpleLogger('download.log');
require('dotenv').config()

let browser,page,downloadPath,dateUrlPath,
    ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH'],
    ChromeHeadlessMode = (process.env['CHROME_HEADLESS_MODE']=='true'),
    MetaOnly = (process.env['MetaOnly']=='true'),
    WeixinLogin = (process.env['Weixin_Login']=='true'),
    PlanID = process.env['PlanID']

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
    await page.setDefaultNavigationTimeout(180000);
    await page.setDefaultTimeout(180000)
    dateUrlPath = `/download/${new Date().toISOString().replace(/(T.+)/,'')}`
    downloadPath = path.resolve("." + dateUrlPath)
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
                return dataId.substr(0,dataId.indexOf(':'))
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
    log.info(`get plans success:` + plans)
    return plans
}

const getContractsInPlan = async(plan)=>{
    log.info('start to get contract url in plan ',plan)
    const contractDownloadSelector = "a[href^='/contractDetailDownload.session.action']";
    const contractPageNumSelector = "div#planLoanListPager a:nth-last-child(2)";
    await page.goto(`https://www.yooli.com/userPlan/detail/${plan}.html`);
    await page.waitForSelector(contractDownloadSelector);
    //get maxPageNum for contracts
    let maxContractPageNum = await page.$eval(contractPageNumSelector, element => {
        return element.innerText
    });
    maxContractPageNum = parseInt(maxContractPageNum)
    //get all contract links
    let getContractLinkInPage = async ()=>{
        return await page.$$eval(contractDownloadSelector, anchors => {
            return [].map.call(anchors, a => {
                return a.href
            })});
    }
    let contractLinks = await getContractLinkInPage()
    for(let i=2;i<=maxContractPageNum;i++){
        const pageSelector = `a[href='javascript:getFinancePlanLoanInvestorList(${i});']`
        try{
            await page.click(pageSelector)
            await page.waitForSelector(contractDownloadSelector);
            contractLinks = contractLinks.concat(await getContractLinkInPage());
        }catch(e){
        }
    }
    log.info(`success to get contract url in plan ${plan} with contract links:${JSON.stringify(contractLinks)}`)
    return contractLinks
}

const downloadContractsInPlan = async (contracts)=>{
    let cnt = 0,retryContracts = [],interval = 10000;
    for(let contract of contracts){
        try{
            await page.goto(contract)
            //comes here means download fail,why?
            log.error(`{link:${contract}} download fail,will retry`)
            await sleep(interval);
        }catch(e){//just ignore
            await sleep(500);
            cnt++;
            if(cnt==10){
                log.info(`just wait after download every 10 files`)
                await sleep(interval);
                cnt=0
            }
            if(e.message.startsWith('net::ERR_ABORTED')){
                //comes here means download success
                log.info(`{link:${contract}} download success`)
            }else{
                log.error(e.stack||e)
            }
        }
    }
    await sleep(interval)
    retryContracts = await findMissing(contracts)
    if(retryContracts.length){
        log.info(`retry contracts as ${retryContracts}`)
        await downloadContractsInPlan(retryContracts)
    }
}

const findMissing = async (contracts)=>{
    let contractFile,contractId,match,path,missingContractLinks = []
    for(let contract of contracts){
        match = /loanId=(.*?)&loaninvestorId=(.*?)$/.exec(contract)
        if(match&&match.length==3){
            contractId = match[1]
            contractFile = `loanagreement_${contractId}.pdf`
            path = ChromeDownloadPath + "/" + contractFile
            if (!fs.existsSync(path)) {
                log.error(`${contractFile} not exist,maybe download fail,retry ${contract}`)
                missingContractLinks.push(contract)
            }
        }
    }
    return missingContractLinks;
}

const moveContracts = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan,contractFile,contractId,match,path
    for(let contract of contracts){
        match = /loanId=(.*?)&loaninvestorId=(.*?)$/.exec(contract)
        if(match&&match.length==3){
            contractId = match[1]
            contractFile = `loanagreement_${contractId}.pdf`
            path = ChromeDownloadPath + "/" + contractFile
            if (fs.existsSync(path)) {
                fs.copyFileSync(path, PlanPath + "/" + contractFile)
                fs.unlinkSync(path)
            }else{
                log.error(`${contractFile} not exist,download ${contract} fail!`)
            }
        }
    }
}

const writeMeta = async (plan,contracts)=>{
    let PlanPath = downloadPath + "/" + plan
    await mkdirp(PlanPath)
    jsonfile.writeFileSync(PlanPath + '/contracts.json', {plan,contracts}, { spaces: 2 })
}

const downloadContracts = async (plans)=>{
    if(PlanID){
        let todos = PlanID.split(',')
        plans = plans.filter((plan)=>{
            return todos.includes(plan)
        })
    }
    for(let plan of plans){
        let contracts = await getContractsInPlan(plan)
        await writeMeta(plan,contracts)
        if(!MetaOnly){
            log.info('start to download contract in plan ',plan)
            await downloadContractsInPlan(contracts)
            log.info(`download contract in plan ${plan} success`)
            await moveContracts(plan,contracts)
            log.info(`move download files for plan ${plan} success`)
        }
    }
}

const download = async (username,passwd)=>{
    await init()
    await login(username,passwd)
    let plans = await getPlans();
    await downloadContracts(plans)
    await browser.close();
    return dateUrlPath + '/contracts.json'
}

module.exports = {download}


