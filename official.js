const Crawler = require("crawler")
const { Client } = require('@elastic/elasticsearch')
const client = new Client({ node: `http://${process.env['ES_HOST']||'localhost'}:9200` })

const crawl = ()=>{
    return new Promise((resolve,reject)=>{
        let daily_data={}
        let yooli_crawler = new Crawler({
            maxConnections : 1,
            callback : function (error, res, done) {
                if(error){
                    reject(error)
                    return;
                }else{
                    let $ = res.$;
                    let total_money = parseInt($("div.da_center dl.dac_dl1 dt span").text().substr(1).replace(/,/g,''))
                    daily_data.total_money = total_money//交易总额
                    let total_loan_money = parseInt($(".loan_data.second dl dt[data-selector='total_loan_money']").text().replace(/,/g,''));
                    daily_data.total_loan_money = total_loan_money//累计借贷金额
                    let cur_borrow_users = parseInt($(".loan_data.second dl dt[data-selector='cur_borrow_users']").text().replace(/,/g,''));
                    daily_data.cur_borrow_users = cur_borrow_users//当前借款人数量
                    let total_loan_remainder_num = parseInt($(".loan_data.second dl dt[data-selector='total_loan_balance_num']").text().replace(/,/g,''));
                    daily_data.total_loan_remainder_num = total_loan_remainder_num//借贷余额笔数
                    let interest_remainder = parseInt($(".loan_data.second dl:nth-of-type(4) dt").text().replace(/,/g,''));
                    daily_data.interest_remainder = interest_remainder//利息余额
                }
                done()
            }
        });
        yooli_crawler.queue('https://e.yooli.com/statistic/platform/');

        yooli_crawler.on('drain',function(){
            resolve(daily_data)
        });
    })
}

const gather = async ()=>{
    const templateMapping =
        {
            "mappings": {
                    "dynamic_templates": [
                        {
                            "as_date": {
                                "match_mapping_type": "long",
                                "match":   "*_date",
                                "mapping": {
                                    "type": "date"
                                }
                            }
                        },
                        {
                            "as_text": {
                                "match_pattern": "regex",
                                "match":   ".*_analysis$|.*_chinese$",
                                "mapping": {
                                    "type": "text"
                                }
                            }
                        },
                        {
                            "as_keyword": {
                                "match_mapping_type": "string",
                                "match":   "*",
                                "mapping": {
                                    "type": "keyword"
                                }
                            }
                        }
                    ]
            }
        }
    const index = 'yooli'
    try{
        await client.indices.create({index, body: templateMapping})
    }catch(err){
    }
    let data = await crawl()
    await client.index({
        index: 'yooli',
        id: JSON.stringify(data),
        body: {...data,create_date:Date.now()},
        refresh:true
    })
}

gather().then((data)=>{
    console.log('gather success')
}).catch((err)=>{
    console.log(err)
})

module.exports = {gather}
