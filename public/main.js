const nifaLineChart = ()=>{
    const labels = ['2020-3','2020-2','2020-1', '2019-12', '2019-11', '2019-10', '2019-9', '2019-8', '2019-7',
        '2019-6','2019-5','2019-4','2019-3','2019-2','2019-1','2018-12','2018-11',
        '2018-10','2018-9','2018-8'].reverse();

    let lineChartData = {
        labels: labels,
        datasets: [{
            borderColor: window.chartColors.blue,
            backgroundColor: window.chartColors.blue,
            fill: false,
            yAxisID: 'y-axis-1'
        }]
    };

    const urlParams = new URLSearchParams(window.location.search);
    const refresh = urlParams.get('refresh');
    const url = '/api/nifa' + (refresh?'?refresh=1':'')
    $.get(url, function(data) {
        let curr_loan = data.map((month)=>month.curr_loan).reverse()
        lineChartData.datasets[0].label = '借贷余额(万元)';
        lineChartData.datasets[0].data = curr_loan;
        var ctx = document.getElementById('nifa_canvas').getContext('2d');
        window.nifaLine = Chart.Line(ctx, {
            data: lineChartData,
            options: {
                responsive: true,
                hoverMode: 'index',
                stacked: false,
                title: {
                    display: true,
                    text: '有利统计数据'
                },
                scales: {
                    yAxes: [{
                        type: 'linear', // only linear but allow scale type registration. This allows extensions to exist solely for log scale for instance
                        display: true,
                        position: 'left',
                        id: 'y-axis-1',
                    }],
                }
            }
        });

        $( "#nifa_dimension" ).change(function() {
            let dimension = $(this).val();
            let dimension_label = $("#nifa_dimension option:selected").text();
            let dimension_data = data.map((month)=>month[dimension]).reverse()
            lineChartData.datasets[0].label = dimension_label;
            lineChartData.datasets[0].data = dimension_data;
            window.nifaLine.update();
        });
    });
}

const yooliLineChart = ()=>{
    const url = '/api/yooli'
    const queryParams = {
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
    $.post(url, queryParams,function(data) {
        if(data&&data.results){
            let ctx = document.getElementById('yooli_canvas').getContext('2d');
            let color = Chart.helpers.color;
            let dateData = data.results.map((result)=>{
                return moment(result.create_date)
            })
            let total_money = data.results.map((result)=>result.total_money)
            let config = {
                type: 'line',
                data: {
                    labels: dateData,
                    datasets: [{
                        label: '交易总额',
                        backgroundColor: color(window.chartColors.red).alpha(0.5).rgbString(),
                        borderColor: window.chartColors.red,
                        fill: false,
                        data: total_money
                    }]
                },
                options: {
                    title: {
                        text: '每日数据'
                    },
                    scales: {
                        xAxes: [{
                            type: 'time',
                            time: {
                                parser: 'MM/DD/YYYY',
                                tooltipFormat: 'll HH:mm'
                            },
                            scaleLabel: {
                                display: true,
                                labelString: 'Date'
                            }
                        }],
                        yAxes: [{
                            scaleLabel: {
                                display: true,
                                labelString: 'value'
                            }
                        }]
                    },
                }
            };
            window.yooliLine = new Chart(ctx, config)

            $( "#yooli_dimension" ).change(function() {
                let dimension = $(this).val();
                let dimension_label = $("#yooli_dimension option:selected").text();
                let dimension_data = data.results.map((result)=>result[dimension])  //data.map((month)=>month[dimension]).reverse()
                config.data.datasets[0].label = dimension_label;
                config.data.datasets[0].data = dimension_data;
                window.yooliLine.update();
            });
        }
    });
}

const initDownloadAction = ()=>{
    function download(url) {
        let element = document.createElement('a');
        element.setAttribute('href', url);
        element.setAttribute('download', 'contracts.json');
        document.body.appendChild(element);
        element.click();
        setTimeout(function() {
            URL.revokeObjectURL(element.href);
        }, 0);
        document.body.removeChild(element);
    }
    $('#downloadContract').click((evt)=>{
        evt.stopPropagation()
        let username = $('#username').val()
        let passwd = $('#passwd').val()
        let spinner = new Spin.Spinner().spin(document.getElementById('contract'));
        $('#downloadContract').attr("disabled", true);
        $.post('/api/contract',{username,passwd}).done((url)=>{
            spinner.stop();
            $('#downloadContract').attr("disabled", false);
            console.log('contract download success')
            download(url)
        }).fail((xhr)=>{
            spinner.stop();
            $('#downloadContract').attr("disabled", false);
            alert(xhr.responseText)
        })
    })
}

const initContractTable = () => {
    let colDef = [{
        field: 'beginDate',
        title: '开始日期',
        sortable: true
    }, {
        field: 'endDate',
        title: '结束日期',
        sortable: true
    }, {
            field: 'borrowerName',
            title: '借款人名'
    }, {
            field: 'borrowerType',
            title: '借款人类型',
             sortable: true
    }, {
            field: 'myAmount',
            title: '出借金额',
            sortable: true
    },{
        field: 'cheat',
        title: '是否老赖',
        sortable: true
    },{
        field: 'expired',
        title: '是否逾期',
        sortable: true
    },{
        field: 'borrowerID',
        title: '借款人证件号'
    },{
        field: 'borrowerYooliID',
        title: '借款人有利编号',
        sortable: true
    },{
        field: 'myLendsTotal',
        title: '实际出借金额'
    }, {
        field: 'id',
        title: '合同编号'
    },{
            field: 'assurance',
            title: '担保方'
    }, {
            field: 'detailUrl',
            title: '合同链接'
    }, {
            field: 'creditUrl',
            title: '债转链接'
    }]
    $('#contractTbl').bootstrapTable({
        columns: colDef,
        pagination: true,
        pageSize:200,
        pageList:[50,100,200,500,'All'],
        search: true,
        searchAlign: 'left'
    })
    $.get('/api/contract_index', function (data) {
        $('#contractIndex').find('option').remove()
        if (data && data.length) {
            $.each(data, function (index, value) {
                $('#contractIndex').append(new Option(value, value));
            })
            $.get('/api/contract/' + data[0], function (contract) {
                $('#contractTbl').bootstrapTable('load', contract.results)
            })
        }
    })

    $('#contractIndex').change(function() {
        let index = this.value;
        $.get('/api/contract/' + index, function (contract) {
            $('#contractTbl').bootstrapTable('load', contract.results)
        })
    });

    $('#analysisBtn').click(()=>{
        let index = $('#contractIndex').val(),assuranceObj = {},beginDateObj = {},endDateObj={},
            expiredObj = {}, cheatObj = {},borrowerTypeObj = {},myAmountObj = {},contractTypeObj = {};
        $.get('/api/contract_analysis/' + index, function (result) {
            let data = result.aggs,count = result.count;
            for(let bucket of data.assurance.buckets){
                assuranceObj[bucket['key']] = Math.round((bucket['doc_count']/count)*100*100)/100 + '%'
            }
            for(let bucket of data.beginDate.buckets){
                beginDateObj[bucket['key_as_string']] = Math.round((bucket['doc_count']/count)*100*100)/100 + '%'
            }
            for(let bucket of data.endDate.buckets){
                endDateObj[bucket['key_as_string']] = Math.round((bucket['doc_count']/count)*100*100)/100 + '%'
            }
            for(let bucket of data.expired.buckets){
                let key = bucket['key']==1?'逾期':"未逾期"
                expiredObj[key] = Math.round((bucket['doc_count']/count)*100*100)/100+ '%'
            }
            for(let bucket of data.cheat.buckets){
                let key = bucket['key']==1?'老赖':"非老赖"
                cheatObj[key] = Math.round((bucket['doc_count']/count)*100*100)/100+ '%'
            }
            for(let bucket of data.borrowerType.buckets){
                borrowerTypeObj[bucket['key']] = Math.round((bucket['doc_count']/count)*100*100)/100+ '%'
            }
            for(let bucket of data.myAmount.buckets){
                myAmountObj[bucket['key']] = Math.round((bucket['doc_count']/count)*100*100)/100+ '%'
            }
            for(let bucket of data.contractType.buckets){
                contractTypeObj[bucket['key']] = Math.round((bucket['doc_count']/count)*100*100)/100+ '%'
            }
            $('#analysisDlg #by_beginDate').html(JSON.stringify(beginDateObj))
            $('#analysisDlg #by_endDate').html(JSON.stringify(endDateObj))
            $('#analysisDlg #by_amount').html(JSON.stringify(myAmountObj))
            $('#analysisDlg #by_cheat').html(JSON.stringify(cheatObj))
            $('#analysisDlg #by_expired').html(JSON.stringify(expiredObj))
            $('#analysisDlg #by_borrowerType').html(JSON.stringify(borrowerTypeObj))
            $('#analysisDlg #by_contractType').html(JSON.stringify(contractTypeObj))
            $('#analysisDlg').modal()
        })

    })
}

window.onload = function() {
    nifaLineChart();
    initDownloadAction();
    initContractTable();
};
