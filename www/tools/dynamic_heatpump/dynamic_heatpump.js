var AUTO_ADAPT = 0;
var WEATHER_COMP_CURVE = 1;
var CASCADE_PI = 2;
var FIXED_SPEED = 3;
var DEGREE_MINUTES_WC = 4;

var price_cap = 24.67; // (1 April to 30 June 2026)
var cosy_examples_schedule = [
    { start: "00:00", set_point: 18, price: 29.94 },
    { start: "04:00", set_point: 21, price: 14.68 },
    { start: "07:00", set_point: 19.5, price: 29.94 },
    { start: "13:00", set_point: 21, price: 14.68 },
    { start: "16:00", set_point: 19, price: 44.91 },
    { start: "19:00", set_point: 19.5, price: 29.94 },
    { start: "22:00", set_point: 19, price: 14.68 }
];

// Domestic hot water draw-off profile
// Fractions of the daily draw volume, at fixed clock times
var dhw_draw_profile = [
    { start: "07:00", duration_min: 30, fraction: 0.40 }, // morning showers
    { start: "08:30", duration_min: 5,  fraction: 0.10 }, // washing up
    { start: "13:30", duration_min: 5,  fraction: 0.10 }, // washing up
    { start: "19:00", duration_min: 15, fraction: 0.30 }, // bath
    { start: "20:30", duration_min: 5,  fraction: 0.10 }  // washing up
];

// == Primary pipework model ==
// Finite-volume model of the primary pipework between the heat pump and the
// building entry, ported from primary-pipework-simulator.html. Each leg is
// split into PW_DX metre cells (water + pipe wall heat capacity) with upwind
// advection when the pump runs and free cool-down when it stops, so transport
// delay, warm-front propagation and stagnant losses all emerge naturally.
var PW_DX = 0.5; // finite volume cell length (m)
var PW_PIPES = { // inner diameter m, copper wall heat capacity J/K per m
    "22": { id: 0.0202, wallC: 205 },
    "28": { id: 0.0262, wallC: 264 },
    "35": { id: 0.0327, wallC: 385 }
};
var PW_INSUL = { bare: 1.2, "13": 0.30, "19": 0.23, "25": 0.19 }; // U' W/m.K
// Segment types for the segmented path: inner diameter m, wall heat capacity
// J/K per m (MDPE walls carry over twice the heat capacity of copper),
// U' = 2*pi*lambda/ln(r2/r1) W/m.K
var PW_SEGTYPES = {
    cu28_pp19: { label: "28mm Cu + 19mm Primary Pro", id: 0.0262, wallC: 264, u: 0.2565 },
    cu28_25:   { label: "28mm Cu + 25mm nitrile",     id: 0.0262, wallC: 264, u: 0.19 },
    cu28_bare: { label: "28mm Cu bare",               id: 0.0262, wallC: 264, u: 1.2 },
    mdpe32_75: { label: "32mm MDPE in 75mm jacket",   id: 0.026,  wallC: 591, u: 0.2582 },
    cu22_pp19: { label: "22mm Cu + 19mm Primary Pro", id: 0.0202, wallC: 205, u: 0.30 }
};

// Build per-cell property arrays for the one-way path (heat pump -> building).
// amb: null means every cell tracks the live outside air temperature (simple
// mode); in segmented mode each cell has its own fixed ambient (e.g. ground
// temperature for buried MDPE).
function pw_build_path(primary) {
    var cap = [], u = [], amb = [], areas = [];
    if (primary.mode != "segmented") {
        var pd = PW_PIPES[primary.pipe];
        var area = Math.PI * pd.id * pd.id / 4;
        var n = Math.max(2, Math.round(primary.length / PW_DX));
        for (var j = 0; j < n; j++) {
            cap.push((area * 1000 * 4187 + pd.wallC) * PW_DX);
            u.push(PW_INSUL[primary.insulation]);
            areas.push(area);
        }
        return {
            N: n,
            cap: Float64Array.from(cap),
            u: Float64Array.from(u),
            amb: null,
            area: Float64Array.from(areas)
        };
    }
    for (var s = 0; s < primary.segments.length; s++) {
        var sg = primary.segments[s];
        var t = PW_SEGTYPES[sg.type];
        var nseg = Math.max(1, Math.round(sg.len / PW_DX));
        var a = Math.PI * t.id * t.id / 4;
        for (var k = 0; k < nseg; k++) {
            cap.push((a * 1000 * 4187 + t.wallC) * PW_DX);
            u.push(t.u);
            amb.push(sg.amb * 1);
            areas.push(a);
        }
    }
    while (cap.length < 2) {
        cap.push(cap[0]); u.push(u[0]); amb.push(amb[0]); areas.push(areas[0]);
    }
    return {
        N: cap.length,
        cap: Float64Array.from(cap),
        u: Float64Array.from(u),
        amb: Float64Array.from(amb),
        area: Float64Array.from(areas)
    };
}

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
        simulation_index: 0,
        mode: "day",
        // These are days not included in results, to allow system to stabilise
        days_pre_sim: 5,
        // These are days to simulate and include in results
        days: 1,
        building: {
            heat_loss: 3400,
            metabolic_gains: 80,
            lac_gains: 210,
            include_lac_gains_in_elec_demand: false,
            solar_gains_scale: 4.0,
            pv_scale: 0.0,
            fabric: [
                { proportion: 52, WK: 0, kWhK: 12, T: 16 },
                { proportion: 28, WK: 0, kWhK: 6, T: 17 },
                { proportion: 20, WK: 0, kWhK: 1, T: 18 }
            ],
            fabric_WK: 0
        },
        battery: {
            capacity_kwh: 0,
            max_rate_kw: 7,
            round_trip_efficiency: 0.85
        },
        external: {
            mid: 7.1,
            swing: 2,
            min_time: "06:00",
            max_time: "14:00",
            use_csv: false
        },
        heatpump: {
            capacity: 8500,
            system_water_volume: 120, // Litres
            flow_rate: 12, // Litres per minute
            system_DT: 5,
            radiatorRatedOutput: 7400,
            radiatorRatedDT: 50,
            prc_carnot: 47,
            cop_model: "vaillant5",
            standby: 11,
            pumps: 15,
            minimum_modulation: 30,
            ramp_rate: 1
        },
        // Primary pipework between the heat pump and the building entry.
        // "simple" = uniform copper pipe exposed to the live outside air
        // temperature; "segmented" = per-stage material & fixed ambient
        // (e.g. the buried MDPE example).
        primary: {
            mode: "simple",
            length: 10,          // m, one way
            pipe: "28",          // 22 | 28 | 35 mm copper
            insulation: "19",    // bare | 13 | 19 | 25 mm nitrile
            unit_volume: 1.5,    // L of water inside the heat pump itself
            pump_overrun: 0,     // minutes of circulation after the heat pump stops
            segments: [
                { name: "HP tails",   len: 0.8, type: "cu28_pp19", amb: 18 },
                { name: "Buried out", len: 5.0, type: "mdpe32_75", amb: 15 },
                { name: "Buried in",  len: 3.5, type: "mdpe32_75", amb: 16 },
                { name: "To meter",   len: 0.6, type: "cu28_pp19", amb: 20 }
            ]
        },
        pw_segtypes: PW_SEGTYPES,
        control: {
            mode: AUTO_ADAPT,
            wc_use_outside_mean: 1,
            
            Kp: 2000,
            Ki: 0.06,
            Kd: 0.0,

            // Cascade PI: outer loop (room temp -> flow temp target)
            // also used by Weather comp mode
            cascade_outer_Kp: 3.0,
            cascade_outer_Ki: 0.002,
            cascade_outer_max_flowT: 55,

            // Cascade PI: inner loop (flow temp target -> heat demand)
            cascade_inner_Kp: 500,
            cascade_inner_Ki: 0.05,

            curve: 0.86,
            limit_by_roomT: true,
            roomT_hysteresis: 0.5,

            fixed_compressor_speed: 45
        },
        schedule: [
            { start: "00:00", set_point: 17, price: price_cap },
            { start: "06:00", set_point: 18, price: price_cap },
            { start: "10:00", set_point: 18, price: price_cap },
            { start: "15:00", set_point: 19, price: price_cap },
            { start: "22:00", set_point: 17, price: price_cap }
        ],
        show_targetT: false,
        show_cyl_topT: true,
        show_cyl_bottomT: true,
        dhw_schedule: [
            { start: "04:00", set_point: 45, duration: 10800, modulation: 50 },
            { start: "13:00", set_point: 45, duration: 7200, modulation: 50 },
        ],
        dhw: {
            cylinder_volume: 150,     // Litres
            cylinder_height: 0.95,    // m, diameter derived from volume & height
            node_count: 8,           // Stratification nodes (2-40)
            coil_volume: 60,          // Litres, coil occupies the bottom this-many litres
            coil_UA: 1000,            // W/K, total coil heat-transfer coefficient x area
            cold_feed_temp: 10,       // °C
            mixed_draw_temp: 40,      // °C, thermostatic mixed delivery temperature at the tap
            reheat_hysteresis: 5,     // K below set_point before reheat starts
            stat_height: 0.75,        // Thermostat height, fraction from bottom
            daily_volume: 350,        // Litres of mixed hot water drawn per day
            wall_U: 0.8,              // W/m2K cylinder insulation U-value
            k_eff: 0.6,               // W/mK effective vertical conductivity between nodes
            flow_max: 60              // °C, primary flow temperature cap
        },
        results: {
            elec_kwh: 0,
            heat_kwh: 0,
            heat_kwh_m1: 0,
            heat_kwh_m2: 0,
            primary_loss_kwh: 0,
            mean_room_temp: 0,
            max_room_temp: 0,
            total_cost: 0,
            agile_cost: 0,
            solar_elec_kwh: 0,
            solar_cost: 0,
            solar_gains_kwh: 0,
            utilised_solar_gains_kwh: 0,
            dhw_heat_kwh: 0,
            dhw_elec_kwh: 0,
            dhw_delivered_kwh: 0,
            cylinder_loss_kwh: 0,
            min_cylinder_top_temp: 0,
            sim_time_ms: 0
        },
        baseline: {
            elec_kwh: 0,
            heat_kwh: 0,
            heat_kwh_m1: 0,
            heat_kwh_m2: 0,
            primary_loss_kwh: 0,
            mean_room_temp: 0,
            max_room_temp: 0,
            total_cost: 0,
            agile_cost: 0,
            solar_elec_kwh: 0,
            solar_cost: 0
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
            window_wa_prc_carnot: 0,
            degree_hours_above_setpoint: 0,
            degree_hours_below_setpoint: 0
            
        },
        baseline_enabled: false,
        max_room_temp: 0,
        outsideT_996: 0,
        outsideT_990: 0,
        // Manual run state: in annual mode input changes set needs_run and the
        // model is run with the Run button; progress tracks days processed
        needs_run: false,
        progress: {
            running: false,
            day: 0,
            total: 0
        }
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

            // Run directly on mode change (simulate() would only flag
            // needs_run in annual mode); later input changes use the Run button
            this.run_model();
        },
        load_octopus_cosy: function () {
            this.schedule = JSON.parse(JSON.stringify(cosy_examples_schedule));
            this.simulate();
        },
        load_csv_data: function() {
            fetch('tools/dynamic_heatpump/llanberis2024.csv')
                .then(response => response.text())
                .then(csv => {
                    this.parse_csv(csv);
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
                this.run_model();
            } else {
                alert('No valid data found in CSV file');
            }
        },
        save_baseline: function () {
            this.baseline = JSON.parse(JSON.stringify(this.results));
            this.baseline_enabled = true;
        },
        simulate: function () {
            // Instant run when simulating a single day. Annual runs take a
            // while, so input changes just flag that a re-run is needed and
            // the model is run manually with the Run button.
            if (this.mode == "year") {
                this.needs_run = true;
                return;
            }
            this.run_model();
        },
        run_model: function () {
            if (this.progress.running) return;
            this.needs_run = false;
            console.log("== Call to simulate ==");

            // Long runs get a day-count progress bar, short runs the spinner
            if (this.days > 31) {
                this.progress.running = true;
                this.progress.day = 0;
                this.progress.total = this.days_pre_sim + this.days;
            } else {
                show_spinner();
            }

            setTimeout(() => {

                // if vaillant cop model selected, set capacity
                if (app.heatpump.cop_model == "vaillant5") {
                    // top end max capacity 5kW model
                    app.heatpump.capacity = 8500;
                    // modulation to 30
                    app.heatpump.minimum_modulation = 30;
                } else if (app.heatpump.cop_model == "vaillant12") {
                    // top end max capacity 12kW model
                    app.heatpump.capacity = 17900;
                    // modulation to 20
                    app.heatpump.minimum_modulation = 30;
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

                // Main run, started after the pre-sim completes
                var run_main = function () {
                    app.simulation_index++;
                    var sim_start = performance.now();
                    sim({
                        outside_min_time: outside_min_time,
                        outside_max_time: outside_max_time,
                        schedule: app.schedule,
                        days: app.days
                    }, function (result) {
                        app.results.sim_time_ms = performance.now() - sim_start;
                        apply_results(result);
                    }, function (days_done) {
                        app.progress.day = app.days_pre_sim + Math.floor(days_done);
                    });
                };

                // Pre-simulation days to stabilise system
                if (this.days_pre_sim > 0) {
                    sim({
                        outside_min_time: outside_min_time,
                        outside_max_time: outside_max_time,
                        schedule: app.schedule,
                        days: app.days_pre_sim
                    }, run_main, function (days_done) {
                        app.progress.day = Math.floor(days_done);
                    });
                } else {
                    run_main();
                }

                function apply_results(result) {

                app.max_room_temp = result.max_room_temp;

                app.results.elec_kwh = result.elec_kwh;
                app.results.heat_kwh = result.heat_kwh;
                app.results.heat_kwh_m1 = result.heat_kwh_m1;
                app.results.heat_kwh_m2 = result.heat_kwh_m2;
                app.results.primary_loss_kwh = result.primary_loss_kwh;
                app.results.mean_room_temp = result.mean_room_temp;
                app.results.max_room_temp = result.max_room_temp;
                app.results.total_cost = result.total_cost;
                app.results.agile_cost = result.agile_cost;
                app.results.solar_elec_kwh = result.solar_elec_kwh;
                app.results.solar_cost = result.solar_cost;
                app.results.solar_gains_kwh = result.solar_gains_kwh;
                app.results.utilised_solar_gains_kwh = result.utilised_solar_gains_kwh;
                app.results.dhw_heat_kwh = result.dhw_heat_kwh;
                app.results.dhw_elec_kwh = result.dhw_elec_kwh;
                app.results.dhw_delivered_kwh = result.dhw_delivered_kwh;
                app.results.cylinder_loss_kwh = result.cylinder_loss_kwh;
                app.results.min_cylinder_top_temp = result.min_cylinder_top_temp;
                app.stats.flowT_weighted = result.flowT_weighted;
                app.stats.outsideT_weighted = result.outsideT_weighted;
                app.stats.flowT_minus_outsideT_weighted = result.flowT_minus_outsideT_weighted;
                app.stats.wa_prc_carnot = result.wa_prc_carnot;
                app.stats.degree_hours_above_setpoint = result.degree_hours_above_setpoint;
                app.stats.degree_hours_below_setpoint = result.degree_hours_below_setpoint;

                // Set view if not already set
                if (view.start == 0 && view.end == 0) {
                    view.start = 0;
                                    
                    var timestep = 30;
                    var itterations = 3600 * 24 * app.days / timestep;

                    view.end = itterations * timestep;
                    view_calc_interval();
                }

                plot();

                // Hide loading spinner / progress bar
                app.progress.running = false;
                hide_spinner();

                console.log("== End of simulate ==");

                }
                // == End of apply_results ==
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
        add_segment: function () {
            this.primary.segments.push({
                name: "stage " + (this.primary.segments.length + 1),
                len: 2, type: "cu28_pp19", amb: 10
            });
            this.simulate();
        },
        delete_segment: function (index) {
            if (this.primary.segments.length > 1) {
                this.primary.segments.splice(index, 1);
                this.simulate();
            }
        },
        load_buried_example: function () {
            this.primary.mode = "segmented";
            this.primary.segments = [
                { name: "HP tails",   len: 0.8, type: "cu28_pp19", amb: 18 },
                { name: "Buried out", len: 5.0, type: "mdpe32_75", amb: 15 },
                { name: "Buried in",  len: 3.5, type: "mdpe32_75", amb: 16 },
                { name: "To meter",   len: 0.6, type: "cu28_pp19", amb: 20 }
            ];
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
                primary: JSON.parse(JSON.stringify(this.primary)),
                control: JSON.parse(JSON.stringify(this.control)),
                schedule: JSON.parse(JSON.stringify(this.schedule)),
                dhw: JSON.parse(JSON.stringify(this.dhw)),
                dhw_schedule: JSON.parse(JSON.stringify(this.dhw_schedule))
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
                        if (config.primary) {
                            Object.assign(this.primary, JSON.parse(JSON.stringify(config.primary)));
                        }
                        if (config.control) {
                            Object.assign(this.control, config.control);
                        }
                        if (config.schedule && Array.isArray(config.schedule)) {
                            this.schedule = JSON.parse(JSON.stringify(config.schedule));
                        }
                        if (config.dhw) {
                            Object.assign(this.dhw, config.dhw);
                        }
                        if (config.dhw_schedule && Array.isArray(config.dhw_schedule)) {
                            this.dhw_schedule = JSON.parse(JSON.stringify(config.dhw_schedule));
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
        },
        set_schedule_max: function () {
            var max_setpoint = Math.max(...this.schedule.map(s => s.set_point));
            this.schedule.forEach(function(item) {
                item.set_point = max_setpoint;
            });
            this.simulate();
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
ITerm_outer = 0
error_outer = 0


update_fabric_starting_temperatures();
flow_temperature = room;
return_temperature = room;
// Primary pipework & emitter state: flow/ret are per-cell temperature arrays
// (heat pump -> building), Th the unit's internal volume, Te the indoor
// emitter node. Globals so they persist across the pre-sim warmup run and the
// real run (warm start, like cyl_T); (re)initialised inside sim() when the
// pipework configuration changes.
pw = { sig: "", flow: null, ret: null, Th: room, Te: room };
// Hot water cylinder node temperatures (index 0 = bottom, N-1 = top).
// Globals so they persist across the pre-sim warmup run and the real run
// (warm start, like pw). (Re)initialised inside sim() when the node count
// changes. The coil is fed from the primary pipework flow leg.
cyl_T = [];

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

// Runs the simulation asynchronously in chunks of a few simulated days,
// yielding to the browser between chunks so the UI can show progress on long
// runs. Calls on_done(results) on completion and on_progress(days_processed)
// after each chunk.
function sim(conf, on_done, on_progress) {
    console.log("Sim run: ", app.simulation_index, "Days: ", conf.days);

    // Simulation time parameters
    var timestep = 30;
    var itterations = 3600 * 24 * conf.days / timestep;
    var days = conf.days;
    var power_to_kwh = timestep / 3600000;

    // Limit fixed compressor speed to 100% and minimum modulation
    if (app.control.fixed_compressor_speed>100) app.control.fixed_compressor_speed = 100;
    if (app.control.fixed_compressor_speed<app.heatpump.minimum_modulation) app.control.fixed_compressor_speed = app.heatpump.minimum_modulation;

    // Keep the circulation flow rate physical (division by mcp below)
    if (!(app.heatpump.flow_rate >= 1)) app.heatpump.flow_rate = 1;
    if (app.heatpump.flow_rate > 40) app.heatpump.flow_rate = 40;

    // Outside temperature parameters
    var outside_min_time = conf.outside_min_time;
    var outside_max_time = conf.outside_max_time;

    // Calculate ramp up and down times for outside temperature
    var ramp_up = outside_max_time - outside_min_time;
    var ramp_down = 24 - ramp_up;

    // Building fabric parameters
    // Layer 1:
    var u1 = app.building.fabric[0].WK;
    var k1 = 3600000 * app.building.fabric[0].kWhK;
    // Layer 2:
    var u2 = app.building.fabric[1].WK;
    var k2 = 3600000 * app.building.fabric[1].kWhK;
    // Layer 3:
    var u3 = app.building.fabric[2].WK;
    var k3 = 3600000 * app.building.fabric[2].kWhK;

    // Schedule for set points and prices
    var schedule = conf.schedule;

    // Pre-process schedule - convert time strings to hours and sort
    var processed_schedule = schedule.map(function(entry) {
        return {
            hour: time_str_to_hour(entry.start),
            set_point: parseFloat(entry.set_point),
            price: parseFloat(entry.price)
        };
    }).sort(function(a, b) {
        return a.hour - b.hour;
    });

    // Pre-process DHW schedule - convert time strings to hours and duration to hours.
    // Each window has a modulation limit (% of heat pump capacity) so e.g. an
    // overnight eco window can reheat slowly at low output for better COP.
    // Clamp between the heat pump minimum modulation and 100%, writing the
    // clamped value back so the UI reflects it.
    var processed_dhw_schedule = app.dhw_schedule.map(function(entry) {
        let modulation = parseFloat(entry.modulation);
        if (isNaN(modulation)) modulation = 100;
        if (modulation < app.heatpump.minimum_modulation) modulation = app.heatpump.minimum_modulation;
        if (modulation > 100) modulation = 100;
        entry.modulation = modulation;
        return {
            start_hour: time_str_to_hour(entry.start),
            end_hour: time_str_to_hour(entry.start) + (entry.duration / 3600),
            set_point: parseFloat(entry.set_point),
            modulation: modulation
        };
    });

    // Calculate overheating temperature as max setpoint + 2 degrees (min 21 degrees)
    var max_setpoint = Math.max(...processed_schedule.map(e => e.set_point));
    var overheating_temp = Math.max(20, max_setpoint + 1);

    // Battery parameters
    let battery_soc = app.battery.capacity_kwh * 0.5; // Start at 50% state of charge

    // Initialize variables for simulation loop

    // State variables
    let setpoint = 0;
    let heatpump_heat_target = 0;
    let last_heatpump_heat = 0;
    let heatpump_heat = 0;
    let heatpump_elec = 0;
    let heatpump_state = 0;
    let flow_temperature = room;
    let return_temperature = room;
    let heatpump_max_roomT_state = 0;
    var price = 0;
    let outside = 0;
    let solar = 0;
    let agile_price = 0;
    let DHW_active = false;
    let last_on_time = 0;
    let dhw_reheat_state = 0;
    let dhw_setpoint = 45;
    let dhw_modulation = 100;
    let dhw_mode = false;

    // Max
    var max_room_temp = 0;

    // Reset results accumulators
    let elec_kwh = 0;
    let heat_kwh = 0;
    let solar_elec_kwh = 0;
    let solar_pv_kwh = 0;
    let solar_cost = 0;
    let solar_gains_kwh = 0;
    let utilised_solar_gains_kwh = 0;
    let kwh_carnot_elec = 0;
    let kwh_elec_running = 0;
    let kwh_heat_running = 0;

    let degree_hours_above_setpoint = 0;
    let degree_hours_below_setpoint = 0;
    let stats_count = 0;
    let flowT_weighted_sum = 0;
    let outsideT_weighted_sum = 0;
    let flowT_minus_outsideT_weighted_sum = 0;

    let room_temp_sum = 0;
    let total_cost = 0;
    let agile_cost = 0;

    let dhw_heat_kwh = 0;
    let dhw_elec_kwh = 0;
    let dhw_delivered_kwh = 0;
    let cylinder_loss_kwh = 0;
    let min_cyl_top = 1000;

    // Reset time series data arrays
    roomT_data = [];
    outsideT_data = [];
    flowT_data = [];
    returnT_data = [];
    elec_data = [];
    heat_data = [];
    agile_data = [];
    targetT_data = [];
    solar_pv_data = [];
    cylTopT_data = [];
    cylBottomT_data = [];
    
    // Reset degree minutes accumulator
    let outsideT_histogram = {};

    // Extract app parameters as constants before the loop
    const ctrl_mode = app.control.mode;
    const ctrl_Kp = app.control.Kp;
    const ctrl_Ki = app.control.Ki;
    const ctrl_Kd = app.control.Kd;
    const ctrl_wc_Kp = app.control.wc_Kp;
    const ctrl_wc_Ki = app.control.wc_Ki;
    const ctrl_wc_Kd = app.control.wc_Kd;
    const ctrl_wc_use_outside_mean = app.control.wc_use_outside_mean;
    const ctrl_curve = app.control.curve;
    const ctrl_limit_by_roomT = app.control.limit_by_roomT;
    const ctrl_roomT_hysteresis = app.control.roomT_hysteresis;
    const ctrl_fixed_compressor_speed = app.control.fixed_compressor_speed;
    const ctrl_cascade_outer_Kp = app.control.cascade_outer_Kp;
    const ctrl_cascade_outer_Ki = app.control.cascade_outer_Ki;
    const ctrl_cascade_outer_max_flowT = app.control.cascade_outer_max_flowT;
    const ctrl_cascade_inner_Kp = app.control.cascade_inner_Kp;
    const ctrl_cascade_inner_Ki = app.control.cascade_inner_Ki;
    const hp_capacity = app.heatpump.capacity;
    const hp_minimum_modulation = app.heatpump.minimum_modulation;
    const hp_system_water_volume = app.heatpump.system_water_volume;
    const hp_flow_rate = app.heatpump.flow_rate;
    const hp_radiatorRatedOutput = app.heatpump.radiatorRatedOutput;
    const hp_radiatorRatedDT = app.heatpump.radiatorRatedDT;
    const hp_prc_carnot = app.heatpump.prc_carnot;
    const hp_cop_model = app.heatpump.cop_model;
    const hp_standby = app.heatpump.standby;
    const hp_pumps = app.heatpump.pumps;
    const hp_ramp_rate = app.heatpump.ramp_rate;
    const bld_metabolic_gains = app.building.metabolic_gains;
    const bld_lac_gains = app.building.lac_gains;
    const bld_solar_gains_scale = app.building.solar_gains_scale;
    const bld_pv_scale = app.building.pv_scale;
    const bld_include_lac_gains_in_elec_demand = app.building.include_lac_gains_in_elec_demand;
    const bat_capacity_kwh = app.battery.capacity_kwh;
    const bat_max_rate_kw = app.battery.max_rate_kw;
    const bat_round_trip_efficiency = app.battery.round_trip_efficiency;
    const ext_mid = app.external.mid;
    const ext_use_csv = app.external.use_csv;
    const ext_swing_half = app.external.swing * 0.5;

    // Hoisted loop invariants
    const timestep_hours = timestep / 3600;
    const water_heat_capacity = hp_system_water_volume * 4187;
    const flow_heat_capacity = (hp_flow_rate / 60) * 4187;
    const schedule_last_index = processed_schedule.length - 1;
    const dhw_schedule_length = processed_dhw_schedule.length;

    // == Primary pipework setup ==
    const prim = app.primary;
    const pw_path = pw_build_path(prim);
    const pw_N = pw_path.N;
    const pw_cap = pw_path.cap;
    const pw_u = pw_path.u;
    const pw_amb = pw_path.amb;    // null => cells track live outside temperature
    const pw_area = pw_path.area;

    // (Re)initialise cell temperatures if the pipework configuration changed,
    // otherwise warm start from the previous run. Return cell i sits at path
    // position N-1-i (ret[0] at the building, ret[N-1] at the heat pump).
    const pw_sig = JSON.stringify([prim.mode, prim.length, prim.pipe,
        prim.insulation, prim.unit_volume, prim.segments]);
    if (pw.sig !== pw_sig || !pw.flow || pw.flow.length != pw_N) {
        pw.sig = pw_sig;
        pw.flow = new Float64Array(pw_N);
        pw.ret = new Float64Array(pw_N);
        for (let c = 0; c < pw_N; c++) {
            pw.flow[c] = pw_amb ? pw_amb[c] : ext_mid;
            pw.ret[c] = pw_amb ? pw_amb[pw_N - 1 - c] : ext_mid;
        }
        pw.Th = pw_amb ? pw_amb[0] : ext_mid;
        pw.Te = room;
    }

    // Heat pump internal volume node (+10% for HX metal), losing heat to its
    // ambient like an equivalent length of the first pipe cell
    const pw_Ch = Math.max(0.5, prim.unit_volume) / 1000 * 1000 * 4187 * 1.1;
    const pw_UAh = pw_u[0] * (prim.unit_volume / 1000) / pw_area[0];

    // Emitter node: the indoor system volume downstream of metering point 2
    const pw_Ce = water_heat_capacity;

    // Advection sub-stepping: the 30 s building timestep is far larger than
    // the pipe cell transport time, so while the pump runs the pipework
    // advances in sub-steps sized to keep the upwind advection fraction
    // below 0.9 (and no longer than 2 s).
    // The advection fraction is mcp*dt/cap rather than v*dt/DX: the warm
    // front travels slower than the water because it heats the pipe wall as
    // it advances, and with this scaling every cell-boundary energy exchange
    // is exactly mcp*dT, so the scheme conserves energy and the M1/M2 heat
    // metering ties up with the reported pipework loss.
    let pw_fmax = 1e-9; // largest advection fraction per second across the path
    for (let c = 0; c < pw_N; c++) pw_fmax = Math.max(pw_fmax, flow_heat_capacity / pw_cap[c]);
    const pw_nsub = Math.max(1, Math.ceil(timestep / Math.min(2, 0.9 / pw_fmax)));
    const pw_dt = timestep / pw_nsub;
    // Per-cell advection fractions for flow and return legs
    const pw_fF = new Float64Array(pw_N);
    const pw_fR = new Float64Array(pw_N);
    for (let c = 0; c < pw_N; c++) {
        pw_fF[c] = Math.min(1, flow_heat_capacity * pw_dt / pw_cap[c]);
        pw_fR[c] = Math.min(1, flow_heat_capacity * pw_dt / pw_cap[pw_N - 1 - c]);
    }
    const pw_overrun_s = (prim.pump_overrun * 1 || 0) * 60;

    // Metering accumulators: source is the condenser output (heat_kwh),
    // M1 the heat metered at the heat pump connections, M2 at the building
    // entry after the primary pipework
    let heat_m1_kwh = 0;
    let heat_m2_kwh = 0;
    let primary_loss_kwh = 0;
    let last_heat_time = -1e12;

    // Hot water cylinder parameters — stratified multi-node model ported from
    // cylinder/cylinder_sim.js (node 0 = bottom, node N-1 = top)
    // Clamp node count to an integer between 2 and 40
    let dhw_node_count = Math.round(app.dhw.node_count);
    if (dhw_node_count < 2) dhw_node_count = 2;
    if (dhw_node_count > 40) dhw_node_count = 40;
    app.dhw.node_count = dhw_node_count;

    // Geometry: diameter derived from volume and height, r from V = pi r^2 H
    const dhw_volume_m3 = app.dhw.cylinder_volume / 1000;
    const dhw_height = app.dhw.cylinder_height;
    const dhw_radius = Math.sqrt(dhw_volume_m3 / (Math.PI * dhw_height));
    const dhw_area = Math.PI * dhw_radius * dhw_radius;                          // cross-section m2
    const dhw_perim = 2 * Math.PI * dhw_radius;                                  // circumference m
    const dhw_dz = dhw_height / dhw_node_count;                                  // node thickness m

    const dhw_node_volume = app.dhw.cylinder_volume / dhw_node_count;            // Litres
    const dhw_node_heat_capacity = dhw_node_volume * 4187;                       // J/K

    // Coil occupies the bottom coil_volume litres of the tank (nodes 0..nCoil-1)
    let dhw_coil_nodes = Math.round(app.dhw.coil_volume / dhw_node_volume);
    if (dhw_coil_nodes < 1) dhw_coil_nodes = 1;
    if (dhw_coil_nodes > dhw_node_count) dhw_coil_nodes = dhw_node_count;

    // Per coil-node NTU effectiveness of the primary-to-tank heat exchange,
    // expressed as a conductance (W/K), capped so a node cannot overshoot the
    // primary temperature in a single timestep
    const dhw_coil_eps = 1 - Math.exp(-(app.dhw.coil_UA / dhw_coil_nodes) / flow_heat_capacity);
    let dhw_coil_WK = dhw_coil_eps * flow_heat_capacity;
    if (dhw_coil_WK > dhw_node_heat_capacity / timestep) dhw_coil_WK = dhw_node_heat_capacity / timestep;

    // Standing loss: wall U-value x side area per node, plus end caps on the
    // bottom and top nodes
    const dhw_node_loss_UA = [];
    for (let n = 0; n < dhw_node_count; n++) dhw_node_loss_UA[n] = app.dhw.wall_U * dhw_perim * dhw_dz;
    dhw_node_loss_UA[0] += app.dhw.wall_U * dhw_area;                            // bottom cap
    dhw_node_loss_UA[dhw_node_count - 1] += app.dhw.wall_U * dhw_area;           // top cap

    // Inter-node conduction: G = k_eff * A / dz
    const dhw_internode_WK = app.dhw.k_eff * dhw_area / dhw_dz;

    const dhw_stat_node = Math.min(dhw_node_count - 1, Math.floor(app.dhw.stat_height * dhw_node_count));
    const dhw_cold_feed = app.dhw.cold_feed_temp;
    const dhw_hysteresis = app.dhw.reheat_hysteresis;
    const dhw_mix_temp = app.dhw.mixed_draw_temp;
    const dhw_flow_max = app.dhw.flow_max;

    // Pre-process draw profile into per-timestep litres at fixed clock times
    const dhw_draw_events = dhw_draw_profile.map(function(ev) {
        let start_hour = time_str_to_hour(ev.start);
        return {
            start_hour: start_hour,
            end_hour: start_hour + ev.duration_min / 60,
            litres_per_step: (ev.fraction * app.dhw.daily_volume) / (ev.duration_min * 60 / timestep)
        };
    });

    // (Re)initialise cylinder nodes if the node count changed, otherwise warm start
    if (cyl_T.length != dhw_node_count) {
        cyl_T = [];
        for (let n = 0; n < dhw_node_count; n++) cyl_T[n] = 40;
    }
    let dhw_return_temp = 35;

    // Cylinder energy-conservation bookkeeping (ported from cylinder_sim.js):
    // the change in stored energy must equal coil input - draws - standing losses
    let cyl_E_start = 0;
    for (let n = 0; n < dhw_node_count; n++) cyl_E_start += cyl_T[n] * dhw_node_heat_capacity;
    let cyl_energy_in = 0;     // J, net external energy into the cylinder
    let cyl_throughput = 0;    // J, sum of |flux|, scale for the residual tolerance

    // == Main simulation loop ==
    // The loop is processed in chunks by run_chunk() below; all simulation
    // state lives in the enclosing sim() closure so each chunk carries on
    // exactly where the last one stopped.
    var chunk_iterations = 2880 * 4; // 4 simulated days per chunk
    var i = 0;

    function run_chunk() {
    var chunk_end = Math.min(i + chunk_iterations, itterations);
    for (; i < chunk_end; i++) {
        let time = i * timestep;
        let hour = time / 3600;
        hour = hour % 24;
        
        
        if (ext_use_csv && annual_dataset_loaded) {
            // Use CSV data - time is in seconds from start of simulation
            let dataset = get_from_annual_dataset(time);
            let csv_temp = dataset ? dataset.temperature : null;
            let csv_solar = dataset ? dataset.solar : 0;
            let csv_agile = dataset ? dataset.agile : 0;
            
            if (csv_temp !== null) {
                outside = csv_temp;
                if (outside < -10) outside = -10; // Limit extreme cold temperatures to avoid simulation instability
                if (outside > 35) outside = 35; // Limit extreme hot temperatures to avoid simulation instability

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
            outside = ext_mid + Math.sin(radians) * ext_swing_half;
        }

        // if (outside > 19.9) outside = 19.9;

        last_setpoint = setpoint;

        // Load heating schedule - find the active schedule entry for current hour
        // Start with the last entry (handles wraparound to next day)
        var scheduleIndex = schedule_last_index;
        
        // Find the correct schedule entry for this hour
        for (let j = 0; j < processed_schedule.length; j++) {
            if (hour >= processed_schedule[j].hour) {
                scheduleIndex = j;
            } else {
                break;
            }
        }
        
        setpoint = processed_schedule[scheduleIndex].set_point;
        price = processed_schedule[scheduleIndex].price;

        DHW_active = false;

        // Load DHW schedule - check if current hour falls within any DHW period
        for (let j = 0; j < dhw_schedule_length; j++) {
            let start = processed_dhw_schedule[j].start_hour;
            let end = processed_dhw_schedule[j].end_hour;
            
            // Handle wraparound case where end > 24 (e.g., 23:00 + 2 hours = 25:00)
            if (end > 24) {
                // DHW period spans midnight
                if (hour >= start || hour < (end - 24)) {
                    DHW_active = true;
                    dhw_setpoint = processed_dhw_schedule[j].set_point;
                    dhw_modulation = processed_dhw_schedule[j].modulation;
                    break;
                }
            } else {
                // Normal case - no wraparound
                if (hour >= start && hour < end) {
                    DHW_active = true;
                    dhw_setpoint = processed_dhw_schedule[j].set_point;
                    dhw_modulation = processed_dhw_schedule[j].modulation;
                    break;
                }
            }
        }

        // DHW reheat thermostat with hysteresis, sensing the stat node
        if (DHW_active) {
            if (dhw_reheat_state == 0 && cyl_T[dhw_stat_node] < dhw_setpoint - dhw_hysteresis) dhw_reheat_state = 1;
            if (dhw_reheat_state == 1 && cyl_T[dhw_stat_node] >= dhw_setpoint) dhw_reheat_state = 0;
        } else {
            dhw_reheat_state = 0;
        }

        if (ctrl_mode==AUTO_ADAPT) {
            // 3 term control algorithm
            // Kp = 1400 // Find unstable oscillation point and divide in half.. 
            // Ki = 0.2
            // Kd = 0
        
            last_error = error
            error = setpoint - room

            // Option: explore control based on flow temp target
            // error = max_flowT - flow_temperature
            delta_error = error - last_error

            PTerm = ctrl_Kp * error
            ITerm += error * timestep

            let max_ITerm = hp_capacity / ctrl_Ki;
            if (ITerm > max_ITerm) ITerm = max_ITerm;
            if (ITerm < 0) ITerm = 0;

            heatpump_heat_target = PTerm + (ctrl_Ki * ITerm) // + (app.control.Kd * DTerm)
            if (heatpump_heat_target == NaN) heatpump_heat_target = 0;
            // if infinite, set to zero
            if (!isFinite(heatpump_heat_target)) heatpump_heat_target = 0;
            
        } else if (ctrl_mode==CASCADE_PI) {

            // Outer PI loop: room temperature error -> flow temperature target
            error_outer = setpoint - room;
            ITerm_outer += error_outer * timestep;

            // Clamp outer ITerm so the flow temp target stays within [setpoint, max_flowT]
            let cascade_flowT_min = setpoint;
            let max_ITerm_outer = (ctrl_cascade_outer_max_flowT - cascade_flowT_min) / ctrl_cascade_outer_Ki;
            if (ITerm_outer > max_ITerm_outer) ITerm_outer = max_ITerm_outer;
            if (ITerm_outer < 0) ITerm_outer = 0;

            let cascade_flowT_target = cascade_flowT_min
                + ctrl_cascade_outer_Kp * error_outer
                + ctrl_cascade_outer_Ki * ITerm_outer;

            // Clamp flow temp target to reasonable bounds
            if (cascade_flowT_target < cascade_flowT_min) cascade_flowT_target = cascade_flowT_min;
            if (cascade_flowT_target > ctrl_cascade_outer_max_flowT) cascade_flowT_target = ctrl_cascade_outer_max_flowT;


            flowT_target = cascade_flowT_target;

        } else if (ctrl_mode==WEATHER_COMP_CURVE) {
            used_outside = outside

            // Mean option only available in day mode not annual mode
            if (ctrl_wc_use_outside_mean && days == 1) {
                used_outside = ext_mid
            }

            // Simple weather compensation curve - flow temperature target is a function of setpoint and outside temperature
            // Clamp temp difference to 0 to avoid Math.pow(negative, 0.75) returning NaN when outside > setpoint
            let wc_temp_diff = Math.max(0, setpoint - used_outside);
            flowT_target = setpoint + (2.8 * Math.pow(ctrl_curve, 0.8)) * Math.pow(wc_temp_diff, 0.75);

            // Clamp flow temp target to reasonable bounds
            if (flowT_target < setpoint) flowT_target = setpoint;
            if (flowT_target > 80) flowT_target = 80; // Max flow temp of 80 degrees to prevent unrealistic targets

        } else if (ctrl_mode==FIXED_SPEED) {
            heatpump_heat_target = 1.0 * hp_capacity * (ctrl_fixed_compressor_speed / 100);
        }

        // Inner cascade loop control (used by both weather compensation and cascade PI modes)
        if (ctrl_mode==CASCADE_PI || ctrl_mode==WEATHER_COMP_CURVE) {
            // Inner PI loop: flow temperature error -> heat demand
            last_error = error;
            error = flowT_target - flow_temperature;
            ITerm += error * timestep;

            let max_ITerm_inner = hp_capacity / ctrl_cascade_inner_Ki;
            if (ITerm > max_ITerm_inner) ITerm = max_ITerm_inner;
            if (ITerm < 0) ITerm = 0;

            heatpump_heat_target = ctrl_cascade_inner_Kp * error + ctrl_cascade_inner_Ki * ITerm;
            if (!isFinite(heatpump_heat_target)) heatpump_heat_target = 0;
        }

        // Max temperature limit control - only applies in fixed speed or weather compensation modes 
        // as in these modes we are not already modulating heat pump output based on room temperature
        if (ctrl_mode == WEATHER_COMP_CURVE || ctrl_mode == FIXED_SPEED) {
            if (ctrl_limit_by_roomT) {
                if (room>setpoint+(ctrl_roomT_hysteresis*0.5)) {
                    heatpump_max_roomT_state = 1;
                }

                if (heatpump_max_roomT_state==1 && room<setpoint-(ctrl_roomT_hysteresis*0.5)) {
                    heatpump_max_roomT_state = 0;
                }

                if (heatpump_max_roomT_state==1) {
                    heatpump_heat_target = 0;
                }
            }
        }

        // DHW priority: diverter valve sends all heat pump output to the cylinder coil.
        // The reheat runs at the schedule window's modulation limit (an eco mode:
        // e.g. 40% of capacity gives a slower reheat at lower flow temperature
        // and therefore better COP).
        dhw_mode = false;
        if (dhw_reheat_state == 1) {
            dhw_mode = true;
            heatpump_heat_target = hp_capacity * dhw_modulation * 0.01;
        }

        // Apply limits
        if (heatpump_heat_target > hp_capacity) {
            heatpump_heat_target = hp_capacity;
        }
        if (heatpump_heat_target < 0) {
            heatpump_heat_target = 0;
        }
        
        // === Minimum modulation cycling control ===
        // if heat pump is off and demand for heat is more than minimum modulation turn heat pump on
        if (heatpump_state==0 && heatpump_heat_target>=(hp_capacity*hp_minimum_modulation*0.01)) {
            // turn on if we have been off for at least 10 minutes to prevent short cycling
            if (time - last_on_time >= 600) {
                heatpump_state = 1;
            }
        }
            
        // If we are below minimum modulation turn heat pump off
        if (heatpump_heat_target<(hp_capacity*hp_minimum_modulation*0.01) && heatpump_state==1) {
            last_on_time = time;
            heatpump_state = 0;
        }

        // Set heat pump heat to zero if state is off
        if (heatpump_state==0) {
            heatpump_heat_target = 0;
        }
        // === End of minimum modulation control ===

        // Summer cutoff applies to space heating only, DHW reheat runs year round
        if (outside>15 && !dhw_mode) {
            heatpump_state = 0;
            heatpump_heat_target = 0;
            // Reset integrators when heat pump is off due to high outside temperature
            // to prevent windup that would prevent the heat pump restarting in autumn
            ITerm = 0;
            ITerm_outer = 0;
            heatpump_max_roomT_state = 0;
        }

        last_heatpump_heat = heatpump_heat;

        // Only apply ramp rate limiting if not fixed speed mode
        if (ctrl_mode != FIXED_SPEED) {
            let min_modulation_watts = hp_capacity * hp_minimum_modulation * 0.01;
            // Use min_modulation as the ramp rate when starting from zero, otherwise use ramp_rate % of capacity per timestep
            let max_step = heatpump_heat >= min_modulation_watts ? hp_capacity * hp_ramp_rate * 0.01 : min_modulation_watts;
            heatpump_heat = Math.min(heatpump_heat_target, last_heatpump_heat + max_step);
        } else {
            heatpump_heat = heatpump_heat_target;
        }

        // == Primary pipework, emitter & DHW coil ==
        // The heat pump condenser heats a small internal water volume (pw.Th).
        // Water is pumped through the primary pipework (finite volume cells
        // with upwind advection and heat loss to each cell's ambient) to the
        // building entry, where a diverter valve sends it either to the
        // emitter node (space heating) or down the DHW cylinder coil.
        // Metering point 1 sits at the heat pump connections, metering
        // point 2 at the building entry after the primary pipework.

        let system_DT = heatpump_heat / flow_heat_capacity;

        // Circulation pump runs while the heat pump runs, plus optional overrun
        if (heatpump_heat > 0) last_heat_time = time;
        let pump_on = heatpump_heat > 0 || (time - last_heat_time) <= pw_overrun_s;

        // Flow temperature limiter: as the unit outlet approaches the cap the
        // heat pump modulates down (and electricity use falls accordingly).
        // DHW reheat caps at dhw.flow_max, space heating at 75C.
        if (heatpump_heat > 0) {
            let flowT_cap = dhw_mode ? dhw_flow_max : 75;
            let max_heat = flow_heat_capacity * (flowT_cap - pw.Th);
            if (max_heat < 0) max_heat = 0;
            if (heatpump_heat > max_heat) {
                heatpump_heat = max_heat;
                system_DT = heatpump_heat / flow_heat_capacity;
            }
        }

        let E1_step = 0;      // J through metering point 1 (heat pump connections)
        let E2_step = 0;      // J through metering point 2 (building entry)
        let Erad_step = 0;    // J emitted by the radiators
        let Eloss_step = 0;   // J lost by the primaries + unit volume to ambient
        const pw_amb_unit = pw_amb ? pw_amb[0] : outside;

        if (pump_on) {
            for (let s = 0; s < pw_nsub; s++) {
                const ThIn = pw.ret[pw_N - 1];     // unit inlet from the return leg
                E1_step += flow_heat_capacity * (pw.Th - ThIn) * pw_dt;
                const Tf2 = pw.flow[pw_N - 1];     // flow temperature at the building entry

                // Diverter valve: the building return comes from either the
                // DHW coil or the emitter node
                let Tret_building;
                if (dhw_mode) {
                    // March the primary down through the coil nodes (NTU
                    // effectiveness per node) — the hottest primary meets the
                    // top coil node first and cools as it descends
                    let Tf = Tf2;
                    for (let n = dhw_coil_nodes - 1; n >= 0; n--) {
                        let Q_coil = dhw_coil_WK * (Tf - cyl_T[n]);
                        cyl_T[n] += (Q_coil * pw_dt) / dhw_node_heat_capacity;
                        Tf -= Q_coil / flow_heat_capacity;
                        cyl_energy_in += Q_coil * pw_dt;
                        cyl_throughput += Math.abs(Q_coil) * pw_dt;
                    }
                    dhw_return_temp = Tf;
                    Tret_building = Tf;
                } else {
                    Tret_building = pw.Te;
                }
                E2_step += flow_heat_capacity * (Tf2 - Tret_building) * pw_dt;

                // Heat pump internal volume node
                pw.Th += (flow_heat_capacity * (ThIn - pw.Th) + heatpump_heat) * pw_dt / pw_Ch;

                // Advect flow leg (upstream = unit outlet)
                for (let c = pw_N - 1; c > 0; c--) pw.flow[c] += pw_fF[c] * (pw.flow[c - 1] - pw.flow[c]);
                pw.flow[0] += pw_fF[0] * (pw.Th - pw.flow[0]);

                // Emitter node & radiator output (isolated during DHW reheat).
                // While circulating, the radiators emit at the mean of the
                // incoming flow (Tf2) and the well-mixed node (the return),
                // matching the mean-emitter-temperature basis of DT50 ratings.
                let Delta_T = (dhw_mode ? pw.Te : (Tf2 + pw.Te) * 0.5) - room;
                if (Delta_T < 0) Delta_T = 0;
                let Prad = hp_radiatorRatedOutput * Math.pow(Delta_T / hp_radiatorRatedDT, 1.3);
                if (dhw_mode) {
                    pw.Te -= Prad * pw_dt / pw_Ce;
                } else {
                    pw.Te += (flow_heat_capacity * (Tf2 - pw.Te) - Prad) * pw_dt / pw_Ce;
                }
                Erad_step += Prad * pw_dt;

                // Advect return leg (upstream = building return)
                for (let c = pw_N - 1; c > 0; c--) pw.ret[c] += pw_fR[c] * (pw.ret[c - 1] - pw.ret[c]);
                pw.ret[0] += pw_fR[0] * (Tret_building - pw.ret[0]);

                // Ambient losses: every pipe cell + the unit's internal volume
                for (let c = 0; c < pw_N; c++) {
                    const af = pw_amb ? pw_amb[c] : outside;
                    let q = pw_u[c] * PW_DX * pw_dt * (pw.flow[c] - af);
                    pw.flow[c] -= q / pw_cap[c]; Eloss_step += q;
                    const m = pw_N - 1 - c;
                    const ar = pw_amb ? pw_amb[m] : outside;
                    q = pw_u[m] * PW_DX * pw_dt * (pw.ret[c] - ar);
                    pw.ret[c] -= q / pw_cap[m]; Eloss_step += q;
                }
                const qh = pw_UAh * (pw.Th - pw_amb_unit) * pw_dt;
                pw.Th -= qh / pw_Ch; Eloss_step += qh;
            }
        } else {
            // Pump off: no advection — the radiators drain the emitter node
            // and the pipes + unit volume cool towards their ambients (loss
            // rates are small enough for a single 30 s step to be stable)
            let Delta_T = pw.Te - room;
            if (Delta_T < 0) Delta_T = 0;
            let Prad = hp_radiatorRatedOutput * Math.pow(Delta_T / hp_radiatorRatedDT, 1.3);
            pw.Te -= Prad * timestep / pw_Ce;
            Erad_step = Prad * timestep;

            for (let c = 0; c < pw_N; c++) {
                const af = pw_amb ? pw_amb[c] : outside;
                let q = pw_u[c] * PW_DX * timestep * (pw.flow[c] - af);
                pw.flow[c] -= q / pw_cap[c]; Eloss_step += q;
                const m = pw_N - 1 - c;
                const ar = pw_amb ? pw_amb[m] : outside;
                q = pw_u[m] * PW_DX * timestep * (pw.ret[c] - ar);
                pw.ret[c] -= q / pw_cap[m]; Eloss_step += q;
            }
            const qh = pw_UAh * (pw.Th - pw_amb_unit) * timestep;
            pw.Th -= qh / pw_Ch; Eloss_step += qh;
        }

        radiator_heat = Erad_step / timestep;
        heat_m1_kwh += E1_step / 3600000;
        heat_m2_kwh += E2_step / 3600000;
        primary_loss_kwh += Eloss_step / 3600000;

        // Flow and return temperatures at the heat pump connections (the
        // unit's own flow sensor — used by the controller and the COP model)
        flow_temperature = pw.Th;
        return_temperature = pw.ret[pw_N - 1];

        // == Hot water cylinder ==
        // Stratified multi-node model ported from cylinder/cylinder_sim.js.
        // The coil heat input is applied inside the pipework sub-step loop
        // above; draws, standing losses, conduction and buoyancy follow here.

        // 5. Hot water draws: thermostatic mixing at the tap — only the hot
        // fraction f = (Tmix - Tcold) / (Ttop - Tcold) of the mixed volume is
        // drawn from the top of the cylinder (all hot if the top can't reach
        // Tmix). Plug flow: each node's water moves up one place, cold feed
        // enters the bottom. Processed in chunks of at most one node volume so
        // large draws stay stable and see the falling top temperature.
        let draw_litres = 0;
        for (let d = 0; d < dhw_draw_events.length; d++) {
            if (hour >= dhw_draw_events[d].start_hour && hour < dhw_draw_events[d].end_hour) {
                draw_litres += dhw_draw_events[d].litres_per_step;
            }
        }
        let remaining_draw = draw_litres;
        while (remaining_draw > 0) {
            let chunk = Math.min(remaining_draw, dhw_node_volume);
            remaining_draw -= chunk;
            let Ttop = cyl_T[dhw_node_count - 1];
            let f_hot = 1;
            if (Ttop > dhw_mix_temp) {
                f_hot = (dhw_mix_temp - dhw_cold_feed) / (Ttop - dhw_cold_feed);
                if (f_hot < 0) f_hot = 0;
            }
            let hot_litres = f_hot * chunk;
            if (hot_litres <= 0) break;
            let draw_energy = hot_litres * 4187 * (Ttop - dhw_cold_feed);
            dhw_delivered_kwh += draw_energy / 3600000;
            cyl_energy_in -= draw_energy;
            cyl_throughput += Math.abs(draw_energy);
            let f = hot_litres / dhw_node_volume;
            for (let n = dhw_node_count - 1; n > 0; n--) {
                cyl_T[n] += f * (cyl_T[n - 1] - cyl_T[n]);
            }
            cyl_T[0] += f * (dhw_cold_feed - cyl_T[0]);
        }

        // 6. Cylinder standing losses to the room (credited as an internal gain below)
        let cyl_loss = 0;
        for (let n = 0; n < dhw_node_count; n++) {
            let node_loss = dhw_node_loss_UA[n] * (cyl_T[n] - room);
            cyl_T[n] -= (node_loss * timestep) / dhw_node_heat_capacity;
            cyl_loss += node_loss;
        }
        cylinder_loss_kwh += cyl_loss * power_to_kwh;
        cyl_energy_in -= cyl_loss * timestep;
        cyl_throughput += Math.abs(cyl_loss) * timestep;

        // 7. Conduction between adjacent nodes: G = k_eff * A / dz
        // (internal flux, cancels in the energy balance)
        for (let n = 0; n < dhw_node_count - 1; n++) {
            let q_cond = dhw_internode_WK * (cyl_T[n + 1] - cyl_T[n]);
            cyl_T[n + 1] -= (q_cond * timestep) / dhw_node_heat_capacity;
            cyl_T[n] += (q_cond * timestep) / dhw_node_heat_capacity;
        }

        // 8. Buoyancy: mix any inversion (lower node hotter than the one above)
        // to the mean, sweeping until the profile is stable. Equal node masses,
        // so a simple average conserves energy.
        let cyl_unstable = true;
        let cyl_passes = 0;
        while (cyl_unstable && cyl_passes < dhw_node_count * 10) {
            cyl_unstable = false;
            cyl_passes++;
            for (let n = 0; n < dhw_node_count - 1; n++) {
                if (cyl_T[n] > cyl_T[n + 1] + 1e-9) {
                    let mixT = (cyl_T[n] + cyl_T[n + 1]) * 0.5;
                    cyl_T[n] = mixT;
                    cyl_T[n + 1] = mixT;
                    cyl_unstable = true;
                }
            }
        }

        if (cyl_T[dhw_node_count - 1] < min_cyl_top) min_cyl_top = cyl_T[dhw_node_count - 1];

        // == End of hot water cylinder ==

        // Anti-windup clamp removed here (duplicate - already applied inside AUTO_ADAPT block above)

        var PracticalCOP = 0;
        if (hp_cop_model == "carnot_fixed") {
            // Simple carnot equation based heat pump model with fixed offsets
            let condenser = flow_temperature + 2;
            let evaporator = outside - 6;
            let IdealCOP = (condenser + 273) / ((condenser + 273) - (evaporator + 273));
            PracticalCOP = IdealCOP * (hp_prc_carnot / 100);
        } else if (hp_cop_model == "carnot_variable") {
            // Simple carnot equation based heat pump model with variable offsets
            let output_ratio = heatpump_heat / hp_capacity;
            let condenser = flow_temperature + (3 * output_ratio);
            let evaporator = outside - (8 * output_ratio);
            let IdealCOP = (condenser + 273) / ((condenser + 273) - (evaporator + 273));
            PracticalCOP = IdealCOP * (hp_prc_carnot / 100);
        } else if (hp_cop_model == "ecodan") {
            PracticalCOP = get_ecodan_cop(flow_temperature, outside, heatpump_heat / hp_capacity);
        } else if (hp_cop_model == "vaillant5") {
            PracticalCOP = getCOP(vaillant_data['5kW'], flow_temperature, outside, 0.001*heatpump_heat);
        } else if (hp_cop_model == "vaillant12") {
            PracticalCOP = getCOP(vaillant_data['12kW'], flow_temperature, outside, 0.001*heatpump_heat);
        }

        if (PracticalCOP > 0) {
            heatpump_elec = heatpump_heat / PracticalCOP;
        } else {
            heatpump_elec = 0;
        }

        // Add standby power and pump power (pump also draws during overrun)
        if (heatpump_elec > 0 || pump_on) {
            heatpump_elec += hp_pumps;
        }
        heatpump_elec += hp_standby;

        let solar_gains = solar * bld_solar_gains_scale * 0.9;
        solar_gains_kwh += solar_gains * power_to_kwh;
        // Limit solar gains if room temperature is above 21
        let utilised_solar_gains = solar_gains;
        if (room > overheating_temp) {
            // linearly reduce gains as room temp rises above setpoint, zero gains at 5 degrees above setpoint
            utilised_solar_gains = solar_gains * Math.max(0, 1 - ((room - overheating_temp) / 2)); 
        }
        utilised_solar_gains_kwh += utilised_solar_gains * power_to_kwh;

        let internal_gains = bld_metabolic_gains + bld_lac_gains;

        // 1. Calculate heat fluxes
        h3 = (internal_gains + radiator_heat + utilised_solar_gains + cyl_loss) - (u3 * (room - t2));
        h2 = u3 * (room - t2) - u2 * (t2 - t1);
        h1 = u2 * (t2 - t1) - u1 * (t1 - outside);
        
        // 2. Calculate change in temperature
        room += (h3 * timestep) / k3;
        t2 += (h2 * timestep) / k2;
        t1 += (h1 * timestep) / k1;

        if (room>max_room_temp){
            max_room_temp = room;
        }

        // Record degree hours above and below setpoint
        let tolerance = 0.05;
        if (room>setpoint+tolerance) {
            if (heatpump_heat>0) {
                degree_hours_above_setpoint += (room - setpoint) * timestep_hours;
            }
        } else if (room<setpoint-tolerance) {
            degree_hours_below_setpoint += (setpoint - room) * timestep_hours;
        }



        // we will add timestamps to data at the point the data is plotted
        // record here as fixed interval timeseries

        // Abort cleanly (finishing with partial results) if the simulation has gone unstable
        if (isNaN(room) || isNaN(outside) || isNaN(flow_temperature) ||
            isNaN(return_temperature) || isNaN(heatpump_elec) || isNaN(heatpump_heat) ||
            isNaN(pw.Th) || isNaN(pw.Te)) {
            console.error("Simulation aborted, NaN at step " + i);
            i = itterations;
            break;
        }

        // Store data for plotting
        roomT_data[i] = room;
        outsideT_data[i] = outside;
        flowT_data[i] = flow_temperature;
        returnT_data[i] = return_temperature
        elec_data[i] = heatpump_elec;
        heat_data[i] = heatpump_heat;
        agile_data[i] = agile_price;
        targetT_data[i] = setpoint;
        cylTopT_data[i] = cyl_T[dhw_node_count - 1];
        cylBottomT_data[i] = cyl_T[0];

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

        if (dhw_mode) {
            dhw_elec_kwh += heatpump_elec * power_to_kwh;
            dhw_heat_kwh += heatpump_heat * power_to_kwh;
        }

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

        // == Home solar and battery storage model ==

        // Solar PV electrical offset
        // 0.90 converts pv_scale in kW to 870 kWh/year generation.
        let solar_pv_watts = solar * bld_pv_scale * 0.9;
        let balance = solar_pv_watts - heatpump_elec
        if (bld_include_lac_gains_in_elec_demand) {
            balance -= bld_lac_gains;
        }

        // Simple direct charge and discharge battery storage model
        let battery_one_way_efficiency = Math.sqrt(bat_round_trip_efficiency);

        if (bat_capacity_kwh > 0) {
            if (balance > 0) {
                let charge = balance;
                if (charge > bat_max_rate_kw * 1000) {
                    charge = bat_max_rate_kw * 1000;
                }

                let charge_after_loss = charge * battery_one_way_efficiency;
                let battery_soc_inc = charge_after_loss * power_to_kwh;
                
                if (battery_soc + battery_soc_inc > bat_capacity_kwh) {
                    // Can't charge beyond capacity, so reduce charge to fit remaining capacity
                    battery_soc_inc = bat_capacity_kwh - battery_soc;
                    charge_after_loss = battery_soc_inc / power_to_kwh;
                    charge = charge_after_loss / battery_one_way_efficiency; // Adjust for efficiency losses
                }

                battery_soc += battery_soc_inc;
                balance -= charge; // Reduce balance by the amount charged to battery                
            } else {
                let discharge = -balance;
                if (discharge > bat_max_rate_kw * 1000) {
                    discharge = bat_max_rate_kw * 1000;
                }

                let discharge_before_loss = discharge / battery_one_way_efficiency;
                let battery_soc_dec = discharge_before_loss * power_to_kwh;
                
                if (battery_soc - battery_soc_dec < 0) {
                    // Can't discharge beyond empty, so reduce discharge to fit available charge
                    battery_soc_dec = battery_soc;
                    discharge_before_loss = battery_soc_dec / power_to_kwh;
                    discharge = discharge_before_loss * battery_one_way_efficiency; // Adjust for efficiency losses
                }

                battery_soc -= battery_soc_dec;
                balance += discharge; // Reduce balance by the amount discharged from battery
            }
        }
        

        let solar_offset = 0;
        let import_power = 0;
        let export_power = 0;

        if (balance >= 0) {
            export_power = balance;
            solar_offset = heatpump_elec;
            if (bld_include_lac_gains_in_elec_demand) {
                solar_offset += bld_lac_gains;
            }
        } else {
            import_power = -balance;
            solar_offset = solar_pv_watts;
        }

        // Add solar generation to timeseries for plotting
        solar_pv_data[i] = solar_pv_watts;

        // Record solar PV generation and offset for stats
        solar_pv_kwh += solar_pv_watts * power_to_kwh;
        solar_elec_kwh += solar_offset * power_to_kwh;

        // Cost calculations
        total_cost += import_power * power_to_kwh * price * 0.01;
        agile_cost += import_power * power_to_kwh * agile_price * 0.01 * 1.05;
        solar_cost += solar_offset * power_to_kwh * price * 0.01;
    }

    if (on_progress) on_progress((i * timestep) / 86400);
    if (i < itterations) {
        // Yield to the browser so the progress display can render, then continue
        setTimeout(run_chunk, 0);
        return;
    }
    sim_finish();
    }
    // == End of run_chunk / main simulation loop ==

    function sim_finish() {

    calculate_outside_design_temperatures(outsideT_histogram);

    let wa_prc_carnot = 0;
    if (kwh_elec_running>0 && kwh_carnot_elec>0) {
        wa_prc_carnot = (kwh_heat_running / kwh_elec_running) / (kwh_heat_running / kwh_carnot_elec)
    }

    // Print solar kWh console
    console.log("Solar PV kWh: " + solar_pv_kwh.toFixed(2));

    // Cylinder energy-conservation self-test: the change in stored energy must
    // equal the net external energy in (coil - draws - standing losses).
    // Conduction and buoyancy mixing are internal and must cancel.
    let cyl_E_end = 0;
    for (let n = 0; n < dhw_node_count; n++) cyl_E_end += cyl_T[n] * dhw_node_heat_capacity;
    let cyl_residual = (cyl_E_end - cyl_E_start) - cyl_energy_in;
    let cyl_rel_residual = Math.abs(cyl_residual) / (cyl_throughput + Math.abs(cyl_E_start));
    if (cyl_rel_residual > 1e-9) {
        console.warn("Cylinder energy conservation residual: " + cyl_residual.toFixed(1) +
                     " J (relative " + cyl_rel_residual.toExponential(2) + ")");
    }


    on_done({
        elec_kwh: elec_kwh,
        heat_kwh: heat_kwh,
        heat_kwh_m1: heat_m1_kwh,
        heat_kwh_m2: heat_m2_kwh,
        primary_loss_kwh: primary_loss_kwh,
        max_room_temp: max_room_temp,
        mean_room_temp: room_temp_sum / stats_count,
        total_cost: total_cost,
        agile_cost: agile_cost,
        solar_elec_kwh: solar_elec_kwh,
        solar_cost: solar_cost,
        solar_gains_kwh: solar_gains_kwh,
        utilised_solar_gains_kwh: utilised_solar_gains_kwh,
        flowT_weighted: flowT_weighted_sum / heat_kwh,
        outsideT_weighted: outsideT_weighted_sum / heat_kwh,
        flowT_minus_outsideT_weighted: flowT_minus_outsideT_weighted_sum / heat_kwh,
        wa_prc_carnot: wa_prc_carnot,
        degree_hours_above_setpoint: degree_hours_above_setpoint,
        degree_hours_below_setpoint: degree_hours_below_setpoint,
        dhw_heat_kwh: dhw_heat_kwh,
        dhw_elec_kwh: dhw_elec_kwh,
        dhw_delivered_kwh: dhw_delivered_kwh,
        cylinder_loss_kwh: cylinder_loss_kwh,
        min_cylinder_top_temp: min_cyl_top
    });
    }
    // == End of sim_finish ==

    // Start the first chunk
    run_chunk();
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
    window.targetT_data = timeseries(targetT_data);
    window.solar_pv_data = timeseries(solar_pv_data);
    window.cylTopT_data = timeseries(cylTopT_data);
    window.cylBottomT_data = timeseries(cylBottomT_data);

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
        { label: "CylBottomT", data: window.cylBottomT_data, color: "#e08080", yaxis: 2, lines: { show: true, fill: false } }
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
