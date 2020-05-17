require('dotenv').config()
const cron = require('node-cron')
const ContractDownloader = require('./contract');

cron.schedule('0 2 * * *', function(){
    let contractDownloader = new ContractDownloader()
    contractDownloader.download().then(()=>{
        console.log('download contract success')
    }).catch((err)=>{
        console.log(err)
    })
});
