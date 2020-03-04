
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

window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const refresh = urlParams.get('refresh');
    const url = '/api/monthly' + (refresh?'?refresh=1':'')
    $.get(url, function(data) {
        let curr_loan = data.map((month)=>month.curr_loan).reverse()
        lineChartData.datasets[0].label = '借贷余额(万元)';
        lineChartData.datasets[0].data = curr_loan;
        var ctx = document.getElementById('canvas').getContext('2d');
        window.myLine = Chart.Line(ctx, {
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

        $( "#dimension" ).change(function() {
            let dimension = $(this).val();
            let dimension_label = $("#dimension option:selected").text();
            let dimension_data = data.map((month)=>month[dimension]).reverse()
            lineChartData.datasets[0].label = dimension_label;
            lineChartData.datasets[0].data = dimension_data;
            window.myLine.update();
        });
    });
};
