
var AUTO_ADAPT = 0;
var WEATHER_COMP_CURVE = 1;
var FIXED_SPEED = 3;



var price_cap = 24.86;
var cosy_examples_schedule = [
    { start: "00:00", set_point: 18, price: 26.98 },
    { start: "04:00", set_point: 21, price: 13.23 },
    { start: "07:00", set_point: 19.5, price: 26.98 },
    { start: "13:00", set_point: 21, price: 13.23 },
    { start: "16:00", set_point: 19, price: 40.47 },
    { start: "19:00", set_point: 19.5, price: 26.98 },
    { start: "22:00", set_point: 19, price: 13.23 }
];

var app = new Vue({
    el: '#app',
    data: {
        days: 4,
        building: {
            heat_loss: 4200,
            internal_gains: 390,
            fabric: [
                { proportion: 52, WK: 0, kWhK: 12, T: 16 },
                { proportion: 28, WK: 0, kWhK: 6, T: 17 },
                { proportion: 20, WK: 0, kWhK: 1, T: 18 }
            ],
            fabric_WK: 0
        },
        external: {
            mid: 4,
            swing: 2,
            min_time: "06:00",
            max_time: "14:00"
        },
        heatpump: {
            capacity: 7500,
            system_water_volume: 120, // Litres
            flow_rate: 12, // Litres per minute
            system_DT: 5,
            radiatorRatedOutput: 15000,
            radiatorRatedDT: 50,
            prc_carnot: 47,
            cop_model: "carnot_variable",
            standby: 11,
            pumps: 15,
            minimum_modulation: 32
        },
        control: {
            mode: AUTO_ADAPT,
            wc_use_outside_mean: 1,
            
            Kp: 2500,
            Ki: 0.2,
            Kd: 0.0,

            wc_Kp: 500,
            wc_Ki: 0.05,
            wc_Kd: 0.0,

            curve: 1.0,
            limit_by_roomT: false,
            roomT_hysteresis: 0.5,

            fixed_compressor_speed: 100
        },
        schedule: [
            { start: "00:00", set_point: 17, price: price_cap },
            { start: "06:00", set_point: 18, price: price_cap },
            { start: "15:00", set_point: 19, price: price_cap },
            { start: "22:00", set_point: 17, price: price_cap }
        ],
        results: {
            elec_kwh: 0,
            heat_kwh: 0,
            mean_room_temp: 0,
            max_room_temp: 0,
            total_cost: 0
        },
        baseline: {
            elec_kwh: 0,
            heat_kwh: 0,
            mean_room_temp: 0,
            max_room_temp: 0,
            total_cost: 0
        },
        stats: {
            flowT_weighted: 0,
            flowT_minus_outsideT_weighted: 0
        },
        baseline_enabled: false,
        refinements: 3,
        max_room_temp: 0,
    },
    methods: {
        load_octopus_cosy: function () {
            this.schedule = JSON.parse(JSON.stringify(cosy_examples_schedule));
            this.simulate();
        },
        save_baseline: function () {
            this.baseline = JSON.parse(JSON.stringify(this.results));
            this.baseline_enabled = true;
        },
        simulate: function () {
            console.log("Simulating");

            // These only need to be calculated once
            // Calculate heat loss coefficient


            // Calculate fabric WK
            app.building.fabric_WK = app.building.heat_loss / 23;
            let fabric_WK_inv = 1 / app.building.fabric_WK;

            var remaining_proportion = 100;
            remaining_proportion -= app.building.fabric[2].proportion;
            remaining_proportion -= app.building.fabric[1].proportion;
            app.building.fabric[0].proportion = remaining_proportion;
            
            var sum = 0;
            for (var z in app.building.fabric) {
                let WK_inv = 0.01 * app.building.fabric[z].proportion * fabric_WK_inv;
                app.building.fabric[z].WK = 1 / WK_inv;

                sum += (1 / app.building.fabric[z].WK*1);
            }
            app.building.fabric_WK = 1 / sum;

            // Used for outside temperature waveform generation
            var outside_min_time = time_str_to_hour(app.external.min_time);
            app.external.min_time = hour_to_time_str(outside_min_time);
            var outside_max_time = time_str_to_hour(app.external.max_time);
            app.external.max_time = hour_to_time_str(outside_max_time);


            // With user entered schedule
            // First runs without recording time series data
            for (var i = 0; i < (app.refinements-1); i++) {
                sim({
                    record_timeseries: false,
                    outside_min_time: outside_min_time,
                    outside_max_time: outside_max_time,
                    schedule: app.schedule
                });
            }

            // Record the time series data for the final run
            var result = sim({
                record_timeseries: true,
                outside_min_time: outside_min_time,
                outside_max_time: outside_max_time,
                schedule: app.schedule
            });
            app.max_room_temp = result.max_room_temp;

            app.results.elec_kwh = result.elec_kwh;
            app.results.heat_kwh = result.heat_kwh;
            app.results.mean_room_temp = result.mean_room_temp;
            app.results.max_room_temp = result.max_room_temp;
            app.results.total_cost = result.total_cost;

            plot();
        },
        add_space: function () {
            if (this.schedule.length > 0) {
                let last = JSON.parse(JSON.stringify(this.schedule[this.schedule.length - 1]))
                let hour = time_str_to_hour(last.start);
                hour += 1;
                if (hour > 23) hour = 23;
                last.start = hour_to_time_str(hour);
                this.schedule.push(last);
            } else {
                this.schedule.push({ "start": 0, "set_point": 20.0, "flowT": 45.0 });
            }
            this.simulate();
        },
        delete_space: function (index) {
            this.schedule.splice(index, 1);
            this.simulate();
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
        },
        export_config: function () {
            // Create exportable config object with all user-settable parameters
            var config = {
                days: this.days,
                building: JSON.parse(JSON.stringify(this.building)),
                external: JSON.parse(JSON.stringify(this.external)),
                heatpump: JSON.parse(JSON.stringify(this.heatpump)),
                control: JSON.parse(JSON.stringify(this.control)),
                schedule: JSON.parse(JSON.stringify(this.schedule))
            };
            
            // Convert to JSON string with nice formatting
            var jsonString = JSON.stringify(config, null, 2);
            
            // Copy to clipboard
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(jsonString).then(function() {
                    alert('Configuration exported to clipboard successfully!');
                }).catch(function(err) {
                    console.error('Failed to copy to clipboard: ', err);
                    // Fallback: show the JSON in a modal or alert
                    prompt('Copy the configuration below:', jsonString);
                });
            } else {
                // Fallback for older browsers
                prompt('Copy the configuration below:', jsonString);
            }
        },
        import_config: function () {
            var jsonString = prompt('Paste your configuration JSON below:');
            
            if (jsonString && jsonString.trim() !== '') {
                try {
                    var config = JSON.parse(jsonString);
                    
                    // Validate that the config has the expected structure
                    if (this.validate_config(config)) {
                        // Apply the imported configuration
                        if (config.days !== undefined) this.days = config.days;
                        if (config.building) {
                            Object.assign(this.building, config.building);
                        }
                        if (config.external) {
                            Object.assign(this.external, config.external);
                        }
                        if (config.heatpump) {
                            Object.assign(this.heatpump, config.heatpump);
                        }
                        if (config.control) {
                            Object.assign(this.control, config.control);
                        }
                        if (config.schedule && Array.isArray(config.schedule)) {
                            this.schedule = JSON.parse(JSON.stringify(config.schedule));
                        }
                        
                        // Update fabric starting temperatures
                        update_fabric_starting_temperatures();
                        
                        // Run simulation with new config
                        this.simulate();
                        
                        alert('Configuration imported successfully!');
                    } else {
                        alert('Invalid configuration format. Please check your JSON structure.');
                    }
                } catch (e) {
                    alert('Invalid JSON format. Please check your configuration and try again.\n\nError: ' + e.message);
                }
            }
        },
        validate_config: function (config) {
            // Basic validation to ensure config has expected structure
            if (typeof config !== 'object' || config === null) {
                return false;
            }
            
            // Check for required main sections (at least one should exist)
            var hasValidSection = false;
            
            if (config.building && typeof config.building === 'object') {
                hasValidSection = true;
            }
            if (config.external && typeof config.external === 'object') {
                hasValidSection = true;
            }
            if (config.heatpump && typeof config.heatpump === 'object') {
                hasValidSection = true;
            }
            if (config.control && typeof config.control === 'object') {
                hasValidSection = true;
            }
            if (config.schedule && Array.isArray(config.schedule)) {
                hasValidSection = true;
            }
            
            return hasValidSection;
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

// var hs = 0.1;
/*
roomT_data = [];
outsideT_data = [];
flowT_data = [];
returnT_data = [];
elec_data = [];
heat_data = [];
*/

ITerm = 0
error = 0

update_fabric_starting_temperatures();
flow_temperature = room;
return_temperature = room;
MWT = room;

app.refinements = 5;
app.simulate();
app.refinements = 3;

app.baseline = JSON.parse(JSON.stringify(app.results));
app.baseline_enabled = false;

function update_fabric_starting_temperatures() {
    t1 = app.building.fabric[0].T;
    t2 = app.building.fabric[1].T;
    room = app.building.fabric[2].T;
}

function sim(conf) {

    if (conf.record_timeseries) {
        roomT_data = [];
        outsideT_data = [];
        flowT_data = [];
        returnT_data = [];
        elec_data = [];
        heat_data = [];
    }

    if (app.control.fixed_compressor_speed>100) app.control.fixed_compressor_speed = 100;
    if (app.control.fixed_compressor_speed<app.heatpump.minimum_modulation) app.control.fixed_compressor_speed = app.heatpump.minimum_modulation;

    var outside_min_time = conf.outside_min_time;
    var outside_max_time = conf.outside_max_time;
    var schedule = conf.schedule;

    // Layer 1:
    var u1 = app.building.fabric[0].WK;
    var k1 = 3600000 * app.building.fabric[0].kWhK;
    // Layer 2:
    var u2 = app.building.fabric[1].WK;
    var k2 = 3600000 * app.building.fabric[1].kWhK;
    // Layer 3:
    var u3 = app.building.fabric[2].WK;
    var k3 = 3600000 * app.building.fabric[2].kWhK;

    var timestep = 30;
    var itterations = 3600 * 24 * app.days / timestep;
    var start_of_last_day = 3600 * 24 * (app.days-1) / timestep;

    var elec_kwh = 0;
    var heat_kwh = 0;

    // max_flowT = 0;
    setpoint = 0;
    heatpump_heat = 0;
    heatpump_elec = 0;

    var power_to_kwh = timestep / 3600000;

    var max_room_temp = 0;
    
    heatpump_state = 0;
    flow_temperature = room;
    return_temperature = room;
    MWT_off = 200;

    heatpump_max_roomT_state = 0;
    

    var ramp_up = outside_max_time - outside_min_time;
    var ramp_down = 24 - ramp_up;

    var room_temp_sum = 0;

    var total_cost = 0;
    var price = 0;
    
    let stats_count = 0;
    let flowT_weighted_sum = 0;
    let outsideT_weighted_sum = 0;
    let flowT_minus_outsideT_weighted_sum = 0;
    let kwh_carnot_elec = 0;
    let kwh_elec_running = 0;
    let kwh_heat_running = 0;

    for (var i = 0; i < itterations; i++) {
        let time = i * timestep;
        let hour = time / 3600;
        hour = hour % 24;
        
        // Outside temperature model
        if (hour>=outside_min_time && hour<outside_max_time) {
            A = (hour-outside_min_time-(6*ramp_up/12)) / (ramp_up*2)
        } else {
            let hour_mod = hour;
            if (hour<outside_min_time) hour_mod = 24 + hour;
            A = (hour_mod-outside_max_time+(6*ramp_down/12)) / (ramp_down*2)
        }
        radians = 2 * Math.PI * A
        outside = app.external.mid + Math.sin(radians) * app.external.swing * 0.5;   
    

        last_setpoint = setpoint;

        // Load heating schedule
        for (let j = 0; j < schedule.length; j++) {
            let start = time_str_to_hour(schedule[j].start);
            if (hour >= start) {
                setpoint = parseFloat(schedule[j].set_point);
                price = parseFloat(schedule[j].price);
                // max_flowT = parseFloat(schedule[j].flowT);
            }
        }
        
        if (app.control.mode==AUTO_ADAPT) {
            // 3 term control algorithm
            // Kp = 1400 // Find unstable oscillation point and divide in half.. 
            // Ki = 0.2
            // Kd = 0
        
            last_error = error
            error = setpoint - room

            // Option: explore control based on flow temp target
            // error = max_flowT - flow_temperature
            delta_error = error - last_error

            PTerm = app.control.Kp * error
            ITerm += error * timestep
            DTerm = delta_error / timestep

            heatpump_heat = PTerm + (app.control.Ki * ITerm) + (app.control.Kd * DTerm)
            
        } else if (app.control.mode==WEATHER_COMP_CURVE) {
            
            // Rather than describe a heating curve based on table data with the requirement to work out which curve you should be on
            // this approach makes use of the fact that we know the building parameters exactly. We can then use these to generate
            // a flow temperature to outside temperature relationship that is finely tuned to the physics of the building.
            
            if (app.control.wc_use_outside_mean) {
                used_outside = app.external.mid
            } else {
                used_outside = outside 
            }

            flowT_target = setpoint + 2.55 * Math.pow(app.control.curve*(setpoint - used_outside), 0.78);


            if (app.control.limit_by_roomT) {
                if (room>setpoint+(app.control.roomT_hysteresis*0.5)) {
                    heatpump_max_roomT_state = 1;
                }

                if (heatpump_max_roomT_state==1 && room<setpoint-(app.control.roomT_hysteresis*0.5)) {
                    heatpump_max_roomT_state = 0;
                }
            }

            if (heatpump_max_roomT_state==0) {
            
                last_error = error
                error = flowT_target - flow_temperature

                delta_error = error - last_error

                PTerm = app.control.wc_Kp * error
                ITerm += error * timestep
                DTerm = delta_error / timestep

                heatpump_heat = PTerm + (app.control.wc_Ki * ITerm) + (app.control.wc_Kd * DTerm)
            } else {
                heatpump_heat = 0;
            }

        } else if (app.control.mode==FIXED_SPEED) {
            heatpump_heat = app.heatpump.capacity;

            if (app.control.limit_by_roomT) {
                if (room>setpoint+(app.control.roomT_hysteresis*0.5)) {
                    heatpump_max_roomT_state = 1;
                }

                if (heatpump_max_roomT_state==1 && room<setpoint-(app.control.roomT_hysteresis*0.5)) {
                    heatpump_max_roomT_state = 0;
                }
            }

            if (heatpump_max_roomT_state==0) {
                heatpump_heat = 1.0 * app.heatpump.capacity * (app.control.fixed_compressor_speed / 100);
            } else {
                heatpump_heat = 0;
            }
        }

        // Apply limits
        if (heatpump_heat > app.heatpump.capacity) {
            heatpump_heat = app.heatpump.capacity;
        }
        if (heatpump_heat < 0) {
            heatpump_heat = 0;
        }
        
        // Minimum modulation cycling control
        
        // if heat pump is off and demand for heat is more than minimum modulation turn heat pump on
        if (heatpump_state==0 && heatpump_heat>=(app.heatpump.capacity*app.heatpump.minimum_modulation*0.01) && MWT<(MWT_off-3)) {
            heatpump_state = 1;
        }
            
        // If we are below minimum modulation turn heat pump off
        if (heatpump_heat<(app.heatpump.capacity*app.heatpump.minimum_modulation*0.01) && heatpump_state==1) {
            MWT_off = MWT;
            heatpump_state = 0;
        }

        // Set heat pump heat to zero if state is off
        if (heatpump_state==0) {
            heatpump_heat = 0;
        }

        // Implementation includes system volume

        // Important conceptual simplification is to model the whole system as a single volume of water
        // a bit like a water or oil filled radiator. The heat pump condencer sits inside this volume and
        // the volume radiates heat according to it's mean water temperature.

        // The important system temperature is therefore mean water temperature
        // Flow and return temperatures are calculated later as an output based on flow rate.

        // 1. Heat added to system volume from heat pump
        MWT += (heatpump_heat * timestep) / (app.heatpump.system_water_volume * 4187)

        // 2. Calculate radiator output based on Room temp and MWT
        Delta_T = MWT - room;
        radiator_heat = app.heatpump.radiatorRatedOutput * Math.pow(Delta_T / app.heatpump.radiatorRatedDT, 1.3);

        // 3. Subtract this heat output from MWT
        MWT -= (radiator_heat * timestep) / (app.heatpump.system_water_volume * 4187)
        
        let system_DT = heatpump_heat / ((app.heatpump.flow_rate / 60) * 4187);

        flow_temperature = MWT + (system_DT * 0.5);
        return_temperature = MWT - (system_DT * 0.5);

        var PracticalCOP = 0;
        if (app.heatpump.cop_model == "carnot_fixed") {
            // Simple carnot equation based heat pump model with fixed offsets
            let condenser = flow_temperature + 2;
            let evaporator = outside - 6;
            let IdealCOP = (condenser + 273) / ((condenser + 273) - (evaporator + 273));
            PracticalCOP = IdealCOP * (app.heatpump.prc_carnot / 100);
        } else if (app.heatpump.cop_model == "carnot_variable") {
            // Simple carnot equation based heat pump model with variable offsets
            let output_ratio = heatpump_heat / app.heatpump.capacity;
            let condenser = flow_temperature + (3 * output_ratio);
            let evaporator = outside - (8 * output_ratio);
            let IdealCOP = (condenser + 273) / ((condenser + 273) - (evaporator + 273));
            PracticalCOP = IdealCOP * (app.heatpump.prc_carnot / 100);
        } else if (app.heatpump.cop_model == "ecodan") {
            PracticalCOP = get_ecodan_cop(flow_temperature, outside, heatpump_heat / app.heatpump.capacity);
        } else if (app.heatpump.cop_model == "vaillant5") {
            PracticalCOP = getCOP(vaillant_data, flow_temperature, outside, app.heatpump.capacity*0.001*(heatpump_heat / app.heatpump.capacity));
        }

        if (PracticalCOP > 0) {
            heatpump_elec = heatpump_heat / PracticalCOP;
        } else {
            heatpump_elec = 0;
        }

        // Add standby power and pump power
        if (heatpump_elec > 0) {
            heatpump_elec += app.heatpump.pumps;
        }
        heatpump_elec += app.heatpump.standby;

        // Building fabric model

        // 1. Calculate heat fluxes
        h3 = (app.building.internal_gains + radiator_heat) - (u3 * (room - t2));
        h2 = u3 * (room - t2) - u2 * (t2 - t1);
        h1 = u2 * (t2 - t1) - u1 * (t1 - outside);
        
        // 2. Calculate change in temperature
        room += (h3 * timestep) / k3;
        t2 += (h2 * timestep) / k2;
        t1 += (h1 * timestep) / k1;

        if (room>max_room_temp){
            max_room_temp = room;
        }

        // Populate time series data arrays for plotting
        if (conf.record_timeseries && i > start_of_last_day) {
            let timems = time*1000;
            roomT_data.push([timems, room]);
            outsideT_data.push([timems, outside]);
            flowT_data.push([timems, flow_temperature]);
            returnT_data.push([timems, return_temperature]);
            elec_data.push([timems, heatpump_elec]);
            heat_data.push([timems, heatpump_heat]);

            // Calculate stats

            // Calculate ideal carnot efficiency
            let condensor = flow_temperature + 2 + 273.15;
            let evaporator = outside - 6 + 273.15;
            let carnot_dt = condensor - evaporator;
            let ideal_carnot = 0;
            if (carnot_dt>0) {
                ideal_carnot = condensor / carnot_dt;
            }

            if (system_DT>1 && heatpump_heat>0 && ideal_carnot>0) {
                // Calulate predicted elec consumption based on carnot efficiency
                kwh_carnot_elec += (heatpump_heat / ideal_carnot) * power_to_kwh;
                kwh_elec_running += heatpump_elec * power_to_kwh;
                kwh_heat_running += heatpump_heat * power_to_kwh;
            }

            room_temp_sum += room;
            elec_kwh += heatpump_elec * power_to_kwh;
            heat_kwh += heatpump_heat * power_to_kwh;
            total_cost += heatpump_elec * power_to_kwh * price * 0.01;
            flowT_weighted_sum += flow_temperature * heatpump_heat * power_to_kwh;
            outsideT_weighted_sum += outside * heatpump_heat * power_to_kwh;
            flowT_minus_outsideT_weighted_sum += heatpump_heat * (flow_temperature-outside) * power_to_kwh;


            stats_count++;
        }
    }

    if (stats_count) {
        app.stats.flowT_weighted = flowT_weighted_sum / heat_kwh;
        app.stats.outsideT_weighted = outsideT_weighted_sum / heat_kwh;
        app.stats.flowT_minus_outsideT_weighted = flowT_minus_outsideT_weighted_sum / heat_kwh;

        app.stats.wa_prc_carnot = 0;
        if (kwh_elec_running>0 && kwh_carnot_elec>0) {
            app.stats.wa_prc_carnot = (kwh_heat_running / kwh_elec_running) / (kwh_heat_running / kwh_carnot_elec)
        }

    }

    return {
        elec_kwh: elec_kwh,
        heat_kwh: heat_kwh,
        max_room_temp: max_room_temp,
        mean_room_temp: room_temp_sum / stats_count,
        total_cost: total_cost
    }
    
    // Automatic refinement, disabled for now, running simulation 3 times instead.
    // if (Math.abs(start_t1 - t1) > hs * 1.0) sim();
}

function plot() {
    var series = [
        { label: "Heat", data: heat_data, color: 0, yaxis: 3, lines: { show: true, fill: true } },
        { label: "Elec", data: elec_data, color: 1, yaxis: 3, lines: { show: true, fill: true } },
        { label: "FlowT", data: flowT_data, color: 2, yaxis: 2, lines: { show: true, fill: false } },
        { label: "ReturnT", data: returnT_data, color: 3, yaxis: 2, lines: { show: true, fill: false } },
        { label: "RoomT", data: roomT_data, color: "#000", yaxis: 1, lines: { show: true, fill: false } },
        { label: "OutsideT", data: outsideT_data, color: "#0000cc", yaxis: 1, lines: { show: true, fill: false } }
    ];

    var options = {
        grid: { show: true, hoverable: true },
        xaxis: { mode: 'time' },
        yaxes: [{}, { min: 1.5 }],
        selection: { mode: "xy" }
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
            tooltipstr += "Elec: " + (elec_data[z][1]).toFixed(0) + "W<br>";
            // Add heat_data
            tooltipstr += "Heat: " + (heat_data[z][1]).toFixed(0) + "W<br>";
            // Add flowT_data
            tooltipstr += "FlowT: " + (flowT_data[z][1]).toFixed(1) + "°C<br>";
            // Add returnT_data
            tooltipstr += "ReturnT: " + (returnT_data[z][1]).toFixed(1) + "°C<br>";
            // Add roomT_data
            tooltipstr += "RoomT: " + (roomT_data[z][1]).toFixed(1) + "°C<br>";
            // Add outsideT_data
            tooltipstr += "OutsideT: " + (outsideT_data[z][1]).toFixed(1) + "°C<br>";

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

$(window).resize(function () {
    $('#graph').width($('#graph_bound').width());
    plot();
});
