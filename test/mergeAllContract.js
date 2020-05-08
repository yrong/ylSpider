const path = require('path')
const fs = require('fs')
const jsonfile = require('jsonfile')
const mkdirp = require('mkdirp')

const downloadPath = path.resolve("./download",'20200508')
const downloadAllPath = path.resolve("./download",'all')
mkdirp.sync(downloadAllPath)

const plans = fs.readdirSync(downloadPath)
let allContracts = [],srcFile,dstFile

for(let plan of plans){
    let files = fs.readdirSync(downloadPath + "/" + plan),contracts
    for(let file of files){
        if(file.endsWith('contracts.json')){
            contracts = jsonfile.readFileSync(downloadPath + "/" + plan + '/' + file)
            allContracts = allContracts.concat(contracts)
        }
        else if(file.match(/^loanagreement_(.*)\.pdf$/)) {
            srcFile = downloadPath + "/" + plan + "/" + file
            dstFile = downloadAllPath + "/" + file
            fs.copyFileSync(srcFile, dstFile)
        }
    }
}

jsonfile.writeFileSync(downloadAllPath + '/contracts.json',allContracts,{ spaces: 2 })
