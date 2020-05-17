require('dotenv').config()
const Koa = require('koa')
const koaBody = require('koa-body')
const cors = require('kcors')
const statics = require('koa-static')
const app = module.exports = new Koa()
const Router = require('koa-router')
const router = new Router()
const apis = require('./route')
const port = parseInt(process.env['Port'])

app.use(cors())
app.use(koaBody({
    jsonLimit: '10mb',
    formLimit: '10mb',
    textLimit: '10mb',
    parsedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    multipart: true,
    formidable: {
        uploadDir: './download'
    },
}));

app.use(async function(ctx, next) {
    try {
        const start = new Date()
        await next();
        const ms = new Date() - start
        console.log('%s %s - %s ms', ctx.method,ctx.originalUrl, ms)
    } catch (error) {
        if(ctx.path.includes('contract')&&router.downloading){
            router.downloading = false
        }
        ctx.status = error.status || 500;
        ctx.body = error.message||error;
        console.error('%s %s - %s', ctx.method,ctx.originalUrl, error.stack || error)
    }
});


app.use((statics('./public')))
app.use((statics('./download')))

router.use('/api', apis.routes(), apis.allowedMethods());
app.use(router.routes());

if (!module.parent) app.listen(port,async ()=>{
    console.log(`server started,open http://localhost:${port}`)
});

process.on('uncaughtException', (err) => {
    console.log(`Caught exception: ${err}`)
})
