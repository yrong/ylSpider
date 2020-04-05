(async() => {
    const search = require('./search')
    await search.init()
})().catch((e)=>{
    console.log(e)
})
