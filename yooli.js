const Crawler = require("crawler")
const search = require('./search')

const gather = ()=>{
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
                    let total_borrow_users = parseInt($("div.da_center dl:nth-child(2) dt span").text().replace(/,/g,''))
                    daily_data.total_borrow_users = total_borrow_users//出借人总数
                    let total_loan_money = parseInt($(".loan_data.second dl dt[data-selector='total_loan_money']").text().replace(/,/g,''));
                    daily_data.total_loan_money = total_loan_money//累计借贷金额
                    let cur_borrow_users = parseInt($(".loan_data.second dl dt[data-selector='cur_borrow_users']").text().replace(/,/g,''));
                    daily_data.cur_borrow_users = cur_borrow_users//当前借款人数量
                    let total_loan_remainder_num = parseInt($(".loan_data.second dl dt[data-selector='total_loan_balance_num']").text().replace(/,/g,''));
                    daily_data.total_loan_remainder_num = total_loan_remainder_num//借贷余额笔数
                    let interest_remainder = parseInt($(".loan_data.second dl:nth-of-type(4) dt").text().replace(/,/g,''));
                    daily_data.interest_remainder = interest_remainder//利息余额
                    let currDate = new Date().toISOString().replace(/(T.+)/,'').replace(/\-/g,'')
                    daily_data.currDate = currDate
                    daily_data.id = currDate
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

const indexName = 'yooli_data'

const gatherSave = async ()=>{
    let data = await gather();
    await search.save(indexName,data);
    return data;
}

const retrieve = async (params)=>{
    let data = await search.retrieve(indexName,params)
    return data
}

module.exports = {gather,gatherSave,retrieve,indexName}
