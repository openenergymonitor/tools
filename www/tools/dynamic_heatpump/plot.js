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

var flot_font_size = 12;

// Flot series built by plot()
var series = [];

// Select a downsample interval targeting a sensible on-screen point count
function view_calc_interval() {
    var range_seconds = view.end - view.start;

    // Target ~6000-9000 data points on screen for optimal performance
    var ideal_interval = range_seconds / 2000;

    // Available downsample intervals (in seconds)
    var intervals = [3600, 1800, 900, 600, 300, 60, 30];

    // Select the smallest interval that meets or exceeds the ideal
    view.interval = intervals.find(function (interval) {
        return ideal_interval >= interval;
    }) || 30;
}

// Downsample a fixed 30 s interval series to [time_ms, value] pairs over the
// current view window. aggregate: "mean" (default) or "max" — max keeps short
// on/off mode bands visible at coarse zoom levels
function timeseries(data_array, aggregate) {
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

    // Group and aggregate data
    for (var i = view_start_index; i < view_end_index; i += points_per_interval) {
        var sum = 0;
        var max = null;
        var count = 0;

        for (var j = 0; j < points_per_interval && (i + j) < data_array.length; j++) {
            sum += data_array[i + j];
            if (max === null || data_array[i + j] > max) max = data_array[i + j];
            count++;
        }

        var value = 0;
        if (count > 0) value = (aggregate == "max") ? max : sum / count;
        var time = start_time + i * timestep * 1000;
        result.push([time, value]);
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
    window.defrost_data = timeseries(sim_series.defrost_data || []);
    // Mode bands use max aggregation so short cycles stay visible zoomed out
    window.dhw_mode_data = timeseries(sim_series.dhw_mode_data || [], "max");
    window.ch_mode_data = timeseries(sim_series.ch_mode_data || [], "max");

    let power_to_kwh = view.interval / 3600000;

    // Reset windowed stats
    app.stats.window_flowT_weighted_sum = 0;
    app.stats.window_outsideT_weighted_sum = 0;
    app.stats.window_flowT_minus_outsideT_weighted_sum = 0;
    app.stats.window_elec_kwh = 0;
    app.stats.window_heat_kwh = 0;

    // Gross heat (before the defrost draw) weights the temperature averages
    var window_heat_gross_kwh = 0;

    // Weighted average stats in window
    for (var i = 0; i < window.elec_data.length; i++) {
        var heat = window.heat_data[i][1];
        var defrost = window.defrost_data[i] ? window.defrost_data[i][1] : 0;
        var flowT = window.flowT_data[i][1];
        var outsideT = window.outsideT_data[i][1];

        app.stats.window_flowT_weighted_sum += flowT * heat * power_to_kwh;
        app.stats.window_outsideT_weighted_sum += outsideT * heat * power_to_kwh;
        app.stats.window_flowT_minus_outsideT_weighted_sum += heat * (flowT - outsideT) * power_to_kwh;
        window_heat_gross_kwh += heat * power_to_kwh;

        // Window totals: heat is net of the reverse-cycle defrost draw, which
        // is what a heat meter on the circuit would register
        app.stats.window_heat_kwh += (heat - defrost) * power_to_kwh;
        app.stats.window_elec_kwh += window.elec_data[i][1] * power_to_kwh;
    }

    // Final weighted averages
    if (window_heat_gross_kwh > 0) {
        app.stats.window_flowT_weighted = app.stats.window_flowT_weighted_sum / window_heat_gross_kwh;
        app.stats.window_outsideT_weighted = app.stats.window_outsideT_weighted_sum / window_heat_gross_kwh;
        app.stats.window_flowT_minus_outsideT_weighted = app.stats.window_flowT_minus_outsideT_weighted_sum / window_heat_gross_kwh;
    } else {
        app.stats.window_flowT_weighted = 0;
        app.stats.window_outsideT_weighted = 0;
        app.stats.window_flowT_minus_outsideT_weighted = 0;
    }

    // COP over the visible window
    app.stats.window_cop = app.stats.window_elec_kwh > 0 ?
        app.stats.window_heat_kwh / app.stats.window_elec_kwh : 0;

    // Heat as plotted: optionally show the reverse-cycle defrost draw as
    // negative heat (like a real heat meter during a defrost)
    var heat_plot = window.heat_data;
    if (app.show_negative_heat && window.defrost_data.length == window.heat_data.length) {
        heat_plot = window.heat_data.map(function (p, i) {
            return [p[0], p[1] - window.defrost_data[i][1]];
        });
    }

    // Series styled to match the myheatpump powergraph: mode shading bands
    // behind, temperatures as lines on the right axis, filled power series
    // drawn last. Visibility and colours come from the legend pill config
    // (app.chart_series); hidden series are excluded (not just blanked) so
    // unused axes disappear too. The legend itself is the Vue pill row, not
    // flot's.
    var cs = app.chart_series;
    series = [];
    if (cs.dhw.show)
        series.push({ label: "DHW", data: window.dhw_mode_data, yaxis: 4, color: cs.dhw.color, lines: { lineWidth: 0, show: true, fill: 0.15 } });
    if (cs.ch.show)
        series.push({ label: "CH", data: window.ch_mode_data, yaxis: 4, color: cs.ch.color, lines: { lineWidth: 0, show: true, fill: 0.15 } });
    if (cs.targetT.show)
        series.push({ label: "TargetT", data: window.targetT_data, yaxis: 2, color: cs.targetT.color });
    if (cs.flowT.show)
        series.push({ label: "FlowT", data: window.flowT_data, yaxis: 2, color: cs.flowT.color });
    if (cs.returnT.show)
        series.push({ label: "ReturnT", data: window.returnT_data, yaxis: 2, color: cs.returnT.color });
    if (cs.outsideT.show)
        series.push({ label: "OutsideT", data: window.outsideT_data, yaxis: 2, color: cs.outsideT.color });
    if (cs.roomT.show)
        series.push({ label: "RoomT", data: window.roomT_data, yaxis: 2, color: cs.roomT.color });
    if (cs.cylTopT.show)
        series.push({ label: "CylTopT", data: window.cylTopT_data, yaxis: 2, color: cs.cylTopT.color });
    if (cs.cylBottomT.show)
        series.push({ label: "CylBottomT", data: window.cylBottomT_data, yaxis: 2, color: cs.cylBottomT.color });
    if (cs.solar_pv.show && app.mode == "year")
        series.push({ label: "Solar PV", data: window.solar_pv_data, yaxis: 1, color: cs.solar_pv.color, lines: { show: true, fill: 0.2, lineWidth: 0.5 } });
    if (cs.heat.show)
        series.push({ label: "Heat", data: heat_plot, yaxis: 1, color: cs.heat.color, lines: { show: true, fill: 0.2, lineWidth: 0.5 } });
    if (cs.elec.show)
        series.push({ label: "Electric", data: window.elec_data, yaxis: 1, color: cs.elec.color, lines: { show: true, fill: 0.3, lineWidth: 0.5 } });
    if (cs.agile.show)
        series.push({ label: "Agile Price", data: window.agile_data, yaxis: 3, color: cs.agile.color });
    if (cs.frost.show)
        series.push({ label: "Frost", data: window.frost_data, yaxis: 5, color: cs.frost.color, lines: { show: true, fill: true } });

    var style = { size: flot_font_size, color: "#666" };
    var options = {
        lines: { fill: false },
        xaxis: {
            mode: "time",
            min: view.start * 1000,
            max: view.end * 1000,
            font: style,
            reserveSpace: false
        },
        yaxes: [
            // 1: power W
            { min: 0, font: style, reserveSpace: false },
            // 2: temperatures
            { font: style, reserveSpace: false },
            // 3: Agile price
            { min: 0, font: { size: flot_font_size, color: "#a6196b" }, reserveSpace: false },
            // 4: mode shading bands
            { min: 0, max: 1, show: false, reserveSpace: false },
            // 5: frost mass
            { min: 0, font: { size: flot_font_size, color: "#00aacc" }, reserveSpace: false }
        ],
        grid: {
            show: true,
            color: "#aaa",
            borderWidth: 0,
            hoverable: true,
            clickable: true,
            margin: { top: 10 }
        },
        selection: { mode: "x" },
        // The legend is the Vue pill row below the chart
        legend: { show: false }
    };

    // Let the power axis go below zero for the defrost draw
    if (app.show_negative_heat) options.yaxes[0].min = undefined;

    var plot = $.plot($('#graph'), series, options);
}

var previousPoint = false;

// flot tooltip: single hovered series, powergraph style (name, value, date)
// Delegated via document: #graph lives inside the Vue app, so the node this
// script sees at load time is replaced when Vue mounts and re-renders
$(document).on("plothover", "#graph", function (event, pos, item) {
    if (item) {
        if (previousPoint != item.datapoint) {
            previousPoint = item.datapoint;

            $("#tooltip").remove();

            // Simulation timestamps start at epoch 0, so format in UTC to
            // keep hours aligned with the schedule
            var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            var d = new Date(item.datapoint[0]);
            var date = months[d.getUTCMonth()] + " " + d.getUTCDate();
            var time = d.toISOString().slice(11, 16);

            var fmt = {
                "DHW": { name: "Hot Water", unit: "", dp: 0 },
                "CH": { name: "Central Heating", unit: "", dp: 0 },
                "TargetT": { name: "Target", unit: "°C", dp: 1 },
                "FlowT": { name: "FlowT", unit: "°C", dp: 1 },
                "ReturnT": { name: "ReturnT", unit: "°C", dp: 1 },
                "OutsideT": { name: "Outside", unit: "°C", dp: 1 },
                "RoomT": { name: "Room", unit: "°C", dp: 1 },
                "CylTopT": { name: "CylTopT", unit: "°C", dp: 1 },
                "CylBottomT": { name: "CylBottomT", unit: "°C", dp: 1 },
                "Solar PV": { name: "Solar PV", unit: "W", dp: 0 },
                "Heat": { name: "Heat", unit: "W", dp: 0 },
                "Electric": { name: "Elec", unit: "W", dp: 0 },
                "Agile Price": { name: "Agile", unit: "p/kWh", dp: 1 },
                "Frost": { name: "Frost", unit: "kg", dp: 2 }
            };
            var f = fmt[item.series.label] || { name: item.series.label, unit: "", dp: 1 };

            tooltip(item.pageX, item.pageY,
                f.name + " " + item.datapoint[1].toFixed(f.dp) + f.unit + "<br>" + date + ", " + time,
                "#fff", "#000");
        }
    } else $("#tooltip").remove();
});

// plot selection to zoom (delegated for the same reason as plothover above)
$(document).on("plotselected", "#graph", function (event, ranges) {
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
