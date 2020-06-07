'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp')
const jsonfile = require('jsonfile')
const search = require('./search')
const parse = require('./parse')
const log = require('simple-node-logger').createSimpleLogger('download.log')

const ChromeDownloadPath = process.env['CHROME_DOWNLOAD_PATH'],
    ChromeBinPath = process.env['CHROME_BIN_PATH'],
    PlanName = process.env['PlanName'],
    ChromeHeadlessMode = process.env['CHROME_HEADLESS_MODE']?(process.env['CHROME_HEADLESS_MODE']=='true'):false,
    WeixinLogin = process.env['WeixinLogin']?(process.env['WeixinLogin']=='true'):true,
    SkipDownload = process.env['SkipDownload']?(process.env['SkipDownload']=='true'):false,
    SkipParse = process.env['SkipParse']?(process.env['SkipParse']=='true'):false,
    SaveSearch = process.env['SaveSearch']?(process.env['SaveSearch']=='true'):true,
    DownloadRetryInterval = parseInt(process.env['DownloadRetryInterval'])||10000,
    DefaultTimeout = parseInt(process.env['DefaultTimeout'])||30000,
    SkipCheatCheck = process.env['SkipCheatCheck']?(process.env['SkipCheatCheck']=='true'):true,
    CheckCheatMaxNum = parseInt(process.env['CheckCheatMaxNum'])||20,
    CheckCheatMaxPageNum = parseInt(process.env['CheckCheatMaxPageNum'])||10,
    CheckCheatStartYear = process.env['CheckCheatStartYear']||'2015',
    CheckCheatReValidate = process.env['CheckCheatReValidate']?(process.env['CheckCheatReValidate']=='true'):true,
    DownloadMaxPage = parseInt(process.env['DownloadMaxPage'])||1000,
    DownloadRetryTime = parseInt(process.env['DownloadRetryTime'])||5,
    DownloadBatchSize = parseInt(process.env['DownloadBatchSize'])||1000,
    SearchIndexPrefix = process.env['SearchIndexPrefix']||'yooli_contract_',
    DownloadFilePrefix = 'loanagreement_',
    LoadPageOption = {waitUntil:'domcontentloaded'},
    DownloadAllPath = path.resolve("download","all"),
    ContractFileName = 'contracts.json',
    BorrowerFileName = 'borrowers.json',
    DownloadAllFilePath = path.resolve(DownloadAllPath,ContractFileName),
    BorrowerFilePath = path.resolve(DownloadAllPath,BorrowerFileName),
    ContractCheckFields = ['borrowerName','borrowerType','beginDate','assurance','contractType'],
    CheckCheatVerifyCodeInvalid = 'code invalid',
    IdProvinceMapping = {
        "11":['京'],"12":['津'],"13":['冀'],"14":['晋'],"15":["蒙","内"],
        "21":["辽"],"22":['吉'],"23":['黑'],
        "31":['沪'],"32":['苏'],"33":['浙'],"34":['皖'],"35":['闽'],"36":['赣'],"37":['鲁'],
        "41":['豫'],"42":['鄂'],"43":["湘"],"44":['粤'],"45":['桂'],"46":['琼'],
        "50":['渝'],"51":['川'],"52":['贵'],"53":['云'],"54":['藏'],
        "61":['陕'],"62":['甘'],"63":['青'],"64":['宁'],"65":['新']
    }

const sleep = async (ms)=>{
    return new Promise(resolve => setTimeout(resolve, ms));
}

const filterPlanByName = (plans,plan_names)=>{
    let find = false
    plan_names = plan_names.split(',')
    plans = plans.filter((plan)=>{
        find = false;
        for(let name of plan_names){
            find = plan.planName.includes(name)
            if(find)
                break;
        }
        return find;
    })
    return plans
}

const deduplicate = (contracts)=>{
    let contractObj = {},deduplicated = [],duplicated = [];
    for(let contract of contracts){
        if(contractObj[contract.id]){
            contractObj[contract.id].push(contract)
        }else{
            contractObj[contract.id] = []
            contractObj[contract.id].push(contract)
        }
    }
    for (let key in contractObj){
        if(contractObj[key].length>1){
            duplicated.push(contractObj[key])
        }
        deduplicated.push(contractObj[key][0]);
    }
    return {deduplicated,duplicated}
}

const checkContractField = (contract)=>{
    for(let field of ContractCheckFields){
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

const sameIdCardNum = (src,dst)=>{
    return (src.substr(0,2)===dst.substr(0,2))&&(src.substr(src.length-2)===dst.substr(dst.length-2))
}

const provinceInEnum = (province)=>{
    return Object.values(IdProvinceMapping).flat().includes(province)
}

const needCheckID = (contract,borrowerName,info)=>{
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
    if(borrowerName!=contract.borrowerName){
        check = false
    }else{
        let mappingProvinces = IdProvinceMapping[contract.borrowerID.substr(0,2)]
        check = mappingProvinces.some((mappingProvince)=>{
            if(province==mappingProvince){
                return true
            }else{
                if(year&&year>=CheckCheatStartYear&&!provinceInEnum(province)){
                    return true
                }
            }
            return false
        })
    }
    return check
}

const isIdNum = (id)=>{
    return id.replace(/\s/,'').match(/\d{2}.*?\d{2}$/)
}

const findBorrower = (contract,borrowers)=>{
    let found;
    return borrowers.find((borrower)=>{
        found = false
        if(contract.borrowerType==='个人'){
            found = (borrower.borrowerName===contract.borrowerName&&borrower.borrowerYooliID === contract.borrowerYooliID)
        }else if(contract.borrowerType==='公司'){
            found = (borrower.borrowerName===contract.borrowerName)
        }
        return found
    })
}

module.exports = class ContractDownloader {

    constructor(user,passwd) {
        this.loginUser = user
        this.loginPasswd = passwd
    }

    async init() {
        this.allContracts = []
        this.allBorrowers = []
        this.currDate = new Date().toISOString().replace(/(T.+)/,'').replace(/\-/g,'')
        this.browser = await puppeteer.launch({defaultViewport: null,headless: ChromeHeadlessMode, slowMo: 50, executablePath:ChromeBinPath});
        this.page = await this.browser.newPage();
        await this.page.setDefaultNavigationTimeout(DefaultTimeout);
        await this.page.setDefaultTimeout(DefaultTimeout)
        await mkdirp(DownloadAllPath)
        if (fs.existsSync(DownloadAllFilePath)) {
            this.allContracts = jsonfile.readFileSync(DownloadAllFilePath)
        }
        if (fs.existsSync(BorrowerFilePath)) {
            this.allBorrowers = jsonfile.readFileSync(BorrowerFilePath)
        }
        if(SaveSearch){
            try{
                await search.init()
                await search.del(SearchIndexPrefix + this.currDate)
            }catch(e){
                //just ignore
            }
            log.info('init elasticsearch success')
        }
    }

    async login () {
        let page = this.page
        await page.goto('https://www.yooli.com/',LoadPageOption);
        const loginSelector = "a[href='/secure/login/'][data-hm='navigation, nav_login']";
        await page.waitForSelector(loginSelector);
        await page.click(loginSelector);
        const WeixinLoginSelector = "a[data-hm='login_page, wechat_login']";
        const LoginButtonSelector = '#loginBt'
        const CheckBoxSelector = '#checkWeekly'
        await page.waitForSelector(LoginButtonSelector);
        log.info('to login page success')
        await sleep(1000)
        if(WeixinLogin){
            await page.click(WeixinLoginSelector)
        }else{
            await page.type('#userName', this.loginUser||process.env['YOOLI_USER']);
            await page.type('#password', this.loginPasswd||process.env['YOOLI_PASS']);
            await page.click(CheckBoxSelector)
            await page.click(LoginButtonSelector)
        }
        const UserSelector = "a[href='/userAccount.session.action']";
        await page.waitForSelector(UserSelector);
        let userName = await page.$eval(UserSelector, element => {
            return element.innerText
        });
        this.downloadPath = path.resolve("download",userName,this.currDate)
        this.downloadUrl = `/${userName}/${this.currDate}`
        await mkdirp(this.downloadPath)
    }

    async findPlans() {
        let page = this.page,pageSelector
        const PlanSelector = "div#itemCurrentContent ul li";
        const PlanPageNumSelector = "div#financeCurrentPage a:nth-last-child(2)";
        await page.goto('https://www.yooli.com/financePlanRecords.session.action',LoadPageOption);
        await page.waitForSelector(PlanSelector);
        //get maxPageNum for plans
        let maxPlanPageNum
        try{
            maxPlanPageNum = await page.$eval(PlanPageNumSelector, element => {
                return element.innerText
            });
        }catch(err){
            maxPlanPageNum = 1
        }
        maxPlanPageNum = parseInt(maxPlanPageNum)
        let getPlanInPage = async()=>{
            return await page.$$eval(PlanSelector, plans => {
                return plans.map(plan => {
                    let dataId = plan.getAttribute("data-text")
                    let pos = dataId.indexOf(':'), planId=dataId.substr(0,pos),
                        planName = dataId.replace(':','-')
                    return {planId,planName}
                })});
        }
        let plans = []
        for(let i=1;i<=maxPlanPageNum;i++){
            plans = plans.concat(await getPlanInPage())
            if(i==maxPlanPageNum){
                break;
            }
            pageSelector = `a[href='javascript:getFinanceCurrentPlanList(${i+1});']`
            await page.click(pageSelector)
            await page.waitForSelector(PlanSelector);
        }
        if(PlanName){
            plans = filterPlanByName(plans,PlanName)
        }
        return plans
    }

    async initPlans () {
        let plans = await this.findPlans()
        for(let plan of plans){
            await mkdirp(this.downloadPath + "/" + plan.planName)
        }
        return plans
    }

    async findContractInPlan(plan){
        let page = this.page;
        const ContractInfoSelector = "a[href^='/dingcunbao/item']"
        const ContractDownloadSelector = "a[href^='/contractDetailDownload.session.action']";
        const AmountSelector = '#financePlanLoanInvestorList div.plan-post:not(:first-child) ul li.col_2'
        const ContractPageNumSelector = "div#planLoanListPager a:nth-last-child(2)";
        const LendRateSelector = `div#main em#rate`
        const LendAmountSelector = `div#main ul.items:nth-child(1) li.y_2`
        const LendDateSelector = `div#main ul.items:nth-child(2) li.y_2`
        await page.goto(`https://www.yooli.com/userPlan/detail/${plan.planId}.html`,LoadPageOption);
        await page.waitForSelector(ContractInfoSelector);
        let planRate = await page.$eval(LendRateSelector, element => {
            return element.innerText.split('+').reduce((total,rate)=>{
                return total + parseFloat(rate.replace('%',''))
            },0)
        });
        let planAmount = await page.$eval(LendAmountSelector, element => {
            return parseFloat(element.innerText.replace(',','').replace('元',''))
        });
        let planDate = await page.$eval(LendDateSelector, element => {
            return element.innerText.replace(/\./g,'-')
        });
        Object.assign(plan,{planRate,planAmount,planDate})
        //get maxPageNum for contracts
        let maxContractPageNum
        try{
            maxContractPageNum = await page.$eval(ContractPageNumSelector, element => {
                return element.innerText
            });
            maxContractPageNum = parseInt(maxContractPageNum)
        }catch(err){
            maxContractPageNum = 1;
        }
        maxContractPageNum = Math.min(maxContractPageNum,DownloadMaxPage)
        //get all contract links
        let getContractsInPage = async ()=>{
            let downloads = await page.$$eval(ContractDownloadSelector, anchors => {
                return [].map.call(anchors, a => {
                    let regex = /loanId=(\d+)\&loaninvestorId=(\d+)$/,
                        loanId,id,loaninvestorId,downloadUrl,detailUrl,creditUrl,match
                    match = regex.exec(a.href)
                    if(match&&match.length==3){
                        loanId = match[1]
                        id = loanId
                        loaninvestorId = match[2]
                        downloadUrl = a.href
                        creditUrl = `https://www.yooli.com/contractCreditRights.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                        detailUrl = `https://www.yooli.com/contractDetail.session.action?loanId=${loanId}&loaninvestorId=${loaninvestorId}`
                        return {id,loanId,loaninvestorId,downloadUrl,creditUrl,detailUrl}
                    }else{
                        log.error(`invalid contract with downloadUrl as ${a.href}`)
                    }
                })});
            let myAmounts = await page.$$eval(AmountSelector, eles => {
                return [].map.call(eles, ele => {
                    let myAmount = parseFloat(ele.innerText.replace(',',''))
                    return {myAmount}
                })});
            let infos = await page.$$eval(ContractInfoSelector, anchors => {
                return [].map.call(anchors, a => {
                    return {name:a.innerText,infoUrl:a.href}
                })});
            for(let i=0;i<infos.length;i++){
                Object.assign(infos[i],downloads[i],myAmounts[i])
            }
            return infos
        }
        let contracts = [],pageSelector
        for(let i=1;i<=maxContractPageNum;i++){
            contracts = contracts.concat(await getContractsInPage())
            if(i==maxContractPageNum){
                break
            }
            pageSelector = `a[href='javascript:getFinancePlanLoanInvestorList(${i+1});']`
            await page.waitForSelector(pageSelector);
            await page.click(pageSelector)
            await page.waitForSelector(ContractInfoSelector);
        }
        let plan_amount = 0
        for(let contract of contracts){
            plan_amount+=contract.myAmount
        }
        plan.planActualAmount = plan_amount
        for(let contract of contracts){
            Object.assign(contract,plan)
        }
        return contracts
    }

    async checkDownloaded(contract) {
        let exist = false
        let contractFile = `${DownloadFilePrefix}${contract.id}.pdf`
        let tmpPath = ChromeDownloadPath + "/" + contractFile
        let dstPath = this.downloadPath + "/" + contract.planName + "/" + contractFile
        let allPath = DownloadAllPath + "/" + contractFile
        let dstExist = fs.existsSync(dstPath)
        let tmpExist = fs.existsSync(tmpPath)
        let allExist = fs.existsSync(allPath)
        if (tmpExist||dstExist||allExist) {
            exist = true
        }
        return exist;
    }

    async findMissingAndMoveDownloaded(contracts) {
        let contractFile,tmpPath,dstPath,allPath,missingContracts = [],tmpExist,dstExist,allExist
        for(let contract of contracts){
            contractFile = `${DownloadFilePrefix}${contract.id}.pdf`
            tmpPath = ChromeDownloadPath + "/" + contractFile
            dstPath = this.downloadPath + "/" + contract.planName + "/" + contractFile
            allPath = DownloadAllPath + "/" + contractFile
            dstExist = fs.existsSync(dstPath)
            if(!dstExist){
                tmpExist = fs.existsSync(tmpPath)
                allExist = fs.existsSync(allPath)
                if (!tmpExist&&!allExist) {
                    log.error(`maybe download fail,will retry contract ${contract.id}`)
                    missingContracts.push(contract)
                }else{
                    if(tmpExist)
                    {
                        fs.copyFileSync(tmpPath, dstPath)
                        fs.copyFileSync(tmpPath, allPath)
                        fs.unlinkSync(tmpPath)
                    }else if(allExist){
                        fs.copyFileSync(allPath, dstPath)
                    }
                }
            }
        }
        return missingContracts;
    }

    async downloadContract(contracts) {
        let retryContracts = [],downloaded,page = this.page;
        const VerifyCodeSelector = "div.slide-btn"

        for(let contract of contracts){
            try{
                downloaded = await this.checkDownloaded(contract)
                if(!downloaded){
                    if(contract.retryTime>=DownloadRetryTime) {
                        log.error(`contract ${contract.id} retry too many times still fail,so skip`)
                    }else{
                        await page.goto(contract.downloadUrl, LoadPageOption)
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
        retryContracts = await this.findMissingAndMoveDownloaded(contracts)
        retryContracts = retryContracts.filter((contract)=>{
            return contract.retryTime<DownloadRetryTime
        })
        if (retryContracts&&retryContracts.length) {
            log.warn(`retry missing contracts:${retryContracts.map(contract=>contract.id)}`)
            await this.downloadContract(retryContracts)
        }
    }

    async parseContract(contracts) {
        let contractFilePath, result,exist,valid,filtered,
            allContracts = this.allContracts,downloadPath = this.downloadPath
        for(let contract of contracts){
            delete contract['retryTime']
            exist = allContracts.find((exist)=>{
                return exist.id === contract.id
            })
            if(exist){
                Object.assign(contract,Object.assign(exist,contract))
            }else {
                try{
                    contractFilePath = `${downloadPath}/${contract.planName}/${DownloadFilePrefix}${contract.id}.pdf`
                    if (fs.existsSync(contractFilePath)){
                        result = await parse.parsePdf(contractFilePath)
                        Object.assign(contract,result.parsed)
                        valid = checkContractField(contract)
                        if(valid){
                            log.info(`contract ${contract.id} parse success`)
                        }else{
                            log.warn(`contract ${contract.id} parse incomplete`)
                        }
                        allContracts.push(contract)
                    }
                }catch(e){
                    log.error(`contract ${contract.id} parse fail:` + e.stack||e)
                }
            }
        }
        filtered = contracts.filter((contract)=>{
            let valid = checkContractField(contract)
            if(!valid){
                log.warn(`contract ${contract.id} parse success but incomplete`)
            }
            return valid
        })
        log.info(`${contracts.length} contracts crawled and ${filtered.length} complete parsed`)
        return contracts
    }

    async checkID(contract,element){
        let cheat = false,id,target,targetPage,browser = this.browser;
        const link = await element.$('a');
        try{
            await link.click()
            target = await browser.waitForTarget(target => target.url() === 'http://zxgk.court.gov.cn/zhzxgk/detailZhcx.do',{timeout:DefaultTimeout});
            targetPage = await target.page()
        }catch(err){
            log.error('captcha invalid!' + err.stack ||err)
            throw new Error(CheckCheatVerifyCodeInvalid)
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
        if (sameIdCardNum(id, contract.borrowerID)) {
            cheat = true;
            log.warn(`contract ${contract.id} is cheat!!!`)
        }
        await targetPage.close()
        return cheat;
    }


    async findCheatContract(contracts) {

        let checkedNum = 0,existBorrower,existContract,page = this.page,
            allBorrowers = this.allBorrowers,allContracts = this.allContracts;

        const checkCheat = async (contract)=> {
            let elements = await page.$$('#result-block #tbody-result tr'),cheat=false;
            for (let [_, element] of elements.entries()) {
                const borrowerName = await element.$eval('td:nth-child(2)',ele=>ele.innerText)
                const info = await element.$eval('td:nth-child(4)',ele=>ele.innerText)
                if(needCheckID(contract,borrowerName,info)){
                    try{
                        cheat = await this.checkID(contract,element)
                    }catch(err){
                        if(err.message===CheckCheatVerifyCodeInvalid){
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
            if(contract.expired){
                try{
                    existBorrower = findBorrower(contract,allBorrowers)
                    existContract = allContracts.find((exist)=>{
                        return exist.id === contract.id
                    })
                    existContract = existContract || contract
                    if(existBorrower&&(existBorrower.cheat||!CheckCheatReValidate)){
                        contract.cheat = existBorrower.cheat
                        existContract.cheat = existBorrower.cheat
                        continue
                    }
                    let cheat = false;
                    await page.goto(`http://zxgk.court.gov.cn/zhzxgk/`,LoadPageOption);
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
                    if(maxPageNum==0){
                        cheat = false
                    }
                    else if(maxPageNum&&contract.borrowerType=='公司'){
                        cheat = true
                    }else{
                        if(maxPageNum<=CheckCheatMaxPageNum&&existBorrower){
                            contract.cheat = existBorrower.cheat
                            existContract.cheat = existBorrower.cheat
                            continue
                        } else {
                            checkedNum = 0
                            maxPageNum = Math.min(maxPageNum,CheckCheatMaxPageNum)
                            for (let i = 0; i < maxPageNum; i++) {
                                cheat = await checkCheat(contract)
                                if (cheat || i == maxPageNum || checkedNum>=CheckCheatMaxNum) {
                                    break
                                }
                                await page.waitForSelector('#next-btn')
                                await page.click('#next-btn')
                                await sleep(500)
                            }
                        }
                    }
                    contract.cheat = cheat
                    existContract.cheat = cheat
                    if(existBorrower){
                        existBorrower.cheat = cheat
                    }else{
                        allBorrowers.push(
                            {
                                contract:contract.id,
                                borrowerName: contract.borrowerName,
                                borrowerType: contract.borrowerType,
                                borrowerYooliID: contract.borrowerYooliID,
                                borrowerID:contract.borrowerID,
                                cheat: cheat
                            }
                        )
                    }
                    log.info(`check cheat in contract ${contract.id} success,cheat is ${cheat}`)
                }catch(err){
                    log.error(`check cheat in contract ${contract.id} fail!` + err.stack ||err)
                }
            }
        }
    }

    async saveContract(contracts) {
        let allContracts = this.allContracts,allBorrowers = this.allBorrowers
        if(SaveSearch){
            try{
                await search.batchSave(SearchIndexPrefix + this.currDate,contracts)
                await search.batchSave(SearchIndexPrefix + 'all' ,allContracts)
            }catch(e){
                log.error(`fail to save contracts to ElasticSearch:` + e.stack||e)
            }
        }
        await jsonfile.writeFileSync(this.downloadPath + '/' + ContractFileName,contracts, { spaces: 2 })
        if(allContracts.length){
            await jsonfile.writeFileSync(DownloadAllFilePath,allContracts, { spaces: 2 })
        }
        if(allBorrowers.length){
            await jsonfile.writeFileSync(BorrowerFilePath,allBorrowers, { spaces: 2 })
        }
    }

    async download() {
        await this.init()
        await this.login()
        log.info(`login finished`)
        let plans = await this.initPlans()
        log.info(`init plans finished`)
        let contracts = [],processed_contracts = [],planInContract,deduplicated
        for(let plan of plans) {
            planInContract = await this.findContractInPlan(plan)
            deduplicated = deduplicate(planInContract).deduplicated
            log.info(`${planInContract.length} contracts before deduplicate and ${deduplicated.length} contracts after deduplicate in plan ${plan.planName}`)
            contracts = contracts.concat(deduplicated)
        }
        deduplicated = deduplicate(contracts).deduplicated
        log.info(`${contracts.length} contracts before deduplicate and ${deduplicated.length} contracts after deduplicate in all plans,duplicate contracts:
        ${JSON.stringify(deduplicate(contracts).duplicated,null,2)}`)
        log.info(`init contracts finished`)

        let round = Math.ceil(contracts.length/DownloadBatchSize),
            contractsInRound,begin=0,end=0
        for(let i=0;i<round;i++){
            end = Math.min(begin+DownloadBatchSize,contracts.length)
            contractsInRound = contracts.slice(begin,end)
            if(!SkipDownload){
                await this.downloadContract(contractsInRound)
                log.info(`download contracts from ${begin} to ${end-1} finished`)
            }
            if(!SkipParse){
                await this.parseContract(contractsInRound)
                log.info(`parse contracts from ${begin} to ${end-1} finished`)
            }
            if(!SkipCheatCheck){
                let saveBorrowerTimer = setInterval(async () => {
                    if(this.allBorrowers.length){
                        await jsonfile.writeFileSync(BorrowerFilePath,this.allBorrowers, { spaces: 2 })
                    }
                    log.info('periodical save borrowers success')
                }, DefaultTimeout*2);
                await this.findCheatContract(contractsInRound)
                clearInterval(saveBorrowerTimer)
                log.info(`check cheat in contracts from ${begin} to ${end-1} finished`)
            }
            processed_contracts = processed_contracts.concat(contractsInRound)
            await this.saveContract(processed_contracts)
            log.info(`save contracts from ${begin} to ${end-1} finished`)
            begin = begin + DownloadBatchSize
        }
        await this.browser.close()
        return this.downloadUrl + '/contracts.json'
    }
}
