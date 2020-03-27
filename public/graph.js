
const nifaLineChart = ()=>{
    const labels = ['2020-2','2020-1', '2019-12', '2019-11', '2019-10', '2019-9', '2019-8', '2019-7',
        '2019-6','2019-5','2019-4','2019-3','2019-2','2019-1','2018-12','2018-11',
        '2018-10','2018-9','2018-8','2018-7'].reverse();

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
            let total_loan_money = data.results.map((result)=>result.total_loan_money)
            let config = {
                type: 'line',
                data: {
                    labels: dateData,
                    datasets: [{
                        label: '累计借贷金额',
                        backgroundColor: color(window.chartColors.red).alpha(0.5).rgbString(),
                        borderColor: window.chartColors.red,
                        fill: false,
                        data: total_loan_money,
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

window.onload = function() {
    nifaLineChart();
    yooliLineChart();
};
