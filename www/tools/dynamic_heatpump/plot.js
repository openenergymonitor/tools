// ============================================================================
// Plotting & view — flot glue for the dynamic heat pump simulator
// ----------------------------------------------------------------------------
// Owns the plot view window (zoom/pan state), downsampling of the fixed
// 30 s simulation series, the flot series/options, the hover tooltip, the
// selection-to-zoom binding and the loading spinner.
//
// Reads the globals `app` (display flags, windowed stats) and `sim_series`
// (the per-timestep series from the last simulation run, set by the app).
// Loaded after jQuery/flot and before dynamic_heatpump.js.
// ============================================================================

// View window over the simulation, in seconds
var view = {
    start: 0,
    end: 0
};

// Flot series built by plot()
var series = [];

// Select a downsample interval targeting a sensible on-screen point count
function view_calc_interval() {
    var range_seconds = view.end - view.start;

    // Target ~6000-9000 data points on screen for optimal performance
    var ideal_interval = range_seconds / 6000;

    // Available downsample intervals (in seconds)
    var intervals = [3600, 1800, 900, 600, 300, 60, 30];

    // Select the smallest interval that meets or exceeds the ideal
    view.interval = intervals.find(function (interval) {
        return ideal_interval >= interval;
    }) || 30;
}

// Downsample a fixed 30 s interval series to [time_ms, mean] pairs over the
// current view window
function timeseries(data_array) {
    var result = [];
    var timestep = 30; // seconds
    var start_time = 0;

    // Calculate how many original data points fit in each downsampled interval
    var points_per_interval = Math.floor(view.interval / timestep);

    // Limit to view range
    var view_start_index = Math.floor(view.start / timestep);
    var view_end_index = Math.ceil(view.end / timestep);

    // Clamp to data array bounds
    if (view_start_index < 0) view_start_index = 0;
    if (view_end_index > data_array.length) view_end_index = data_array.length;

    // Group and average data
    for (var i = view_start_index; i < view_end_index; i += points_per_interval) {
        var sum = 0;
        var count = 0;

        // Average all points in this interval
        for (var j = 0; j < points_per_interval && (i + j) < data_array.length; j++) {
            sum += data_array[i + j];
            count++;
        }

        var avg = count > 0 ? sum / count : 0;
        var time = start_time + i * timestep * 1000;
        result.push([time, avg]);
    }

    return result;
}

$('#graph').width($('#graph_bound').width()).height($('#graph_bound').height());

function plot() {
    if (!sim_series) return;

    // Skip when the chart container is hidden (Tables view active) and pick
    // up any container size change since the last draw
    var bound_width = $('#graph_bound').width();
    if (!bound_width) return;
    $('#graph').width(bound_width).height($('#graph_bound').height());

    var window = {};
    window.elec_data = timeseries(sim_series.elec_data);
    window.heat_data = timeseries(sim_series.heat_data);
    window.flowT_data = timeseries(sim_series.flowT_data);
    window.returnT_data = timeseries(sim_series.returnT_data);
    window.roomT_data = timeseries(sim_series.roomT_data);
    window.outsideT_data = timeseries(sim_series.outsideT_data);
    window.agile_data = timeseries(sim_series.agile_data);
    window.targetT_data = timeseries(sim_series.targetT_data);
    window.solar_pv_data = timeseries(sim_series.solar_pv_data);
    window.cylTopT_data = timeseries(sim_series.cylTopT_data);
    window.cylBottomT_data = timeseries(sim_series.cylBottomT_data);
    window.frost_data = timeseries(sim_series.frost_data || []);

    let power_to_kwh = view.interval / 3600000;

    // Reset windowed stats
    app.stats.window_flowT_weighted_sum = 0;
    app.stats.window_outsideT_weighted_sum = 0;
    app.stats.window_flowT_minus_outsideT_weighted_sum = 0;
    app.stats.window_heat_kwh = 0;

    // Weighted average stats in window
    for (var i = 0; i < window.elec_data.length; i++) {
        var heat = window.heat_data[i][1];
        var flowT = window.flowT_data[i][1];
        var outsideT = window.outsideT_data[i][1];

        app.stats.window_flowT_weighted_sum += flowT * heat * power_to_kwh;
        app.stats.window_outsideT_weighted_sum += outsideT * heat * power_to_kwh;
        app.stats.window_flowT_minus_outsideT_weighted_sum += heat * (flowT - outsideT) * power_to_kwh;
        app.stats.window_heat_kwh += heat * power_to_kwh;
    }

    // Final weighted averages
    if (app.stats.window_heat_kwh > 0) {
        app.stats.window_flowT_weighted = app.stats.window_flowT_weighted_sum / app.stats.window_heat_kwh;
        app.stats.window_outsideT_weighted = app.stats.window_outsideT_weighted_sum / app.stats.window_heat_kwh;
        app.stats.window_flowT_minus_outsideT_weighted = app.stats.window_flowT_minus_outsideT_weighted_sum / app.stats.window_heat_kwh;
    } else {
        app.stats.window_flowT_weighted = 0;
        app.stats.window_outsideT_weighted = 0;
        app.stats.window_flowT_minus_outsideT_weighted = 0;
    }


    series = [
        { label: "Heat", data: window.heat_data, color: 0, yaxis: 3, lines: { show: true, fill: true } },
        { label: "Elec", data: window.elec_data, color: 1, yaxis: 3, lines: { show: true, fill: true } },
        { label: "Solar PV", data: window.solar_pv_data, color: "#f5a623", yaxis: 3, lines: { show: true, fill: true } },
        { label: "FlowT", data: window.flowT_data, color: 2, yaxis: 2, lines: { show: true, fill: false } },
        { label: "ReturnT", data: window.returnT_data, color: 3, yaxis: 2, lines: { show: true, fill: false } },
        { label: "RoomT", data: window.roomT_data, color: "#000", yaxis: 1, lines: { show: true, fill: false } },
        { label: "TargetT", data: window.targetT_data, color: "#aaa", yaxis: 1, lines: { show: true, fill: false } },
        { label: "OutsideT", data: window.outsideT_data, color: "#0000cc", yaxis: 1, lines: { show: true, fill: false } },
        { label: "Agile Price", data: window.agile_data, color: "#a6196bff", yaxis: 4, lines: { show: true, fill: false } },
        { label: "CylTopT", data: window.cylTopT_data, color: "#cc0000", yaxis: 2, lines: { show: true, fill: false } },
        { label: "CylBottomT", data: window.cylBottomT_data, color: "#e08080", yaxis: 2, lines: { show: true, fill: false } },
        { label: "Frost", data: window.frost_data, color: "#00aacc", yaxis: 5, lines: { show: true, fill: true } }
    ];

    if (app.mode != "year") {
        series[8].lines.show = false; // hide agile in day mode
    }

    if (!app.show_targetT) {
        series[6].lines.show = false;
    }

    if (!app.show_cyl_topT) {
        series[9].lines.show = false;
    }

    if (!app.show_cyl_bottomT) {
        series[10].lines.show = false;
    }

    if (!app.show_frost) {
        series[11].lines.show = false;
    }

    if (app.mode != "year") {
        series[2].lines.show = false; // hide solar PV in day mode (no real data)
    }

    var options = {
        grid: { show: true, hoverable: true },
        xaxis: {
            mode: 'time',
            min: view.start*1000,
            max: view.end*1000
        },
        yaxes: [{}, { min: 1.5 }],
        selection: { mode: "x" }
    };

    var plot = $.plot($('#graph'), series, options);
}

var previousPoint = false;

// flot tooltip
$('#graph').bind("plothover", function (event, pos, item) {
    if (item) {
        var z = item.dataIndex;

        if (previousPoint != item.datapoint) {
            previousPoint = item.datapoint;

            $("#tooltip").remove();

            var tooltipstr = "";
            // Add time to tooltip
            tooltipstr += new Date(item.datapoint[0]).toISOString().slice(11, 16) + "<br>";
            // Add elec_data
            tooltipstr += "Elec: " + (series[1].data[z][1]).toFixed(0) + "W<br>";
            // Add heat_data
            tooltipstr += "Heat: " + (series[0].data[z][1]).toFixed(0) + "W<br>";
            // Add solar_pv_data
            tooltipstr += "Solar PV: " + (series[2].data[z][1]).toFixed(0) + "W<br>";
            // Add flowT_data
            tooltipstr += "FlowT: " + (series[3].data[z][1]).toFixed(1) + "°C<br>";
            // Add returnT_data
            tooltipstr += "ReturnT: " + (series[4].data[z][1]).toFixed(1) + "°C<br>";
            // Add roomT_data
            tooltipstr += "RoomT: " + (series[5].data[z][1]).toFixed(1) + "°C<br>";
            // Add targetT_data
            tooltipstr += "TargetT: " + (series[6].data[z][1]).toFixed(1) + "°C<br>";
            // Add outsideT_data
            tooltipstr += "OutsideT: " + (series[7].data[z][1]).toFixed(1) + "°C<br>";
            // Add cylinder top and bottom temperatures
            tooltipstr += "CylTopT: " + (series[9].data[z][1]).toFixed(1) + "°C<br>";
            tooltipstr += "CylBottomT: " + (series[10].data[z][1]).toFixed(1) + "°C<br>";
            // Add evaporator frost mass
            if (app.show_frost && series[11].data[z]) {
                tooltipstr += "Frost: " + (series[11].data[z][1]).toFixed(2) + "kg<br>";
            }

            tooltip(item.pageX, item.pageY, tooltipstr, "#fff", "#000");

        }
    } else $("#tooltip").remove();
});

// plot selection to zoom
$('#graph').bind("plotselected", function (event, ranges) {
    // Zooming
    view.start = ranges.xaxis.from*0.001;
    view.end = ranges.xaxis.to*0.001;

    // round to nearest hour
    view.start = Math.floor(view.start / 3600) * 3600;
    view.end = Math.ceil(view.end / 3600) * 3600;

    // if view range is less than 1 hour, set to 1 hour
    if (view.end - view.start < 3600) {
        view.end = view.start + 3600;
    }

    view_calc_interval();
    plot();
});

function tooltip(x, y, contents, bgColour, borderColour = "rgb(255, 221, 221)") {
    var offset = 10;
    var elem = $('<div id="tooltip">' + contents + '</div>').css({
        position: 'absolute',
        color: "#000",
        display: 'none',
        'font-weight': 'bold',
        border: '1px solid ' + borderColour,
        padding: '2px',
        'background-color': bgColour,
        opacity: '0.8',
        'text-align': 'left'
    }).appendTo("body").fadeIn(200);

    var elemY = y - elem.height() - offset;
    var elemX = x - elem.width() - offset;
    if (elemY < 0) { elemY = 0; }
    if (elemX < 0) { elemX = 0; }
    elem.css({
        top: elemY,
        left: elemX
    });
}

$(window).resize(function () {
    $('#graph').width($('#graph_bound').width());
    plot();
});

function show_spinner() {
    $('#spinner-overlay').addClass('active');
}

function hide_spinner() {
    $('#spinner-overlay').removeClass('active');
}
