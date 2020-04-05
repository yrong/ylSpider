(async() => {
    const yooli = require('../yooli')
    let data = await yooli.gather()
    await yooli.gatherSave(yooli.indexName,data)
    const params = {
        "body":
            {
                "query": {
                    "bool":{
                        "must":[]
                    }
                },
                "sort" : [
                    { "createDate" : {"order" : "asc"}}]
            }
    }
    let result = await yooli.retrieve(params)
    console.log(result)
})();

