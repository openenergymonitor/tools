var AUTO_ADAPT = 0;
var WEATHER_COMP_CURVE = 1;
var FIXED_SPEED = 3;
var DEGREE_MINUTES_WC = 4;



var price_cap = 27.69;
var cosy_examples_schedule = [
    { start: "00:00", set_point: 18, price: 29.94 },
    { start: "04:00", set_point: 21, price: 14.68 },
    { start: "07:00", set_point: 19.5, price: 29.94 },
    { start: "13:00", set_point: 21, price: 14.68 },
    { start: "16:00", set_point: 19, price: 44.91 },
    { start: "19:00", set_point: 19.5, price: 29.94 },
    { start: "22:00", set_point: 19, price: 14.68 }
];

// Object to hold time series data for plotting
var series = [];

// View parameters for plotting
var view = {
    start: 0,
    end: 0
};

// Initialize degree minutes accumulator before sim() function (around line 430):
var degree_minutes = 0;
var last_outside = null;

// Array to hold loaded outside temperature data
var annual_dataset_outsideT = [];
var annual_dataset_loaded = false;
var outside_temperature_start_timestamp = 0;

var app = new Vue({
    el: '#app',
    data: {
        mode: "day",
        // These are days not included in results, to allow system to stabilise
        days_pre_sim: 5,
        // These are days to simulate and include in results
        days: 1,
        building: {
            heat_loss: 3400,
            internal_gains: 330,
            solar_scale: 2.0,
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
            max_time: "14:00",
            use_csv: false
        },
        heatpump: {
            capacity: 5000,
            system_water_volume: 120, // Litres
            flow_rate: 12, // Litres per minute
            system_DT: 5,
            radiatorRatedOutput: 15000,
            radiatorRatedDT: 50,
            prc_carnot: 47,
            cop_model: "carnot_variable",
            standby: 11,
            pumps: 15,
            minimum_modulation: 40
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
            limit_by_roomT: true,
            roomT_hysteresis: 0.5,

            fixed_compressor_speed: 45
        },
        schedule: [
            { start: "00:00", set_point: 17, price: price_cap },
            { start: "06:00", set_point: 18, price: price_cap },
            { start: "15:00", set_point: 19, price: price_cap },
            { start: "22:00", set_point: 17, price: price_cap }
        ],
        dhw_schedule: [
            { start: "02:00", set_point: 45, duration: 0 },
            { start: "14:00", set_point: 45, duration: 0 },
        ],
        results: {
            elec_kwh: 0,
            heat_kwh: 0,
            mean_room_temp: 0,
            max_room_temp: 0,
            total_cost: 0,
            agile_cost: 0
        },
        baseline: {
            elec_kwh: 0,
            heat_kwh: 0,
            mean_room_temp: 0,
            max_room_temp: 0,
            total_cost: 0,
            agile_cost: 0
        },
        stats: {
            flowT_weighted: 0,
            outsideT_weighted: 0,
            flowT_minus_outsideT_weighted: 0,
            wa_prc_carnot: 0,
            // Windowed versions
            window_flowT_weighted: 0,
            window_outsideT_weighted: 0,
            window_flowT_minus_outsideT_weighted: 0,
            window_wa_prc_carnot: 0
            
        },
        baseline_enabled: false,
        max_room_temp: 0,
        outsideT_996: 0,
        outsideT_990: 0
    },
    methods: {
        change_mode: function () {
            
            if (this.mode == "day") {
                this.days = 1;
            } else {
                this.days = 365;
            }

            var timestep = 30;
            var itterations = 3600 * 24 * app.days / timestep;

            // Set view if not already set
            view.start = 0;
            view.end = itterations * timestep;
            view_calc_interval();

            if (this.days == 365) {
                if (!annual_dataset_loaded) {
                    this.external.use_csv = true;
                    this.load_csv_data();
                    return;
                }
            }

            this.simulate();
        },
        load_octopus_cosy: function () {
            this.schedule = JSON.parse(JSON.stringify(cosy_examples_schedule));
            this.simulate();
        },
        load_csv_data: function() {
            fetch('tools/dynamic_heatpump_v1/llanberis2024.csv')
                .then(response => response.text())
                .then(csv => {
                    this.parse_csv(csv);
                    app.simulate();
                })
                .catch(error => {
                    console.error('Error loading CSV:', error);
                    alert('Failed to load outside_temperature.csv');
                });
        },
        parse_csv: function(csv) {
            const lines = csv.split('\n');
            annual_dataset_outsideT = [];
            annual_dataset_solar = []; // used for solar gains
            annual_dataset_agile = []; // used for agile pricing

            console.log(`Parsing CSV with ${lines.length} lines`);
            
            // Skip header row
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') continue;
                
                const columns = line.split(',');
                if (columns.length >= 3) {
                    const temperature = parseFloat(columns[1]);
                    const humidity = parseFloat(columns[2]);
                    const solar = parseFloat(columns[3]);
                    const agile = parseFloat(columns[4]);
                    
                    annual_dataset_outsideT.push(temperature*1);
                    annual_dataset_solar.push(solar*1);
                    annual_dataset_agile.push(agile*1);
                }
            }
            
            if (annual_dataset_outsideT.length > 0) {
                annual_dataset_loaded = true;
                // Set start timestamp to Jan 1st 00:00 of current year
                const currentYear = new Date().getFullYear();
                outside_temperature_start_timestamp = new Date(currentYear, 0, 1, 0, 0, 0).getTime() / 1000;
                
                console.log(`Loaded ${annual_dataset_outsideT.length} half hourly temperature readings`);
                // alert(`Successfully loaded ${annual_dataset_outsideT.length} hourly temperature readings from outside_temperature.csv`);
                this.simulate();
            } else {
                alert('No valid data found in CSV file');
            }
        },
        save_baseline: function () {
            this.baseline = JSON.parse(JSON.stringify(this.results));
            this.baseline_enabled = true;
        },
        simulate: function () {
            console.log("Simulating");
            
            // Show loading spinner
            show_spinner();

            setTimeout(() => {

                // if vaillant cop model selected, set capacity
                if (app.heatpump.cop_model == "vaillant5") {
                    // top end max capacity 5kW model
                    app.heatpump.capacity = 8500;
                } else if (app.heatpump.cop_model == "vaillant12") {
                    // top end max capacity 12kW model
                    app.heatpump.capacity = 17900;
                }

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

                // Pre-simulation days to stabilise system
                if (this.days_pre_sim > 0) {
                    var pre_sim_result = sim({
                        outside_min_time: outside_min_time,
                        outside_max_time: outside_max_time,
                        schedule: app.schedule,
                        days: app.days_pre_sim
                    });
                    // reset view
                    // view.start = 0;
                    // view.end = 0;
                }

                // Run simulation
                var result = sim({
                    outside_min_time: outside_min_time,
                    outside_max_time: outside_max_time,
                    schedule: app.schedule,
                    days: app.days
                });
                app.max_room_temp = result.max_room_temp;

                app.results.elec_kwh = result.elec_kwh;
                app.results.heat_kwh = result.heat_kwh;
                app.results.mean_room_temp = result.mean_room_temp;
                app.results.max_room_temp = result.max_room_temp;
                app.results.total_cost = result.total_cost;
                app.results.agile_cost = result.agile_cost;
                app.stats.flowT_weighted = result.flowT_weighted;
                app.stats.outsideT_weighted = result.outsideT_weighted;
                app.stats.flowT_minus_outsideT_weighted = result.flowT_minus_outsideT_weighted;
                app.stats.wa_prc_carnot = result.wa_prc_carnot;

                // Set view if not already set
                if (view.start == 0 && view.end == 0) {
                    view.start = 0;
                                    
                    var timestep = 30;
                    var itterations = 3600 * 24 * app.days / timestep;

                    view.end = itterations * timestep;
                    view_calc_interval();
                }

                plot();
                
                // Hide loading spinner
                hide_spinner();

            }, 10);
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
            var range = view.end - view.start;
            var center = (view.start + view.end) / 2;
            
            // Zoom out by 2x
            var new_range = range * 2;
            view.start = center - new_range / 2;
            view.end = center + new_range / 2;
            
            // Clamp to simulation bounds (0 to total simulation time)
            var max_time = app.days * 24 * 3600;
            if (view.start < 0) view.start = 0;
            if (view.end > max_time) view.end = max_time;
            
            view_calc_interval();
            plot();
        },
        zoom_in: function () {
            var range = view.end - view.start;
            var center = (view.start + view.end) / 2;
            
            // Zoom in by 2x
            var new_range = range / 2;
            view.start = center - new_range / 2;
            view.end = center + new_range / 2;
            
            // Minimum range of 1 hour
            if (view.end - view.start < 3600) {
                view.start = center - 1800;
                view.end = center + 1800;
            }
            
            view_calc_interval();
            plot();
        },
        pan_left: function () {
            var range = view.end - view.start;
            var shift = range * 0.25; // Pan by 25% of current view
            
            view.start -= shift;
            view.end -= shift;
            
            // Clamp to simulation bounds
            if (view.start < 0) {
                view.end = view.end - view.start;
                view.start = 0;
            }
            
            view_calc_interval();
            plot();
        },
        pan_right: function () {
            var range = view.end - view.start;
            var shift = range * 0.25; // Pan by 25% of current view
            var max_time = app.days * 24 * 3600;
            
            view.start += shift;
            view.end += shift;
            
            // Clamp to simulation bounds
            if (view.end > max_time) {
                view.start = max_time - range;
                view.end = max_time;
            }
            
            view_calc_interval();
            plot();
        },
        reset: function () {
            // Reset to full simulation view
            view.start = 0;
            view.end = app.days * 24 * 3600;
            view_calc_interval();
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
                        if (config.days !== undefined) {
                            if (config.days == 4) {
                                config.days = 1;
                            }
                            this.days = config.days;
                        }
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

ITerm = 0
error = 0


update_fabric_starting_temperatures();
flow_temperature = room;
return_temperature = room;
MWT = room;

app.simulate();

app.baseline = JSON.parse(JSON.stringify(app.results));
app.baseline_enabled = false;

function update_fabric_starting_temperatures() {
    t1 = app.building.fabric[0].T;
    t2 = app.building.fabric[1].T;
    room = app.building.fabric[2].T;
}

function get_from_annual_dataset(time_seconds) {
    if (!annual_dataset_loaded || annual_dataset_outsideT.length === 0) {
        return null;
    }
    
    // Calculate hours since start of year
    const hours_since_start = Math.floor(time_seconds / 1800);
    
    // Get index in hourly array (wrapping around if beyond one year)
    const index = hours_since_start % annual_dataset_outsideT.length;
    
    if (index >= 0 && index < annual_dataset_outsideT.length) {
        return {
            temperature: annual_dataset_outsideT[index],
            solar: annual_dataset_solar[index],
            agile: annual_dataset_agile[index]
        }
    }
    
    return null;
}

function sim(conf) {

    roomT_data = [];
    outsideT_data = [];
    flowT_data = [];
    returnT_data = [];
    elec_data = [];
    heat_data = [];
    agile_data = [];
    
    var heatpump_off_duration = 0;

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
    var itterations = 3600 * 24 * conf.days / timestep;


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
    var agile_cost = 0;
    var price = 0;
    
    let stats_count = 0;
    let flowT_weighted_sum = 0;
    let outsideT_weighted_sum = 0;
    let flowT_minus_outsideT_weighted_sum = 0;
    let kwh_carnot_elec = 0;
    let kwh_elec_running = 0;
    let kwh_heat_running = 0;

    let outside = 0;
    let solar = 0;
    let agile_price = 0;

    let DHW_active = false;

    let outsideT_histogram = {};

    for (var i = 0; i < itterations; i++) {
        let time = i * timestep;
        let hour = time / 3600;
        hour = hour % 24;
        
        
        if (app.external.use_csv && annual_dataset_loaded) {
            // Use CSV data - time is in seconds from start of simulation
            let dataset = get_from_annual_dataset(time);
            let csv_temp = dataset ? dataset.temperature : null;
            let csv_solar = dataset ? dataset.solar : 0;
            let csv_agile = dataset ? dataset.agile : 0;
            
            if (csv_temp !== null) {
                outside = csv_temp;
            }

            if (csv_solar !== null) {
                solar = csv_solar;
                if (solar < 0) solar = 0; // Ensure no negative solar gains
            }

            if (csv_agile !== null) {
                agile_price = csv_agile;
            }

        } else {
            // Use synthetic temperature model
            if (hour>=outside_min_time && hour<outside_max_time) {
                A = (hour-outside_min_time-(6*ramp_up/12)) / (ramp_up*2)
            } else {
                let hour_mod = hour;
                if (hour<outside_min_time) hour_mod = 24 + hour;
                A = (hour_mod-outside_max_time+(6*ramp_down/12)) / (ramp_down*2)
            }
            radians = 2 * Math.PI * A
            outside = app.external.mid + Math.sin(radians) * app.external.swing * 0.5;
        }

        // if (outside > 19.9) outside = 19.9;

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

        DHW_active = false;

        // Load DHW schedule
        for (let j = 0; j < app.dhw_schedule.length; j++) {
            let start = time_str_to_hour(app.dhw_schedule[j].start);
            let duration_hours = app.dhw_schedule[j].duration / 3600;
            if (hour >= start && hour < (start + duration_hours)) {
                DHW_active = true;
                break;
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
            if (heatpump_heat == NaN) heatpump_heat = 0;
            // if infinite, set to zero
            if (!isFinite(heatpump_heat)) heatpump_heat = 0;
            
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
        if (app.control.mode != DEGREE_MINUTES_WC) {

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

        }

        if (outside>15) {
            heatpump_state = 0;
            heatpump_heat = 0;
        }

        if (DHW_active) {
            heatpump_state = 0;
            heatpump_heat = 0;
        }

        // clear itrem if heat pump has been off for more than 12 hours
        if (heatpump_state==0) {
            heatpump_off_duration += timestep;
            if (heatpump_off_duration > 43200) { // 12 hours in seconds
                ITerm = 0;
            }
        } else {
            heatpump_off_duration = 0;
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
        if (Delta_T < 0) Delta_T = 0;
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
            PracticalCOP = getCOP(vaillant_data['5kW'], flow_temperature, outside, 0.001*heatpump_heat);
        } else if (app.heatpump.cop_model == "vaillant12") {
            PracticalCOP = getCOP(vaillant_data['12kW'], flow_temperature, outside, 0.001*heatpump_heat);
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

        // 1. Calculate heat fluxes
        h3 = (app.building.internal_gains + radiator_heat + solar*app.building.solar_scale) - (u3 * (room - t2));
        h2 = u3 * (room - t2) - u2 * (t2 - t1);
        h1 = u2 * (t2 - t1) - u1 * (t1 - outside);
        
        // 2. Calculate change in temperature
        room += (h3 * timestep) / k3;
        t2 += (h2 * timestep) / k2;
        t1 += (h1 * timestep) / k1;

        if (room>max_room_temp){
            max_room_temp = room;
        }

        // we will add timestamps to data at the point the data is plotted
        // record here as fixed interval timeseries

        // Exit if any data is NaN
        if (room == NaN) return;
        if (outside == NaN) return;
        if (flow_temperature == NaN) return;
        if (return_temperature == NaN) return;
        if (heatpump_elec == NaN) return;
        if (heatpump_heat == NaN) return;

        // Store data for plotting
        roomT_data[i] = room;
        outsideT_data[i] = outside;
        flowT_data[i] = flow_temperature;
        returnT_data[i] = return_temperature
        elec_data[i] = heatpump_elec;
        heat_data[i] = heatpump_heat;
        agile_data[i] = agile_price;

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
        agile_cost += heatpump_elec * power_to_kwh * agile_price * 0.01 * 1.05; // 5% VAT
        flowT_weighted_sum += flow_temperature * heatpump_heat * power_to_kwh;
        outsideT_weighted_sum += outside * heatpump_heat * power_to_kwh;
        flowT_minus_outsideT_weighted_sum += heatpump_heat * (flow_temperature-outside) * power_to_kwh;

        stats_count++;

        // Outside temperature histogram
        // buckets to the closest 0.1 degree
        let outside_bucket = Math.round(outside * 10) / 10;
        // convert to string for object key
        outside_bucket = outside_bucket.toFixed(1);
        if (outsideT_histogram[outside_bucket] === undefined) {
            outsideT_histogram[outside_bucket] = 0;
        }
        outsideT_histogram[outside_bucket] += timestep;
    }

    calculate_outside_design_temperatures(outsideT_histogram);

    let wa_prc_carnot = 0;
    if (kwh_elec_running>0 && kwh_carnot_elec>0) {
        wa_prc_carnot = (kwh_heat_running / kwh_elec_running) / (kwh_heat_running / kwh_carnot_elec)
    }




    return {
        elec_kwh: elec_kwh,
        heat_kwh: heat_kwh,
        max_room_temp: max_room_temp,
        mean_room_temp: room_temp_sum / stats_count,
        total_cost: total_cost,
        agile_cost: agile_cost,
        flowT_weighted: flowT_weighted_sum / heat_kwh,
        outsideT_weighted: outsideT_weighted_sum / heat_kwh,
        flowT_minus_outsideT_weighted: flowT_minus_outsideT_weighted_sum / heat_kwh,
        wa_prc_carnot: wa_prc_carnot
    }
    
    // Automatic refinement, disabled for now, running simulation 3 times instead.
    // if (Math.abs(start_t1 - t1) > hs * 1.0) sim();
}

function calculate_outside_design_temperatures(outsideT_histogram) {

    // Sort outside temperature histogram by temperature ascending
    let sorted_outsideT_histogram = {};
    Object.keys(outsideT_histogram).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(key => {
        sorted_outsideT_histogram[key] = outsideT_histogram[key];
    });

    let total_hours = 24 * app.days;

    let prc_996 = null;
    let prc_990 = null;

    let sum_hours = 0;
    for (let temperature in sorted_outsideT_histogram) {
        let hours = sorted_outsideT_histogram[temperature] / 3600;
        
        sum_hours += hours;
        let prc = 100 * (1.0 - (sum_hours / total_hours));

        if (prc_996 === null && prc <= 99.6) {
            prc_996 = parseFloat(temperature);
        }

        if (prc_990 === null && prc <= 99.0) {
            prc_990 = parseFloat(temperature);
        }
    }

    app.outsideT_996 = prc_996;
    app.outsideT_990 = prc_990;
}


function plot() {

    var window = {};
    window.elec_data = timeseries(elec_data);
    window.heat_data = timeseries(heat_data);
    window.flowT_data = timeseries(flowT_data);
    window.returnT_data = timeseries(returnT_data);
    window.roomT_data = timeseries(roomT_data);
    window.outsideT_data = timeseries(outsideT_data);
    window.agile_data = timeseries(agile_data);

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
        { label: "FlowT", data: window.flowT_data, color: 2, yaxis: 2, lines: { show: true, fill: false } },
        { label: "ReturnT", data: window.returnT_data, color: 3, yaxis: 2, lines: { show: true, fill: false } },
        { label: "RoomT", data: window.roomT_data, color: "#000", yaxis: 1, lines: { show: true, fill: false } },
        { label: "OutsideT", data: window.outsideT_data, color: "#0000cc", yaxis: 1, lines: { show: true, fill: false } },
        { label: "Agile Price", data: window.agile_data, color: "#aaa", yaxis: 4, lines: { show: true, fill: false } }

    ];

    if (app.mode != "year") {
        // hide agile price in day mode
        series[6].lines.show = false;
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

function view_calc_interval() {
    var range_seconds = view.end - view.start;
    
    // Target ~6000-9000 data points on screen for optimal performance
    var ideal_interval = range_seconds / 6000;
    
    // Available downsample intervals (in seconds)
    var intervals = [3600, 1800, 900, 600, 300, 60, 30];
    
    // Select the smallest interval that meets or exceeds the ideal
    view.interval = intervals.find(function(interval) {
        return ideal_interval >= interval;
    }) || 30;
}

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
            // Add flowT_data
            tooltipstr += "FlowT: " + (series[2].data[z][1]).toFixed(1) + "°C<br>";
            // Add returnT_data
            tooltipstr += "ReturnT: " + (series[3].data[z][1]).toFixed(1) + "°C<br>";
            // Add roomT_data
            tooltipstr += "RoomT: " + (series[4].data[z][1]).toFixed(1) + "°C<br>";
            // Add outsideT_data
            tooltipstr += "OutsideT: " + (series[5].data[z][1]).toFixed(1) + "°C<br>";

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
