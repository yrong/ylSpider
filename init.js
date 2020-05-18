(async() => {
    const search = require('./search')
    await search.init()
    console.log('init es finished')
})().catch((e)=>{
    console.log(e)
})
