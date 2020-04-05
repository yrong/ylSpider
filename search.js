const { Client } = require('@elastic/elasticsearch')
const client = new Client({ node: `http://${process.env['ES_HOST']||'localhost'}:9200` })

const init = async (index) => {
    await client.indices.putTemplate({
        "name": 'yooli',
        "body":{
            "index_patterns": ["yooli*"],
            "settings": {
                "number_of_shards": 1
            },
            "mappings": {
                "dynamic_templates": [
                    {
                        "as_text": {
                            "match_pattern": "regex",
                            "match": ".*_analysis$|.*_chinese$",
                            "mapping": {
                                "type": "text"
                            }
                        }
                    },
                    {
                        "as_keyword": {
                            "match_mapping_type": "string",
                            "match": "*",
                            "mapping": {
                                "type": "keyword"
                            }
                        }
                    },
                    {
                        "as_date": {
                            "match_pattern": "regex",
                            "match": ".*date$|.*Date$",
                            "mapping": {
                                "type": "date"
                            }
                        }
                    }
                ]
            }
        }
    })
}

const save = async (index,data)=>{
    let saveObj = {
        index: index,
        body: {...data,createDate:Date.now()},
        refresh:true
    }
    if(data.id){
        saveObj.id = data.id
    }
    await client.index(saveObj)
}

const retrieve = async (index,params)=>{
    let query = params.uuid?`uuid:${params.uuid}`:(params.keyword?params.keyword:'*');
    let _source = params.source?params.source:true;
    params.page = (params.page&&parseInt(params.page))||1
    params.per_page = (params.per_page&&parseInt(params.per_page))||1000
    let from = (params.page-1)*params.per_page
    let params_pagination = {"from":from,"size":params.per_page}
    let queryObj = params.body?{body:params.body}:{q:query}
    if(params.body&&params.body.aggs){
        params_pagination = {size:0}
        params.aggs = true
    }
    let searchObj = Object.assign({
        index: index,
        _source:_source
    },queryObj,params_pagination)
    let result = await client.search(searchObj)
    if(params.aggs){
        result = result.body.aggregations
    }else{
        result =  {count:result.body.hits.total.value,results:result.body.hits.hits.map((result)=>result._source)}
    }
    return result
}

const batchSave = async (index,items)=>{
    let bulks = [],bulk_action,bulk_obj
    for (let item of items) {
        bulk_obj = item
        bulk_action = {_index: index}
        if(item.id){
            bulk_action._id = item.id
        }
        bulks.push({index:bulk_action})
        bulks.push(bulk_obj)
    }
    return await client.bulk({body:bulks,refresh:true})
}

module.exports = {init,save,retrieve,batchSave}
