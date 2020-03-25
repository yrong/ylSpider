'use strict';

const puppeteer = require('puppeteer');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async() => {
    const browser = await puppeteer.launch({headless: false,  slowMo: 250});
    const page = await browser.newPage();
    await page.goto('https://www.yooli.com/');

    //1 nav to login page,input user/pass and login
    const loginSelector = "a[href='/secure/login/'][data-hm='navigation, nav_login']";
    await page.waitForSelector(loginSelector);
    await page.click(loginSelector);
    await page.type('#userName', process.env['YOOLI_USER']);
    await page.type('#password', process.env['YOOLI_PASS']);
    await page.click('#checkWeekly')
    await page.click('#loginBt')
    const userSelector = "a[href='/userAccount.session.action']";
    await page.waitForSelector(userSelector);


    const planSelector = "div#itemCurrentContent ul li";
    const contractDownloadSelector = "a[href^='/contractDetailDownload.session.action']";
    const planPageNumSelector = "div#financeCurrentPage a:nth-last-child(2)";
    const contractPageNumSelector = "div#planLoanListPager a:nth-last-child(2)";

    //2 get id of all plans
    await page.goto('https://www.yooli.com/financePlanRecords.session.action');
    await page.waitForSelector(planSelector);
    //2.1 get maxPageNum for plans
    let maxPlanPageNum = await page.$eval(planPageNumSelector, element => {
        return element.innerText
    });
    maxPlanPageNum = parseInt(maxPlanPageNum)
    //2.2 get plans in first page
    let getPlanIdInEachPage = async()=>{
        return await page.$$eval(planSelector, plans => {
            return plans.map(plan => {
                let dataId = plan.getAttribute("data-text")
                return dataId.substr(0,dataId.indexOf(':'))
            })});
    }
    let plans = await getPlanIdInEachPage()
    //2.3 get plans in other pages
    for(let i=2;i<=maxPlanPageNum;i++){
        let pageSelector = `a[href='javascript:getFinanceCurrentPlanList(${i});']`
        await page.click(pageSelector)
        await sleep(2000);
        await page.waitForSelector(planSelector);
        plans = plans.concat(await getPlanIdInEachPage());
    }
    console.log(plans)

    //3 download contracts for each plan
    for(let plan of plans){
        await page.goto(`https://www.yooli.com/userPlan/detail/${plan}.html`);
        await sleep(2000);
        await page.waitForSelector(contractDownloadSelector);
        //3.1 get maxPageNum for contracts
        let maxContractPageNum = await page.$eval(contractPageNumSelector, element => {
            return element.innerText
        });
        maxContractPageNum = parseInt(maxContractPageNum)
        //3.2 download contracts in first page
        let getContractLinks = async ()=>{
            return await page.$$eval(contractDownloadSelector, anchors => {
                return [].map.call(anchors, a => {
                    return a.pathname + a.search
                })});
        }
        let downloadContracts = async ()=>{
            let links = await getContractLinks();
            for(let link of links){
                await page.click(`a[href='${link}'`)
                await sleep(2000);
            }
        }
        await downloadContracts()
        //3.3 download contracts in other page
        for(let i=2;i<=maxContractPageNum;i++){
            const pageSelector = `a[href='javascript:getFinancePlanLoanInvestorList(${i});']`
            await page.click(pageSelector)
            await sleep(2000);
            await page.waitForSelector(contractDownloadSelector);
            await downloadContracts()
        }
    }
    await browser.close();
})();
