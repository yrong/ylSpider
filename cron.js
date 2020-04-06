const cron = require('node-cron')
cron.schedule('0 2 * * *', function(){
    const contract = require('./contract')
    contract.download().then(()=>{
        console.log('download contract success')
    }).catch((err)=>{
        console.log(err)
    })
});
