(async() => {
    const contract = require('./contract')
    await contract.download()
})().catch((e)=>{
    console.log(e)
})

