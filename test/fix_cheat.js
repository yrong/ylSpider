const path = require('path')
const jsonfile = require('jsonfile')

const delCheat = async ()=>{
    const filePath = path.resolve("./download",'all','contracts.json')
    let contracts = jsonfile.readFileSync(filePath)
    for(let contract of contracts){
        if(contract.borrowerType==='公司'){
            delete contract.cheat
        }
    }
    jsonfile.writeFileSync(filePath,contracts,{ spaces: 2 })
}

const generateBorrows = async ()=>{
    const filePath = path.resolve("./download",'all','contracts.json')
    let contracts = jsonfile.readFileSync(filePath),allBorrowers=[]
    for(let contract of contracts){
        if(contract.cheat!=undefined){
            allBorrowers.push(
                {
                    borrowerName: contract.borrowerName,
                    borrowerType: contract.borrowerType,
                    borrowerYooliID: contract.borrowerYooliID,
                    cheat: contract.cheat
                }
            )
        }else{
            console.log('not check yet')
        }
    }
    jsonfile.writeFileSync('./download/all/borrowers.json',allBorrowers,{ spaces: 2 })
}


(async() => {
    await delCheat()
    await generateBorrows()
})();
