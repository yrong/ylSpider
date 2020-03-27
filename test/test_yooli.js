(async() => {
    const yooli = require('../yooli')
    let data = await yooli.gather()
    console.log(data)
    await yooli.save(data)
    const params = {
        "body":
            {
                "query": {
                    "bool":{
                        "must":[]
                    }
                },
                "sort" : [
                    { "create_date" : {"order" : "asc"}}]
            }
    }
    let result = await yooli.retrieve(params)
    console.log(result)
})();

