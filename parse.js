const fs = require('fs');
const path = require('path');
const PdfReader = require("pdfreader").PdfReader;
const moment = require('moment')

const parseSignDate = (lines)=>{
    let regex = /由以下各方于\s+(.*?)\s+签订/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2){
                return parseDate(result[1])
            }
        }
    }
}

const parseBorrowerName = (lines)=>{
    let regex = /甲方.*：(.*?)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2)
                return result[1]
        }
    }
}

const parseBorrowerYooliId = (lines)=>{
    let regex = /用户名：(.*?)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2)
                return result[1]
        }
    }
}

const parseBorrowerId = (lines)=>{
    let regex = /身份证号码：\s*(\d{2}.*?)$|身份证号码（自然人）：\s*(\d{2}.*?)$|社会信用代码.*?：\s*(\d{2}.*?)$/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2||result.length==3||result.length==4)
                return result[result.length-1]||result[result.length-2]||result[result.length-3]
        }
    }
}

const parseContractType = (lines)=>{
    let regex = /注：还款方式为“(.*?)”的，适用上述表格/,result,lineNum=0;
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2) {
                result = result[1]
                break
            }
        }
    }
    if(!result){
        regex = /还款方式/
        for(let line of lines){
            result = regex.exec(line)
            if(result){
                result = lines[lineNum+1]
                break
            }
            lineNum++
        }
    }
    return result
}

const parseMyLends = (lines)=>{
    let regex = /身份证/,firstLineNum,lineNum=0,result,results=[]
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
            firstLineNum = lineNum
            let num = getNum(lineNum)
            if(num){
                results.push(num)
            }
        }
        lineNum ++
        if(lineNum>firstLineNum+50){
            break
        }
    }
    return results
}


const removeDuplicateCompanyName = (company)=>{
    company = company.replace(/（.*/,'').replace(/\s/g,'')
    return company
}

const parseAssurance = (lines)=>{
    let regex = /丁方:(.*公司)|丁方：(.*公司)/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2||result.length==3){
                result = result[result.length-1]||result[result.length-2]
                return removeDuplicateCompanyName(result)
            }
        }
    }
}

const parseLender = (lines)=>{
    let regex = /丙方：(.*公司)/,result
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==2||result.length==3){
                result = result[result.length-1]||result[result.length-2]
                return removeDuplicateCompanyName(result)
            }
        }
    }
}

const parseDate = (date)=>{
    return date.replace(/年|月/g,'-').replace(/日/g,'')
}

const parseContractDate = (lines)=>{
    let regex = /(.*?)起，至\s*(.*?)止/,result,beginDate,endDate
    for(let line of lines){
        result = regex.exec(line)
        if(result){
            if(result.length==3){
                beginDate = parseDate(result[1])
                endDate = parseDate(result[2])
                return {beginDate,endDate};
            }
        }
    }
}

const parseBorrowNum = (lines)=>{
    let regex = /借款本金数额/,lineNum=0,result,num
    let getNum = (lineNum)=>{
        let results = [],line,num,start=false,end=false
        for(let i=lineNum;i<lineNum+12;i++){
            line = lines[i]
            if(line.match(/^\d$/)){
                start = true
                results.push(line)
            }else{
                end = start?true:false
            }
            if(start&&end){
                break
            }
        }
        if(results.length){
            num = parseInt(results.join(''))/100
        }
        return num
    }
    for(let line of lines){
        lineNum++
        result = regex.exec(line)
        if(result){
            num = getNum(lineNum)
            break
        }

    }
    return num
}

const parseAll = (lines)=>{
    const PersonalType = '个人'
    let signDate,borrowerName,borrowerType=PersonalType,
        borrowerYooliID,borrowerID,contractType,myLends,myLendsTotal,
        lender,assurance,contractDate,expired=false,borrowNum
    signDate = parseSignDate(lines)
    borrowerName = parseBorrowerName(lines)
    if(borrowerName.match('公司')||borrowerName.match('酒店')||borrowerName.match('网吧')){
        borrowerType = '公司'
    }
    if(borrowerType==PersonalType){
        borrowerYooliID = parseBorrowerYooliId(lines)
    }
    borrowerID = parseBorrowerId(lines)
    contractType = parseContractType(lines)
    myLends = parseMyLends(lines)
    if(myLends.length>0){
        myLendsTotal = myLends.reduce((a, b) => a + b, 0)
    }else{
        myLends = undefined
    }
    lender = parseLender(lines)
    assurance = parseAssurance(lines)
    contractDate = parseContractDate(lines)
    if(contractDate&&contractDate.endDate){
        expired = moment(contractDate.endDate).isBefore(moment())
    }
    borrowNum = parseBorrowNum(lines)
    return Object.assign(contractDate,{signDate,borrowerName,borrowerType,borrowerYooliID,borrowerID,contractType,myLends,myLendsTotal,lender,assurance,expired,borrowNum})
}

const parsePdf = async (filePath)=>{
    return new Promise((resolve,reject)=>{
        let lines = [],parsed
        new PdfReader().parseFileItems(filePath, function(err, item) {
            if (err) reject(err);
            else if (!item) {
                parsed = parseAll(lines)
                resolve({parsed,lines});
            }
            else if (item.text) {
                lines.push(item.text)
            }
        });
    })
}

module.exports = {parsePdf}


