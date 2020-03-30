'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const jsonfile = require('jsonfile')
const log = require('simple-node-logger').createSimpleLogger('download.log');
require('dotenv').config()

let browser,page,ChromeDownloadDatePath,ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH']

const sleep = async (ms)=>{
    return new Promise(resolve => setTimeout(resolve, ms));
}

const init = async ()=>{
    browser = await puppeteer.launch({headless: false,  slowMo: 50,executablePath:ChromeBinPath});
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);
    ChromeDownloadDatePath = path.resolve('./download',new Date().toISOString().replace(/(T.+)/,''))
    await mkdirp(ChromeDownloadDatePath)
}

const login = async ()=>{
    log.info('start to login')
    await page.goto('https://www.yooli.com/');
    const loginSelector = "a[href='/secure/login/'][data-hm='navigation, nav_login']";
    await page.waitForSelector(loginSelector);
    await page.click(loginSelector);
    await page.waitForSelector('#loginBt');
    log.info('to login page success')
    await page.type('#userName', process.env['YOOLI_USER']);
    await page.type('#password', process.env['YOOLI_PASS']);
    await page.click('#checkWeekly')
    await page.click('#loginBt')
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
                return a.pathname + a.search
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
    log.info(`success to get contract url in plan ${plan} with contract links:
    ${contractLinks}`)
    return contractLinks
}

const downloadContractsInPlan = async (plan,contractLinks)=>{
    log.info('start to download contract in plan ',plan)
    for(let contractLink of contractLinks){
        try{
            await page.goto("https://www.yooli.com" + contractLink)
            await sleep(500);
            log.info(`{plan:${plan},link:${contractLink}} download success`)
        }catch(e){//just ignore
            await sleep(500);
            if(e.message.startsWith('net::ERR_ABORTED')){
                log.info(`{plan:${plan},link:${contractLink}} download success`)
            }else{
                log.error(e.stack||e)
            }
        }
    }
    log.info(`download contract in plan ${plan} success`)
}

const moveFiles = async (plan)=>{
    log.info('start to move download files for plan ',plan)
    const PlanPath = ChromeDownloadDatePath + "/" + plan
    try{
        fs.mkdirSync(PlanPath)
    }catch(e) {
        //ignore
    }
    let files = fs.readdirSync(ChromeDownloadPath)
    for (const file of files) {
        if (/^loanagreement.*\.pdf$/.test(file)) {
            fs.copyFileSync(ChromeDownloadPath + "/" + file, PlanPath + "/" + file)
            fs.unlinkSync(ChromeDownloadPath + "/" + file)
        }
    }
    log.info(`move download files for plan ${plan} success`)
}

const downloadContracts = async (plans)=>{
    let plan_contract_array = []
    for(let plan of plans){
        let contracts = await getContractsInPlan(plan)
        let plan_contract = {plan,contracts}
        plan_contract_array.push(plan_contract)
        if(process.env['MetaOnly']!='true'){
            await downloadContractsInPlan(plan,contracts)
            await moveFiles(plan)
        }
    }
    jsonfile.writeFileSync(ChromeDownloadDatePath + '/contracts.json', plan_contract_array, { spaces: 2 })
}

(async() => {
    await init()
    await login()
    let plans = await getPlans();
    await downloadContracts(plans)
    await browser.close();
})();
