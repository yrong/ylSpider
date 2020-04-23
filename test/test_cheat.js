require('dotenv').config();
const puppeteer = require('puppeteer-core');
const loadPageOption = {waitUntil:'domcontentloaded'}
let ChromeBinPath = process.env['CHROME_BIN_PATH'],
    DefaultTimeout = parseInt(process.env['DefaultTimeout'])
const path = require('path')
const jsonfile = require('jsonfile')

const sleep = async (ms)=>{
    return new Promise(resolve => setTimeout(resolve, ms));
}

const IdProvinceMapping = {
    "11":'京',"12":'津',"13":'冀',"14":'晋',"15":"晋",
    "21":"辽","22":'吉',"23":'黑',
    "31":'沪',"32":'苏',"33":'浙',"34":'皖',"35":'闽',"36":'赣',"37":'鲁',
    "41":'豫',"42":'鄂',"43":"湘","44":'粤',"45":'桂',"46":'琼',
    "50":'渝',"51":'川',"52":'贵',"53":'云',"54":'藏',
    "61":'陕',"62":'甘',"63":'青',"64":'宁',"65":'新'
}

const checkCheat = async ()=> {
    let browser = await puppeteer.launch({headless: false, slowMo: 50, executablePath:ChromeBinPath});
    let page = await browser.newPage(),cheat,cheats=[];
    await page.setDefaultNavigationTimeout(DefaultTimeout);
    await page.setDefaultTimeout(DefaultTimeout)
    await page.goto(`http://zxgk.court.gov.cn/zhzxgk/`, loadPageOption);
    await page.waitForSelector('#pName');
    await sleep(100)
    await page.type('#pName', '海霞');
    await page.focus('#yzm')
    await page.waitForSelector('#yzm-group div.alert-success', {visible: true});
    await page.click('#yzm-group button.btn-zxgk')
    try {
        await page.waitForSelector('#result-block #tbody-result p.warning-result', {timeout: 1000});
        cheat = false
    } catch (err) {
        let maxPageNum = await page.$eval('#page-div span#totalPage-show', element => {
            return parseInt(element.innerText)
        });
        let needCheck = (info)=>{
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
                province = province[1]
            }else{
                province = /）\s*(.*?)\d/.exec(info)
                if(province&&province.length==2){
                    province = province[1]
                }
            }
        }
        let sameId = (src,dst)=>{
            return (src.substr(0,2)===dst.substr(0,2))&&(src.substr(src.length-2)===dst.substr(dst.length-2))
        }
        let checkId = async () => {
            let eles = await page.$$('#result-block #tbody-result tr'),cheat=false;
            for (let [i, ele] of eles.entries()) {
                const info = await ele.$eval('td:nth-child(4)',ele=>ele.innerText)
                if(needCheck('（2020）湘0104执2249号')){
                    const link = await ele.$('a');
                    await link.click()
                    let target = await browser.waitForTarget(target => target.url() === 'http://zxgk.court.gov.cn/zhzxgk/detailZhcx.do');
                    const targetPage = await target.page()
                    let id = await targetPage.$eval('table tbody tr:nth-child(3) td#cardNumDetail', element => {
                        return element.innerText
                    })
                    targetPage.click('div.row button')
                    if(sameId(id,'41*****44')){
                        cheat = true;
                        break
                    }
                }
            }
            return cheat
        }
        for (let i = 0; i < maxPageNum; i++) {
            let cheat = await checkId()
            if (cheat || i == maxPageNum - 1) {
                break
            }
            await sleep(500)
        }
    }
}

const delCheat = async ()=>{
    const filePath = path.resolve("./download",'all','contracts.json')
    let contracts = jsonfile.readFileSync(filePath)
    for(let contract of contracts){
        if(contract.borrowerType==='公司'){
            delete contract.cheat
        }
    }
    jsonfile.writeFileSync(filePath,contracts,{ spaces: 2 })
}

const savePeriodical = async ()=>{
    setInterval(async ()=>{
        await sleep(5000)
        console.log('periodical success')
    }, 1000);
}

const generateBorrows = async ()=>{
    const filePath = path.resolve("./download",'all','contracts.json')
    let contracts = jsonfile.readFileSync(filePath),allBorrowers=[]
    for(let contract of contracts){
        if(contract.cheat!=undefined){
            allBorrowers.push(
                {
                    borrowerName: contract.borrowerName,
                    borrowerType: contract.borrowerType,
                    borrowerYooliID: contract.borrowerYooliID,
                    cheat: contract.cheat
                }
            )
        }else{
            console.log('not check yet')
        }
    }
    jsonfile.writeFileSync('./download/all/borrowers.json',allBorrowers,{ spaces: 2 })
}

(async() => {
    // await checkCheat()
    // await savePeriodical()
    // await delCheat()
    await generateBorrows()
})();
