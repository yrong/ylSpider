const fs = require('fs');
const path = require('path');
const log = require('simple-node-logger').createSimpleLogger();
const PdfReader = require("pdfreader").PdfReader;
require('dotenv').config()


const parseSignDate = (lines)=>{
    let regex = /由以下各方于\s+(.*?)\s+签订/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&result.length==2){
            result = result[1].replace(/年|月/g,'-')
            result = result.replace(/日/g,'')
            return result;
        }
    }
}

const parseBorrowerName = (lines)=>{
    let regex = /甲方.*：(.*?)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&result.length==2){
            return result[1]
        }
    }
}

const parseBorrowerYooliId = (lines)=>{
    let regex = /用户名：(.*?)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&result.length==2){
            return result[1]
        }
    }
}

const parseBorrowerId = (lines)=>{
    let regex = /身份证号码：\s*(\d{2}.*?)$|身份证号码（自然人）：\s*(\d{2}.*?)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&(result.length==2||result.length==3)){
            return result[result.length-1]||result[result.length-2]
        }
    }
}

const parseContractType = (lines)=>{
    let regex = /注：还款方式为“(.*?)”的，适用上述表格/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&result.length==2){
            return result[1]
        }
    }
}

const parseMyLends = (lines)=>{
    let regex = /身份证/,lineNum=0,result,results=[]
    let getNum = (lineNum)=>{
        for(let i=lineNum+1;i<lineNum+5;i++){
            if(lines[i].match(/^[+-]?\d+(\.\d+)?$/)){
                return parseFloat(lines[i]);
            }
        }
    }
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            let num = getNum(lineNum)
            if(num){
                results.push(num)
            }
        }
        lineNum ++
    }
    return results
}

const parseAssurance = (lines)=>{
    let regex = /丁方:(.*)$|丁方：(.*)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&(result.length==2||result.length==3)){
            result = result[result.length-1]||result[result.length-2]
            return result.replace('（','')
        }
    }
}

const parseLender = (lines)=>{
    let regex = /丙方：(.*)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result&&(result.length==2||result.length==3)){
            result = result[result.length-1]||result[result.length-2]
            return result.replace('（','')
        }
    }
}

const parseAll = (lines)=>{
    let signDate = parseSignDate(lines)
    let borrowerName = parseBorrowerName(lines)
    let borrowerYooliID = parseBorrowerYooliId(lines)
    let borrowerID = parseBorrowerId(lines)
    let contractType = parseContractType(lines)
    let myLends = parseMyLends(lines)
    let lender = parseLender(lines)
    let assurance = parseAssurance(lines)
    return {signDate,borrowerName,borrowerYooliID,borrowerID,contractType,myLends,lender,assurance}
}

const parsePdf = async (filePath)=>{
    return new Promise((resolve,reject)=>{
        let lines = [],parsed
        new PdfReader().parseFileItems(filePath, function(err, item) {
            if (err) reject(err);
            else if (!item) {
                // console.log(JSON.stringify(lines,null,2))
                parsed = parseAll(lines)
                resolve(parsed);
            }
            else if (item.text) {
                lines.push(item.text)
            }
        });
    })
}

const parse = async (datePath)=>{
    datePath = datePath || process.env['ParseDate']
    let downloadPath = path.resolve('./download/' + datePath),contracts= []
    if (fs.existsSync(downloadPath)) {
        let planFiles = fs.readdirSync(downloadPath)
        for (let plan of planFiles) {
            let contractFiles = fs.readdirSync(downloadPath + '/' + plan)
            for(let contractFile of contractFiles){
                let filePath = downloadPath + '/' + plan + '/' + contractFile
                let match = /^loanagreement_(.*)\.pdf$/.exec(contractFile)
                if (match&&match.length==2) {
                    let contract = await parsePdf(filePath,plan,match[1])
                    contracts.push(contract)
                }
            }
        }
        console.log(JSON.stringify(contracts,null,2))
        return contracts
    }
}

module.exports = {parsePdf}


