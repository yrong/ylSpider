const Crawler = require("crawler");

let yooli_crawler = new Crawler({
    maxConnections : 1,
    callback : function (error, res, done) {
        if(error){
            console.log(error);
        }else{
            let $ = res.$,data={};
            let total_money = parseInt($("div.da_center dl.dac_dl1 dt span").text().substr(1).replace(/,/g,''))
            data.total_money = total_money
            let total_loan_money = parseInt($(".loan_data dl dt[data-selector='total_loan_money']").text().replace(/,/g,''));
            data.total_loan_money = total_loan_money
            let cur_borrow_users = parseInt($(".loan_data dl dt[data-selector='cur_borrow_users']").text().replace(/,/g,''));
            data.cur_borrow_users = cur_borrow_users
            let total_loan_balance_num = parseInt($(".loan_data dl dt[data-selector='total_loan_balance_num']").text().replace(/,/g,''));
            data.total_loan_balance_num = total_loan_balance_num
            let nifa_crawler = new Crawler()//
            nifa_crawler.direct({
                uri: 'http://dp.nifa.org.cn/HomePage?method=getTargetOrgInfo&sorganation=911101085977302834',
                callback: (error,response)=>{
                    let $ = response.$;
                    let rows = $("div#trade-log table.right-table tr:not(:first-child)"),cols,col
                    rows.each(function(index){
                        $(this).find('td').each(function(index) {
                            col = $(this).text().replace(/\r?\n|\r|\t/g,'')
                            console.log(col)
                        })
                    })
                    done();
                }
            })
        }
    }
});
yooli_crawler.queue('https://e.yooli.com/statistic/platform/');

yooli_crawler.on('drain',function(){
    console.log('hello')
});
