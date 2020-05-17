const router = new require('koa-router')()
const nifa = require('./nifa')
const yooli = require('./yooli')
const ContractDownloader = require('./contract');
const search = require('./search')
const SearchIndexPrefix = process.env['SearchIndexPrefix']||'yooli_contract_'

router.get('/nifa', async (ctx, next) => {
    let data = await nifa.gather(ctx.request.query.refresh)
    ctx.body = data;
});

router.post('/yooli', async (ctx, next) => {
    let data = await yooli.retrieve(yooli.indexName,ctx.request.body)
    ctx.body = data;
});

router.post('/contract',async (ctx,next) =>{
    let {username,passwd} = ctx.request.body
    let contractDownloader = new ContractDownloader(username,passwd)
    let url = await contractDownloader.download()
    ctx.body = url
})

router.get('/contract/:index',async (ctx,next) =>{
    let index = SearchIndexPrefix + ctx.params.index
    let data = await search.retrieve(index, {})
    ctx.body = data
})

router.get('/contract_index',async (ctx,next) =>{
    let result = await search.cat(SearchIndexPrefix + '*')
    if(result&&result.length){
        result = result.map((data)=>data.replace(SearchIndexPrefix,'')).sort().reverse()
    }else{
        result = []
    }
    ctx.body = result
})

router.get('/contract_analysis/:index',async (ctx,next) =>{
    let index = SearchIndexPrefix + ctx.params.index
    let query = {
        "body":{
            "aggs": {
                "borrowerType" : {
                    "terms" : { "field" : "borrowerType" }
                },
                "assurance": {
                    "terms" : { "field" : "assurance" },
                    "aggs":{
                        "borrowNum" : { "sum" : { "field" : "borrowNum" } }
                    }
                },
                "contractType" : {
                    "terms" : { "field" : "contractType" }
                },
                "expired": {
                    "terms" : { "field" : "expired" }
                },
                "cheat": {
                    "terms" : { "field" : "cheat" }
                },
                "borrowerYooliID": {
                    "terms" : { "field" : "borrowerYooliID" }
                },
                "beginDate" : {
                    "date_histogram": {
                        "field": "beginDate",
                        "interval": "year",
                        "format": "yyyy"
                    }
                },
                "endDate" : {
                    "date_histogram": {
                        "field": "endDate",
                        "interval": "year",
                        "format": "yyyy"
                    }
                },
                "myAmount":{
                    "range":{
                        "field":"myAmount",
                        "ranges":[
                            {"key":'小于1000',"to":1000},
                            {"key":'1000至3000',"from":1000,"to":3000},
                            {"key":'3000至5000',"from":3000,"to":5000},
                            {"key":'大于5000',"from":5000}
                        ]
                    }
                }
            }
        }
    }
    let result = await search.retrieve(index, query)
    ctx.body = result
})

module.exports = router
