require('dotenv').config();

const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const jsonfile = require('jsonfile')
const parse = require('./parse')
const allDir = './download/all',classifiedDir = './download/classified' ,
    regex=/^loanagreement_(.*)\.pdf$/,StartSignDate = process.env['StartSignDate']
let result,filepath,match,contract,contracts=[],allContracts,classified,classified_obj,exist,
    assurance,srcFile,dstFile,signed_num,unsigned_num,total_num;

(async () => {
    await mkdirp(allDir)
    await mkdirp(classifiedDir)
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
                result = await parse.parsePdf(filepath)
                console.log(JSON.stringify(result.parsed, null, 2))
                contract = result.parsed
                contract.id = contract.loanId = match[1]
                contracts.push(contract)
            }
        }
    }
    classified = contracts.reduce(function (obj, contract) {
        assurance = contract.assurance;
        if (!obj.hasOwnProperty(assurance)) {
            obj[assurance] = {};
            obj[assurance]['contract'] = []
        }
        obj[assurance]['contract'].push(contract);
        return obj;
    }, {});
    let all_num = 0
    for(let assurance in classified){
        signed_num = unsigned_num = total_num = 0
        await mkdirp(classifiedDir + '/' + assurance)
        await mkdirp(classifiedDir + '/' + assurance + '/有章')
        await mkdirp(classifiedDir + '/' + assurance + '/无章')
        for(let contract of classified[assurance]['contract']){
            srcFile = allDir + '/' + 'loanagreement_' + contract.id + '.pdf'
            if(contract.signDate>StartSignDate){
                dstFile = classifiedDir + '/' + assurance + '/有章' + '/' + 'loanagreement_' + contract.id + '.pdf'
                signed_num+=contract.borrowNum
            }else{
                dstFile = classifiedDir + '/' + assurance + '/无章' + '/' + 'loanagreement_' + contract.id + '.pdf'
                unsigned_num+=contract.borrowNum
            }
            if(!fs.existsSync(dstFile)){
                fs.copyFileSync(srcFile, dstFile)
            }
            total_num+=contract.borrowNum
        }
        all_num+=total_num
        classified_obj={signed_num,unsigned_num,total_num}
        console.log(JSON.stringify(classified_obj, null, 2))
        classified[assurance] = classified_obj
    }
    for(let assurance in classified){
        classified[assurance]['percent']=classified[assurance]['total_num']/all_num
    }
    jsonfile.writeFileSync(classifiedDir + '/result.json',classified,{ spaces: 2 })
})().catch((e) => {
    console.log(e)
})
