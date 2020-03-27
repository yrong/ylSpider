const router = new require('koa-router')()
const nifa = require('./nifa')
const yooli = require('./yooli')

router.get('/nifa', async (ctx, next) => {
    let data = await nifa.gather(ctx.request.query.refresh)
    ctx.body = data;
});

router.post('/yooli', async (ctx, next) => {
    let data = await yooli.retrieve(ctx.request.body)
    ctx.body = data;
});

module.exports = router
