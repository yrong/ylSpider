const path = require('path')
const fs = require('fs')
const jsonfile = require('jsonfile')

const downloadPath = path.resolve("../download",'20200413')
const allPath = path.resolve("../download",'all')
const plans = fs.readdirSync(downloadPath)
let allContracts = []

for(let plan of plans){
    let files = fs.readdirSync(downloadPath + "/" + plan),contracts
    for(let file of files){
        if(file.endsWith('contracts.json')){
            contracts = jsonfile.readFileSync(downloadPath + "/" + plan + '/' + file)
            allContracts = allContracts.concat(contracts)
        }
    }
}

jsonfile.writeFileSync(allPath + '/contracts.json',allContracts,{ spaces: 2 })
