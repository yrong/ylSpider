'use strict';

const puppeteer = require('puppeteer');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async() => {
    const browser = await puppeteer.launch({headless: false,  slowMo: 250});
    const page = await browser.newPage();

    await page.goto('https://www.yooli.com/');

    // Wait for login button and click.
    const loginSelector = "a[href='/secure/login/'][data-hm='navigation, nav_login']";
    await page.waitForSelector(loginSelector);
    await page.click(loginSelector);

    // Type into user/pass.
    await page.type('#userName', process.env['YOOLI_USER']);
    await page.type('#password', process.env['YOOLI_PASS']);
    await page.click('#checkWeekly')
    await page.click('#loginBt')
    // Wait for login button and click.
    const userSelector = "a[href='/userAccount.session.action']";
    await page.waitForSelector(userSelector);

    //go to finance plan page
    await page.goto('https://www.yooli.com/financePlanRecords.session.action');
    const planSelector = "div#itemCurrentContent ul li dl dt";
    await page.waitForSelector(planSelector);
    await page.click(planSelector)

    //wait for contract and click
    const contractSelector = "a[href^='/contractDetailDownload.session.action']";
    await page.waitForSelector(contractSelector);
    const links = await page.$$eval(contractSelector, anchors => {
        return [].map.call(anchors, a => {
            return a.pathname + a.search
        })});
    console.log(links.join('\n'));
    for(let link of links){
        await page.click(`a[href='${link}'`)
    }


    //get all pages
    const pageNumSelector = "div#planLoanListPager a:nth-last-child(2)";
    let maxPageNum = await page.$eval(pageNumSelector, element => {
        return element.innerText
    });
    maxPageNum = parseInt(maxPageNum)
    for(let i=2;i<=maxPageNum;i++){
        const pageSelector = `a[href='javascript:getFinancePlanLoanInvestorList(${i});']`
        await page.click(pageSelector)
        await sleep(2000);
        let contractSelector = "a[href^='/contractDetailDownload.session.action']";
        await page.waitForSelector(contractSelector);
        const links = await page.$$eval(contractSelector, anchors => {
            return [].map.call(anchors, a => {
                return a.pathname + a.search
            })});
        console.log(links.join('\n'));
        for(let link of links){
            await page.click(`a[href='${link}'`)
        }
    }
    await browser.close();
})();
