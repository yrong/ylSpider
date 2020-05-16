require('dotenv').config();

const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const jsonfile = require('jsonfile')
const parse = require('./parse')

const log = require('simple-node-logger').createSimpleLogger('csv.log');
const allDir = './download/all', regex=/^loanagreement_(\d{7})\.pdf$/,
    checkFields = ['borrowerName','borrowerType','beginDate','assurance','contractType','borrowNum'];

let result,filepath,match,contract,contracts=[],allContracts=[],header = [],valid,exist

const checkContractField = (contract)=>{
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

(async () => {
    await mkdirp(allDir)
    if (fs.existsSync(allDir + '/contracts.json')) {
        allContracts = jsonfile.readFileSync(allDir + '/contracts.json')
    }
    const files = await fs.readdirSync(allDir);
    for (let file of files) {
        match = regex.exec(file)
        if (match&&match.length) {
            exist = allContracts.find((exist)=>{
                return exist.id === match[1]
            })
            if(exist){
                contracts.push(exist)
            }else{
                filepath = path.join(allDir, file);
                try{
                    result = await parse.parsePdf(filepath)
                    contract = result.parsed
                    contract.id = match[1]
                    valid = checkContractField(contract)
                    if(!valid){
                        log.warn(`contract ${contract.id} missing required fields: ${JSON.stringify(contract, null, 2)}`)
                    }else{
                        log.info(`contract ${contract.id} parse success`)
                    }
                    contracts.push(contract)
                }catch(err){
                    log.error(`parse pdf file ${file} failed:` + err.stack||err)
                }
            }
        }
    }
    header = header.concat([
        {id: 'beginDate', title: '合同开始日期'},
        {id: 'endDate', title: '合同结束日期'},
        {id: 'borrowNum', title: '借款金额'},
        {id: 'myLendsTotal', title: '我的出借'},
        {id: 'borrowerType', title: '借款人类型'},
        {id: 'borrowerName', title: '借款人名'},
        {id: 'borrowerYooliID', title: '借款人ID'},
        {id: 'borrowerID', title: '借款人证件号'},
        {id: 'contractType', title: '还款方式'},
        {id: 'lender', title: '丙方'},
        {id: 'assurance', title: '担保方'},
        {id: 'expired', title: '是否逾期'}
    ])
    const csvWriter = createCsvWriter({
        path: allDir + '/contracts.csv',
        header: header
    });
    await csvWriter.writeRecords(contracts)
    log.info(`writing contracts to csv success`)
})().catch((e) => {
    log.error(e)
})
