const Crawler = require("crawler");

let daily_data={}
let yooli_crawler = new Crawler({
    maxConnections : 1,
    callback : function (error, res, done) {
        if(error){
            console.log(error);
        }else{
            let $ = res.$;
            let total_money = parseInt($("div.da_center dl.dac_dl1 dt span").text().substr(1).replace(/,/g,''))
            daily_data.total_money = total_money
            let total_loan_money = parseInt($(".loan_data dl dt[data-selector='total_loan_money']").text().replace(/,/g,''));
            daily_data.total_loan_money = total_loan_money
            let cur_borrow_users = parseInt($(".loan_data dl dt[data-selector='cur_borrow_users']").text().replace(/,/g,''));
            daily_data.cur_borrow_users = cur_borrow_users
            let total_loan_balance_num = parseInt($(".loan_data dl dt[data-selector='total_loan_balance_num']").text().replace(/,/g,''));
            daily_data.total_loan_balance_num = total_loan_balance_num
        }
        done()
    }
});
yooli_crawler.queue('https://e.yooli.com/statistic/platform/');

yooli_crawler.on('drain',function(){
    console.log(daily_data)
});
