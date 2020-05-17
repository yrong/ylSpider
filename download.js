require('dotenv').config();
const ContractDownloader = require('./contract');

(async() => {
    let contractDownloader = new ContractDownloader()
    await contractDownloader.download()
})().catch((e)=>{
    console.log(e)
})

