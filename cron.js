const cron = require('node-cron')
const yooli = require('./yooli')
const contract = require('./contract')
cron.schedule('0 2 * * *', function(){
    contract.download().then(()=>{
        console.log('download contract success')
    }).catch((err)=>{
        console.log(err)
    })
});
