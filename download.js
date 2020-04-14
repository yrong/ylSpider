require('dotenv').config();
const contract = require('./contract');

(async() => {
    await contract.download()
})().catch((e)=>{
    console.log(e)
})

