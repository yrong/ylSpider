
const path = require('path')
const jsonfile = require('jsonfile')

const fixCompanyName = (name)=>{
    let pattern = /(.*?公司).*?/
    let result = pattern.exec(name)
    if(result){
        if(result.length==2||result.length==3){
            result = result[result.length-1]||result[result.length-2]
            return result
        }
    }
    return name
}

const filePath = path.resolve("./download",'all','contracts.json')
let contracts = jsonfile.readFileSync(filePath)
for(let contract of contracts){
    if(contract.assurance){
        contract.assurance = fixCompanyName(contract.assurance)
    }
    if(contract.lender){
        contract.lender = fixCompanyName(contract.lender)
    }
}
jsonfile.writeFileSync('./download/all/contracts.json',contracts,{ spaces: 2 })

