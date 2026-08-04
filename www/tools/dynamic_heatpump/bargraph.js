// ============================================================================
// Daily bar chart — the myheatpump "daily" view over simulation output
// ----------------------------------------------------------------------------
// MyHeatpump reads pre-processed daily rows from emoncms; here there is no
// daily feed, so bargraph_build() rolls the 30 s simulation series
// (`sim_series`) up into per-day totals itself. Everything downstream — the
// overlaid heat/electric bars, the outside temperature line, the COP scatter
// and the click-through to a single day — mirrors myheatpump_bargraph.js.
//
// Loaded after plot.js (which owns the power view and the shared view_nav
// helper) and before dynamic_heatpump.js.
// ============================================================================

var DAY_SECONDS = 86400;
var DAY_MS = 86400000;

// Per-day aggregates, built by bargraph_build() after each run
var daily = [];

// Daily view window, in seconds from the start of the simulation. Kept
// separate from the power view's `view` so that clicking through to a day and
// coming back lands on the range you left
var bar_view = { start: 0, end: 0, max: 0 };

// Flot series built by bargraph_draw()
var bargraph_series = [];

// ----------------------------------------------------------------------------
// Build daily totals from the 30 s series
// ----------------------------------------------------------------------------
function bargraph_build() {
    daily = [];
    if (!sim_series || !sim_series.elec_data) return;

    var timestep = 30;                       // seconds, fixed by the simulator
    var steps_per_day = DAY_SECONDS / timestep;
    var power_to_kwh = timestep / 3600000;   // W over one step -> kWh

    var n = sim_series.elec_data.length;
    var day_count = Math.ceil(n / steps_per_day);

    for (var d = 0; d < day_count; d++) {
        var first = d * steps_per_day;
        var last = Math.min(first + steps_per_day, n);

        var day = {
            index: d,
            time: d * DAY_MS,                // day start
            mid: (d + 0.5) * DAY_MS,         // bars are centred within the day
            combined: { heat: 0, elec: 0 },
            space: { heat: 0, elec: 0 },
            water: { heat: 0, elec: 0 },
            defrost_kwh: 0,
            defrost_elec_kwh: 0,
            outsideT: null,
            flowT: null
        };

        var outsideT_sum = 0;
        var flowT_weighted_sum = 0;
        var heat_gross = 0;
        var count = 0;

        for (var i = first; i < last; i++) {
            var defrost = sim_series.defrost_data ? sim_series.defrost_data[i] : 0;
            var elec = sim_series.elec_data[i] * power_to_kwh;
            // Heat as a heat meter on the circuit would register it: net of the
            // reverse-cycle defrost draw (same convention as plot())
            var heat = (sim_series.heat_data[i] - defrost) * power_to_kwh;

            // Split by diverter position. Standby draw while the unit is off
            // falls to the space heating bucket, as it does on a real system
            // with no separate DHW metering
            var bucket = (sim_series.dhw_mode_data && sim_series.dhw_mode_data[i])
                ? day.water : day.space;
            bucket.heat += heat;
            bucket.elec += elec;
            day.combined.heat += heat;
            day.combined.elec += elec;

            if (defrost > 0) {
                day.defrost_kwh += defrost * power_to_kwh;
                day.defrost_elec_kwh += elec;
            }

            // Flow temperature is heat weighted, matching the headline stats
            var gross = sim_series.heat_data[i] * power_to_kwh;
            flowT_weighted_sum += sim_series.flowT_data[i] * gross;
            heat_gross += gross;

            outsideT_sum += sim_series.outsideT_data[i];
            count++;
        }

        if (count > 0) day.outsideT = outsideT_sum / count;
        if (heat_gross > 0) day.flowT = flowT_weighted_sum / heat_gross;

        daily.push(day);
    }

    // A single day has nothing to show as bars, so a run that shortens to one
    // day (mode change, imported config) drops back to the power view — the
    // Daily toggle is hidden at that point and could not switch back
    if (day_count <= 1 && app && app.ui.chart == "daily") app.ui.chart = "power";

    // Reset the window when the simulation length changes, otherwise keep the
    // range the user had zoomed to across re-runs
    var total = day_count * DAY_SECONDS;
    if (bar_view.max != total || bar_view.end <= bar_view.start) {
        bar_view.start = 0;
        bar_view.end = total;
    }
    bar_view.max = total;
}

// ----------------------------------------------------------------------------
// Draw
// ----------------------------------------------------------------------------
function bargraph_draw() {
    // Publish the window for the chart nav before the early returns, so the
    // nav stays correct while the chart is hidden on the Tables tab
    if (app && app.bar_view) {
        app.bar_view.start = bar_view.start;
        app.bar_view.end = bar_view.end;
        app.bar_view.max = bar_view.max;
    }

    if (!daily.length) return;

    var bound_width = $('#graph_bound').width();
    if (!bound_width) return;
    $('#graph').width(bound_width).height($('#graph_bound').height());

    var mode = app.bargraph_mode;
    var ds = app.daily_series;

    var heat_data = [];
    var elec_data = [];
    var outsideT_data = [];
    var cop_data = [];

    var window_heat = 0;
    var window_elec = 0;
    var window_days = 0;

    for (var z = 0; z < daily.length; z++) {
        var d = daily[z];
        var m = d[mode];

        heat_data.push([d.mid, m.heat]);
        elec_data.push([d.mid, m.elec]);
        if (d.outsideT !== null) outsideT_data.push([d.mid, d.outsideT]);
        // A COP point needs a meaningful amount of running in the day
        if (m.elec > 0.05 && m.heat > 0) cop_data.push([d.mid, m.heat / m.elec]);

        var day_start = d.index * DAY_SECONDS;
        if (day_start >= bar_view.start && day_start < bar_view.end) {
            window_heat += m.heat;
            window_elec += m.elec;
            window_days++;
        }
    }

    // Totals across the visible bars, shown alongside the chart title
    app.daily_stats.heat_kwh = window_heat;
    app.daily_stats.elec_kwh = window_elec;
    app.daily_stats.cop = window_elec > 0 ? window_heat / window_elec : 0;
    app.daily_stats.days = window_days;

    // Heat and electric are drawn as overlaid bars of the same width rather
    // than stacked: electric is drawn second so it sits in front of the taller
    // heat bar, which is the myheatpump look
    var bar = { show: true, align: "center", barWidth: 0.75 * DAY_MS, fill: 1.0, lineWidth: 0 };

    bargraph_series = [];
    if (ds.heat.show)
        bargraph_series.push({ label: "Heat", data: heat_data, color: ds.heat.color, bars: bar });
    if (ds.elec.show)
        bargraph_series.push({ label: "Electric", data: elec_data, color: ds.elec.color, bars: bar });
    if (ds.outsideT.show)
        bargraph_series.push({
            label: "OutsideT", data: outsideT_data, color: ds.outsideT.color, yaxis: 2,
            lines: { show: true, fill: false }, points: { show: false }
        });
    if (ds.cop.show)
        bargraph_series.push({
            label: "COP", data: cop_data, color: ds.cop.color, yaxis: 3,
            points: { show: true }
        });

    var style = { size: flot_font_size, color: "#666" };
    var options = {
        xaxis: {
            mode: "time",
            min: bar_view.start * 1000,
            max: bar_view.end * 1000,
            font: style,
            reserveSpace: false
        },
        yaxes: [
            // 1: energy kWh
            { min: 0, font: style, reserveSpace: false },
            // 2: outside temperature
            { font: { size: flot_font_size, color: ds.outsideT.color }, reserveSpace: false },
            // 3: COP
            { min: 1, max: 8, font: { size: flot_font_size, color: ds.cop.color }, reserveSpace: false }
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

    $.plot($('#graph'), bargraph_series, options);
}

// Redraw whichever chart the results panel is currently showing
function chart_redraw() {
    if (app && app.ui.chart == "daily") bargraph_draw();
    else plot();
}

// ----------------------------------------------------------------------------
// Interaction
// ----------------------------------------------------------------------------

// All daily series share the same x positions (day midpoints), so the hovered
// or clicked point maps straight back to a day
function bargraph_day_at(time_ms) {
    return daily[Math.floor(time_ms / DAY_MS)];
}

// Tooltip: myheatpump's daily readout — date, energy in and out, outside
// temperature and COP (delegated for the same reason as plot.js's handlers)
$(document).on("plothover", "#graph", function (event, pos, item) {
    if (!app || app.ui.chart != "daily") return;

    if (item) {
        if (previousPoint != item.datapoint) {
            previousPoint = item.datapoint;
            $("#tooltip").remove();

            var d = bargraph_day_at(item.datapoint[0]);
            if (!d) return;
            var m = d[app.bargraph_mode];

            // Simulation time starts at epoch 0, so read the date in UTC and
            // label the day number rather than a weekday
            var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            var date = new Date(d.time);
            var label = "Day " + (d.index + 1) + " &middot; " +
                months[date.getUTCMonth()] + " " + date.getUTCDate();

            var html = label +
                "<br>Electric: " + m.elec.toFixed(1) + " kWh" +
                "<br>Heat: " + m.heat.toFixed(1) + " kWh";

            if (d.outsideT !== null) html += "<br>Outside: " + d.outsideT.toFixed(1) + "&deg;C";
            if (d.flowT !== null) html += "<br>Flow: " + d.flowT.toFixed(1) + "&deg;C";
            html += "<br>COP: " + (m.elec > 0 ? (m.heat / m.elec).toFixed(2) : "---");
            if (d.defrost_kwh > 0) html += "<br>Defrost: " + d.defrost_kwh.toFixed(2) + " kWh";

            tooltip(item.pageX, item.pageY, html, "#fff", "#000");
        }
    } else $("#tooltip").remove();
});

// Click a bar to open that day in the power view
$(document).on("plotclick", "#graph", function (event, pos, item) {
    if (!app || app.ui.chart != "daily" || !item) return;
    var d = bargraph_day_at(item.datapoint[0]);
    if (d) app.show_day(d.index);
});

// Drag-select to zoom the daily window, snapped to whole days
$(document).on("plotselected", "#graph", function (event, ranges) {
    if (!app || app.ui.chart != "daily") return;

    bar_view.start = Math.floor((ranges.xaxis.from * 0.001) / DAY_SECONDS) * DAY_SECONDS;
    bar_view.end = Math.ceil((ranges.xaxis.to * 0.001) / DAY_SECONDS) * DAY_SECONDS;

    if (bar_view.end - bar_view.start < DAY_SECONDS) {
        bar_view.end = bar_view.start + DAY_SECONDS;
    }
    bargraph_draw();
});
