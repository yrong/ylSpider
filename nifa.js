const Crawler = require("crawler")
let monthly_data;
const maxNum = 20;

const gather = async (refresh)=>{
    return new Promise((resolve,reject)=>{
        if(!refresh&&monthly_data&&monthly_data.length){
            resolve(monthly_data)
            return;
        }
        let nifa_crawler = new Crawler({
            maxConnections : 1,
            callback : function (error,response,done) {
                if(error) {
                    reject(error)
                }
                monthly_data = []
                let $ = response.$;
                let findDeprecatedRows = ()=>{
                    let rows = $("div#trade-log table.left-table1 tr:not(:first-child)"),deprecated=[];
                    rows.each(function(index){
                        if($(this).find('td.scrap_date').length){
                            deprecated.push(index)
                        }
                    })
                    return deprecated
                }
                let deprecated = findDeprecatedRows();
                let rows = $("div#trade-log table.right-table tr:not(:first-child)"),row,col;
                rows.each(function(row_index){
                    row = {}
                    if(deprecated.includes(row_index)){
                        return;
                    }
                    if(row_index>maxNum){
                        return false;
                    }
                    $(this).find('td').each(function(index) {
                        col = $(this).text().replace(/\r?\n|\r|\t/g,'')
                        switch(index) {
                            case 0:
                                row.total = parseInt(col)//累计借贷金额(万元)
                                break
                            case 1:
                                row.total_loan_num = parseInt(col)//累计借贷笔数(笔)
                                break;
                            case 2:
                                row.total_borrow_num = parseInt(col)//累计出借笔数(笔)
                                break;
                            case 3:
                                row.curr_loan = parseInt(col) //借贷余额(万元)
                                break;
                            case 4:
                                row.curr_loan_num = parseInt(col) //借贷余额笔数(笔)
                                break;
                            case 6:
                                row.total_borrower_num = parseInt(col) //累计出借人数量(人)
                                break;
                            case 7:
                                row.total_loaner_num = parseInt(col) //累计借款人数量(人)
                                break;
                            case 8:
                                row.curr_borrower_num = parseInt(col) //当前出借人数量(人)
                                break;
                            case 9:
                                row.curr_loaner_num = parseInt(col) //当前借款人数量(人)
                                break;
                            case 14:
                                row.overdue = parseInt(col) //逾期金额(万元)
                                break;
                            case 15:
                                row.overdue_num = parseInt(col) //逾期笔数
                                break;
                            case 18:
                                row.total_pay = parseInt(col) //累计代偿金额(万元)
                                break;
                            case 19:
                                row.total_pay_num = parseInt(col) //累计代偿笔数(笔)
                                break;
                        }
                    })
                    monthly_data.push(row)
                })
                done();
            }
        })

        nifa_crawler.queue('http://dp.nifa.org.cn/HomePage?method=getTargetOrgInfo&sorganation=911101085977302834');

        nifa_crawler.on('drain',function(){
            resolve(monthly_data)
        });
    })
}

module.exports = {gather}
