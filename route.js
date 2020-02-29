const router = new require('koa-router')()
const nifa = require('./nifa')

module.exports = (app)=>{

    router.get('/monthly', async (ctx, next) => {
        let data = await nifa.gather()
        ctx.body = data;
    });

    app.use(router.routes()).use(router.allowedMethods());
}
