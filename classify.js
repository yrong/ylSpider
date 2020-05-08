require('dotenv').config();

const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const jsonfile = require('jsonfile')
const parse = require('./parse')
const allDir = './download/all',classifiedDir = './download/classified' ,
    regex=/^loanagreement_(.*)\.pdf$/,StartSignDate = process.env['StartSignDate']
let result,filepath,match,contract,contracts=[],classified,classified_obj,num=0,
    assurance,srcFile,dstFile,signed_num,unsigned_num,total_num;

(async () => {
    await mkdirp(allDir)
    await mkdirp(classifiedDir)
    const files = await fs.readdirSync(allDir);
    for (let file of files) {
        match = regex.exec(file)
        if (match&&match.length) {
            filepath = path.join(allDir, file);
            result = await parse.parsePdf(filepath)
            console.log(JSON.stringify(result.parsed, null, 2))
            contract = result.parsed
            contract.id = contract.loanId = match[1]
            contracts.push(contract)
        }
    }
    // jsonfile.writeFileSync(allDir + '/contracts.json',contracts,{ spaces: 2 })
    classified = contracts.reduce(function (obj, contract) {
        assurance = contract.assurance;
        if (!obj.hasOwnProperty(assurance)) {
            obj[assurance] = {};
            obj[assurance]['contract'] = []
        }
        obj[assurance]['contract'].push(contract);
        return obj;
    }, {});
    for(let assurance in classified){
        signed_num = unsigned_num = total_num = 0
        await mkdirp(classifiedDir + '/' + assurance)
        await mkdirp(classifiedDir + '/' + assurance + '/signed')
        await mkdirp(classifiedDir + '/' + assurance + '/unsigned')
        for(let contract of classified[assurance]['contract']){
            srcFile = allDir + '/' + 'loanagreement_' + contract.id + '.pdf'
            if(contract.signDate>StartSignDate){
                dstFile = classifiedDir + '/' + assurance + '/signed' + '/' + 'loanagreement_' + contract.id + '.pdf'
                signed_num+=contract.borrowNum
            }else{
                dstFile = classifiedDir + '/' + assurance + '/unsigned' + '/' + 'loanagreement_' + contract.id + '.pdf'
                unsigned_num+=contract.borrowNum
            }
            if(!fs.existsSync(dstFile)){
                fs.copyFileSync(srcFile, dstFile)
            }
            total_num+=contract.borrowNum
        }
        classified_obj={signed_num,unsigned_num,total_num}
        console.log(JSON.stringify(classified_obj, null, 2))
        classified[assurance] = classified_obj
    }
    jsonfile.writeFileSync(classifiedDir + '/result.json',classified,{ spaces: 2 })
})().catch((e) => {
    console.log(e)
})
