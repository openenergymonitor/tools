
var app = new Vue({
    el: '#app',
    data: {
        days: 120,
        room_temperature: 20,

        wall: {
            thermal_conductivity: 1.8,  // W/K.m
            thermal_capacity: 1800,     // kJ/K.m3
            thickness: 0.5,             // m
            u_int_surface: 7.7,         // W/K.m2, 0.13
            u_ext_surface: 25,          // W/K.m2, 0.04
            num_layers: 60,
            uvalue: 0                   // W/K.m2 (combined, output)
        },

        steady_state_heat_kWh: 0,
        dynamic_heat_kWh: 0,

        max_dynamic_heat: 0,
        max_steady_state_heat: 0,
        dynamic_at_max_steady_state_heat: 0,
        peak_reduction_max: 0,
        peak_reduction_at_max_steady_state_heat: 0,


        processing: true,
        days_processed: 0
    },
    methods: {
        simulate: function () {
            sim();
            plot();
        },
        zoom_out: function () {
            view.zoomout();
            view.calc_interval(2400, 30, 1);
            plot();
        },
        zoom_in: function () {
            view.zoomin();
            view.calc_interval(2400, 30, 1);
            plot();
        },
        pan_left: function () {
            view.panleft();
            plot();
        },
        pan_right: function () {
            view.panright();
            plot();
        },
        reset: function () {
            view.start = outside_data_start;
            view.end = outside_data_end;
            view.calc_interval(2400, 30, 1);
            plot();
        }
    },
    filters: {
        toFixed: function (val, dp) {
            if (isNaN(val)) {
                return val;
            } else {
                return val.toFixed(dp)
            }
        }
    }
});

function time_str_to_hour(time_str) {
    let hourmin = time_str.split(":");
    let hour = parseInt(hourmin[0]) + parseInt(hourmin[1]) / 60;
    return hour;
}

function hour_to_time_str(hour_min) {
    let hour = Math.floor(hour_min);
    let min = Math.round((hour_min - hour) * 60);
    if (hour < 10) hour = "0" + hour;
    if (min < 10) min = "0" + min;
    return hour + ":" + min;
}

$('#graph').width($('#graph_bound').width()).height($('#graph_bound').height());
$('#graph2').width($('#graph_bound2').width()).height($('#graph_bound2').height());

var outside_data = [];
roomT_data = [];
outsideT_data = [];
heat_data = [];
dynamic_uvalue_data = [];
steady_state_heat = [];

// Load outside.csv data
$.ajax({
    url: 'tools/dynamic_uvalues/outside.csv',
    dataType: 'text',
}).done(successFunction);

function successFunction(data) {
    var lines = data.split(/\r\n|\n/);
    outside_data = [];
    for (var i = 0; i < lines.length; i++) {
        var row = lines[i].split(',');
        if (row.length > 1) {
            var time = 1*row[0];
            var outside = parseFloat(row[1]);
            outside_data.push([time, outside]);
        }
    }

    outside_data_start = outside_data[0][0];
    outside_data_end = outside_data[outside_data.length - 1][0];
    view.start = outside_data_start;
    view.end = outside_data_end;
    view.interval = 3600;

    plot();

    setTimeout(function () {
        app.simulate();
    },0);
}


function sim_init() {
    app.processing = true;

    roomT_data = [];
    outsideT_data = [];
    heat_data = [];
    dynamic_uvalue_data = [];
    steady_state_heat = [];

    num_layers = app.wall.num_layers;

    t = [];
    k = [];
    u = [];
    h = [];
    h_gain = [];
    h_loss = [];

    let layer_thickness = app.wall.thickness / num_layers;

    var r_value_sum = 0;

    for (i = 0; i < num_layers; i++) {
        t[i] = 15.0;
        h[i] = 0;
        h_gain[i] = 0;
        h_loss[i] = 0;

        u[i] = app.wall.thermal_conductivity / layer_thickness;
        k[i] = 1000 * app.wall.thermal_capacity * layer_thickness;

        r_value_sum += 1 / u[i];
    }

    u_int_surface = app.wall.u_int_surface;
    u_ext_surface = app.wall.u_ext_surface;

    r_value_sum += 1 / u_int_surface;
    r_value_sum += 1 / u_ext_surface;

    // Calculate combined U-value
    app.wall.uvalue = 1 / r_value_sum;

    timestep = 30;
    itterations = 3600 * 24 * app.days / timestep;

    room = app.room_temperature;

    pre_sim_complete = false;
    count = 0;

    steady_state_heat_kWh = 0;
    dynamic_heat_kWh = 0;
    power_to_kwh = timestep / 3600000;

    max_dynamic_heat = 0;
    dynamic_at_max_steady_state_heat = 0;
    max_steady_state_heat = 0;

    i = 0;
}

function sim_day() {

    for (var j = 0; j < 2880; j++) {
        let time = i * timestep;

        // Work out outside temperature data index, timestep here is 30s but outside_data is 1800s
        let outside_index = Math.floor(time / 1800);
        outside = outside_data[outside_index][1];

        // Building fabric model
        heat = u_int_surface * (room - t[num_layers-1]);

        // gain from inside
        h_gain[num_layers-1] = heat;

        // loss and gains inside
        for (var l=num_layers-1; l>0; l--) {
            h_loss[l] = u[l] * (t[l] - t[l-1]);
            h_gain[l-1] = h_loss[l];
        }

        // loss to outside
        h_loss[0] = u_ext_surface * (t[0] - outside);

        // 1. Calculate heat fluxes
        for (var l=0; l<num_layers; l++) {
            h[l] = h_gain[l] - h_loss[l];
        }

        // 2. Calculate change in temperature
        for (var l=0; l<num_layers; l++) {
            t[l] += (h[l] * timestep) / k[l];
        }

        let dynamic_uvalue = heat / (room - outside);
        let difference = Math.abs(dynamic_uvalue - app.wall.uvalue);

        // Pre-sim
        if (!pre_sim_complete) {
            if ((count>2880 && difference<0.01) || count>2880*7) {
                pre_sim_complete = true;
                console.log("Pre sim complete "+((count*timestep)/3600)+" hrs");
            }
            i = 0;
        } else {
            // Populate time series data arrays for plotting
            // let timems = outside_data_start + (time*1000);
            roomT_data.push(room);
            outsideT_data.push(outside);
            heat_data.push(heat);

            // Calculate dynamic u-value
            dynamic_uvalue_data.push(dynamic_uvalue);

            // Steady state heat
            let steady_state_heat_val = app.wall.uvalue * (room - outside);
            steady_state_heat.push(steady_state_heat_val);

            steady_state_heat_kWh += steady_state_heat_val * power_to_kwh;
            dynamic_heat_kWh += heat * power_to_kwh;

            if (heat > max_dynamic_heat) {
                max_dynamic_heat = heat;
            }

            if (steady_state_heat_val > max_steady_state_heat) {
                max_steady_state_heat = steady_state_heat_val;
                dynamic_at_max_steady_state_heat = heat;
            }

        }


        i++;
        count++;
        
    }
}

function sim_days() {

    sim_day();

    let days_processed = Math.floor((i*timestep)/(3600*24));
    app.days_processed = days_processed;

    console.log("Day "+days_processed);

    if (i < itterations) {
        setTimeout(function () {
            sim_days();
        }, 0);
    } else {
        console.log("Sim complete "+((i*timestep)/3600)+" hrs");
        sim_end();

        setTimeout(function () {
            plot();
        }, 100);
    }
}

function sim_end() {
    app.steady_state_heat_kWh = steady_state_heat_kWh;
    app.dynamic_heat_kWh = dynamic_heat_kWh;
    app.max_dynamic_heat = max_dynamic_heat;
    app.max_steady_state_heat = max_steady_state_heat;
    app.dynamic_at_max_steady_state_heat = dynamic_at_max_steady_state_heat;

    app.peak_reduction_max = 1 - (max_dynamic_heat / max_steady_state_heat);
    app.peak_reduction_at_max_steady_state_heat = 1 - (dynamic_at_max_steady_state_heat / max_steady_state_heat);

    app.processing = false;
}

function sim() {
    sim_init();
    sim_days();
}

function plot() {
    var series = [
        { label: "RoomT", data: timeseries(roomT_data), color: "#000", yaxis: 1, lines: { show: true, fill: false } },
        { label: "OutsideT", data: timeseries(outsideT_data), color: "#0000cc", yaxis: 1, lines: { show: true, fill: false } },
        { label: "Heat", data: timeseries(heat_data), color: "#ffcc00", yaxis: 2, lines: { show: true, fill: false } },
        { label: "Steady state heat", data: timeseries(steady_state_heat), color: "#ff0000", yaxis: 2, lines: { show: true, fill: false } },
        { label: "Dynamic U-value", data: timeseries(dynamic_uvalue_data), color: "#00aa00", yaxis: 3, lines: { show: true, fill: false } },
    ];

    var options = {
        grid: { show: true, hoverable: true },
        xaxis: { mode: 'time' },
        yaxes: [],
        selection: { mode: "x" }
    };

    var plot = $.plot($('#graph'), series, options);

    // Second graph plots OutsideT vs Dynamic U-value as a scatter plot
    /*
    var scatter = [];
    for (var i in outsideT_data) {
        scatter.push([outsideT_data[i][1], dynamic_uvalue_data[i][1]]);
    }
    var scatter_options = {
        grid: { show: true, hoverable: true }
    };
    var scatter_plot = $.plot($('#graph2'), [{
        data: scatter,
        color: "#00aa00",
        points: { show: true, radius: 0.1 },
        lines: { show: false }
    }], scatter_options);
    */
}

var previousPoint = false;

// flot tooltip
$('#graph').bind("plothover", function (event, pos, item) {
    if (item) {
        var z = item.dataIndex;

        if (previousPoint != item.datapoint) {
            previousPoint = item.datapoint;

            var interval = 30;
            var time = item.datapoint[0];
            var pos = Math.floor(((time*0.001) - outside_data_start) / interval);

            $("#tooltip").remove();

            var tooltipstr = "";
            // Add time to tooltip
            tooltipstr += new Date(time).toISOString() + "<br>";
            // Add roomT_data
            tooltipstr += "RoomT: " + (roomT_data[pos]).toFixed(1) + "°C<br>";
            // Add outsideT_data
            tooltipstr += "OutsideT: " + (outsideT_data[pos]).toFixed(1) + "°C<br>";
            // Add heat_data
            tooltipstr += "Dynamic Heat: " + (heat_data[pos]).toFixed(1) + "W<br>";
            // Add steady_state_heat
            tooltipstr += "Steady state heat: " + (steady_state_heat[pos]).toFixed(1) + "W<br>";
            // Add dynamic_uvalue_data
            tooltipstr += "Dynamic U-value: " + (dynamic_uvalue_data[pos]).toFixed(2) + "W/K<br>";

            tooltip(item.pageX, item.pageY, tooltipstr, "#fff", "#000");

        }
    } else $("#tooltip").remove();
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

// Convert data to time series, reduce resolution to view.interval
function timeseries(data) {
    if (data == undefined) return [];
    var start_time = outside_data_start;
    var len = data.length;
    var ts = [];
    var interval = 30;

    for (var time = view.start; time < view.end; time += view.interval) {
        let pos = Math.floor((time - start_time) / interval);
        if (pos >= 0 && pos < len) {
            ts.push([time*1000,data[pos]]);
        }
    }
    return ts;
}

$(window).resize(function () {
    $('#graph').width($('#graph_bound').width());
    $('#graph2').width($('#graph_bound2').width());
    plot();
});

$("#graph").bind("plotselected", function (event, ranges) {
    view.start = Math.round(ranges.xaxis.from * 0.001);
    view.end = Math.round(ranges.xaxis.to * 0.001);
    view.calc_interval(2400, 900, 1);
    plot();
});