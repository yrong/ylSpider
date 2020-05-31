
const path = require('path')
const jsonfile = require('jsonfile')
const fs = require('fs')
const downloadPath = path.resolve("./download",'ronyang')
const dateDirs = fs.readdirSync(downloadPath)
let srcPath,dstPath,exist,contracts

for(let dateDir of dateDirs) {
    srcPath = downloadPath + "/" + dateDir + '/contracts.json'
    dstPath = downloadPath + "/" + dateDir + '/contracts_compare.json'
    exist = fs.existsSync(srcPath)
    if(exist){
        contracts = jsonfile.readFileSync(srcPath)
        for(let contract of contracts){
            delete contract.planActualAmount
        }
        jsonfile.writeFileSync(dstPath,contracts,{ spaces: 2 })
    }
}




