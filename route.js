const router = new require('koa-router')()
const nifa = require('./nifa')
const yooli = require('./yooli')
const contract = require('./contract')

router.get('/nifa', async (ctx, next) => {
    let data = await nifa.gather(ctx.request.query.refresh)
    ctx.body = data;
});

router.post('/yooli', async (ctx, next) => {
    let data = await yooli.retrieve(yooli.indexName,ctx.request.body)
    ctx.body = data;
});

router.post('/contract',async (ctx,next) =>{
    if(router.downloading){
        throw new Error('他人下载中,请等候...')
    }
    router.downloading = true;
    let {username,passwd} = ctx.request.body
    let url = await contract.download(username,passwd)
    router.downloading = false;
    ctx.body = url
})

module.exports = router
