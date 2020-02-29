const router = new require('koa-router')()
const nifa = require('./nifa')

router.get('/monthly', async (ctx, next) => {
    let data = await nifa.gather()
    ctx.body = data;
});

module.exports = router
