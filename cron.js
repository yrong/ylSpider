const cron = require('node-cron')
const yooli = require('./yooli')
cron.schedule('0 2 * * *', function(){
    yooli.gatherSave().then((data)=>{
        console.log(data)
        console.log('gather and save to elasticsearch success')
    }).catch((err)=>{
        console.log(err)
    })
});
