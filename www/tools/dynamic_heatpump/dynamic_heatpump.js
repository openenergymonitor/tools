var AUTO_ADAPT = 0;
var WEATHER_COMP_CURVE = 1;
var CASCADE_PI = 2;
var FIXED_SPEED = 3;

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

// Primary pipework physics live in model/pipework.js (loaded before this file)

// Per-timestep simulation series from the last main run (result.series from
// model/simulator.js); plot.js reads this. The plot view state and flot glue
// live in plot.js.
var sim_series = null;

// Annual driving dataset (filled by parse_csv)
var annual_dataset_outsideT = [];
var annual_dataset_solar = [];
var annual_dataset_agile = [];
var annual_dataset_humidity = [];
var annual_dataset_loaded = false;

// ============================================================================
// UI metadata: parameter groups shown in the rail and parameter panel
// ============================================================================
var GROUP_INFO = {
    essentials: {
        label: "Essentials",
        title: "Essentials",
        desc: "The handful of numbers that change between most runs. Everything " +
              "else keeps its current value — open a group below to go deeper."
    },
    schedule: {
        label: "Room schedule",
        title: "Room thermostat schedule",
        desc: "Set point and unit price by time of day. Rows add and remove " +
              "inline; the target temperature can be overlaid on the chart."
    },
    dhw_schedule: {
        label: "DHW schedule",
        title: "DHW schedule",
        desc: "Hot water reheat windows. During a window the heat pump reheats " +
              "the cylinder to the set point (with hysteresis) if needed, taking " +
              "priority over space heating via a diverter valve. The modulation " +
              "limit caps output during the window — an eco mode: e.g. 40% of " +
              "capacity reheats more slowly at a lower flow temperature and " +
              "better COP."
    },
    cylinder: {
        label: "Hot water cylinder",
        title: "Hot water cylinder",
        desc: "Stratified multi-node cylinder heated by a heat pump coil in the " +
              "bottom of the tank. Draws are mixed down to the delivery " +
              "temperature at the tap, so only the hot fraction is drawn from " +
              "the cylinder."
    },
    heatpump: {
        label: "Heat pump & control",
        title: "Heat pump & control",
        desc: "Capacity, modulation limits, COP model and the control mode that " +
              "drives the compressor. Ramp rate applies in modulating modes only."
    },
    pipework: {
        label: "Primary pipework",
        title: "Primary pipework",
        desc: "Pipework between the heat pump and the building entry (metering " +
              "point 2), modelled as 0.5 m finite-volume cells with transport " +
              "delay, warm-front propagation and stagnant cool-down between " +
              "cycles — the point 1 → point 2 gap is the primary pipework penalty."
    },
    fabric: {
        label: "Building fabric",
        title: "Building fabric",
        desc: "Heat loss split across three thermal mass layers (layer 1 " +
              "external, layer 3 internal). The heat loss coefficient is " +
              "derived from the heat loss at design conditions."
    },
    frost: {
        label: "Frost & defrost",
        title: "Evaporator frosting & defrost",
        desc: "Frost builds on the outdoor coil when it runs below 0°C in moist " +
              "air — worst in the 0–5°C high-humidity band. Capacity and COP " +
              "fall linearly as frost builds; at the trigger threshold the unit " +
              "runs a reverse-cycle defrost, plus a fixed per-cycle overhead. " +
              "See frost-literature.md for the published model basis."
    },
    gains: {
        label: "Gains, solar & PV",
        title: "Internal gains, solar & PV",
        desc: "Body heat, appliance electricity and solar gains offset the heat " +
              "demand; PV output and battery storage offset heat pump " +
              "consumption in annual mode."
    },
    outside: {
        label: "Outside temperature",
        title: "Outside temperature",
        desc: "The outside temperature driving the simulation: a sinusoidal day " +
              "in single day mode, the Llanberis 2024 dataset in full year mode."
    }
};

// Rail order below the Essentials entry
var GROUP_ORDER = ["schedule", "dhw_schedule", "cylinder", "heatpump",
    "pipework", "fabric", "frost", "gains", "outside"];

// ============================================================================
// param-field: labelled numeric input with -/+ stepper buttons and a unit,
// used for most single-value parameters in the panel. Supports v-model and
// emits 'change' after each committed edit (typed or stepped).
// ============================================================================
Vue.component('param-field', {
    props: {
        label: { type: String, required: true },
        unit: { type: String, default: "" },
        value: { type: [Number, String], default: 0 },
        step: { type: Number, default: 1 },
        min: { type: Number, default: null },
        max: { type: Number, default: null },
        disabled: { type: Boolean, default: false }
    },
    methods: {
        clamp: function (v) {
            if (this.min !== null && v < this.min) v = this.min;
            if (this.max !== null && v > this.max) v = this.max;
            return v;
        },
        nudge: function (direction) {
            if (this.disabled) return;
            var v = parseFloat(this.value);
            if (isNaN(v)) v = 0;
            // Round to the step's decimal places to avoid float noise
            var dp = (String(this.step).split(".")[1] || "").length;
            v = this.clamp(parseFloat((v + direction * this.step).toFixed(dp)));
            this.$emit('input', v);
            this.$emit('change');
        },
        on_change: function (event) {
            var v = parseFloat(event.target.value);
            if (isNaN(v)) {
                event.target.value = this.value;
                return;
            }
            v = this.clamp(v);
            event.target.value = v;
            this.$emit('input', v);
            this.$emit('change');
        }
    },
    template:
        '<div class="hp-field">' +
            '<label class="hp-field-label">{{ label }}</label>' +
            '<div class="hp-stepper" :class="{disabled: disabled}">' +
                '<button type="button" tabindex="-1" :disabled="disabled" @click="nudge(-1)">&minus;</button>' +
                '<input type="text" :value="value" :disabled="disabled" @change="on_change">' +
                '<span class="hp-unit" v-if="unit" v-html="unit"></span>' +
                '<button type="button" tabindex="-1" :disabled="disabled" @click="nudge(1)">+</button>' +
            '</div>' +
        '</div>'
});

var app = new Vue({
    el: '#app',
    data: {
        simulation_index: 0,
        mode: "day",
        // These are days not included in results, to allow system to stabilise
        days_pre_sim: 5,
        // These are days to simulate and include in results
        days: 1,
        // UI state: selected parameter group, results view and whether the
        // group rail is shown beside the fields on narrow screens
        ui: {
            group: "essentials",
            view: "chart",
            rail_open: true
        },
        group_info: GROUP_INFO,
        group_list: GROUP_ORDER.map(function (id) {
            return { id: id, label: GROUP_INFO[id].label };
        }),
        // Number of input changes made since the last run (annual mode only:
        // single day runs happen automatically on change)
        pending_changes: 0,
        // JSON snapshot of the config used for the last run, for Revert
        last_run_config: null,
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
            length: 2,          // m, one way
            pipe: "28",          // 22 | 28 | 35 mm copper
            insulation: "25",    // bare | 13 | 19 | 25 mm nitrile
            unit_volume: 1.5,    // L of water inside the heat pump itself
            pump_overrun: 5,     // minutes of circulation after the heat pump stops
            segments: [
                { name: "HP tails",   len: 0.8, type: "cu28_pp19", amb: 18 },
                { name: "Buried out", len: 5.0, type: "mdpe32_75", amb: 15 },
                { name: "Buried in",  len: 3.5, type: "mdpe32_75", amb: 16 },
                { name: "To meter",   len: 0.6, type: "cu28_pp19", amb: 20 }
            ]
        },
        pw_segtypes: pipework.SEGTYPES,
        control: {
            mode: AUTO_ADAPT,
            wc_use_outside_mean: 1,

            Kp: 2000,
            Ki: 0.06,

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
        show_frost: false,
        show_agile: false,
        // Evaporator frosting & reverse-cycle defrost (model/frost.js);
        // defaults anchored to the literature review in frost-literature.md
        frost: {
            enabled: true,
            humidity: 80,          // %RH used when no CSV humidity
            use_csv_humidity: true,
            airflow: 3500,         // m3/h evaporator fan
            capture_eff: 0.45,     // composite deposition effectiveness
            coil_dt: 5,            // K below outside air (measured 4-5 K)
            threshold: 2.0,        // kg frost triggering a defrost
            defrost_power: 4000,   // W drawn from the heating circuit
            defrost_elec: 1000,    // W compressor draw during defrost
            melt_eff: 0.6,         // fraction of the draw that melts frost
            overhead_kj: 300,      // kJ per-cycle overhead (reversal + coil metal)
            derate_max: 20         // % capacity/COP loss at the trigger point
        },
        dhw_schedule: [
            { start: "04:00", set_point: 45, duration: 10800, modulation: 50 },
            { start: "13:00", set_point: 45, duration: 7200, modulation: 50 },
        ],
        dhw: {
            cylinder_volume: 150,     // Litres
            cylinder_height: 1.5,    // m, diameter derived from volume & height
            node_count: 8,           // Stratification nodes (2-40)
            coil_volume: 60,          // Litres, coil occupies the bottom this-many litres
            coil_UA: 1000,            // W/K, total coil heat-transfer coefficient x area
            cold_feed_temp: 10,       // °C
            mixed_draw_temp: 40,      // °C, thermostatic mixed delivery temperature at the tap
            reheat_hysteresis: 5,     // K below set_point before reheat starts
            stat_height: 0.75,        // Thermostat height, fraction from bottom
            daily_volume: 200,        // Litres of mixed hot water drawn per day
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
            defrost_heat_kwh: 0,
            defrost_elec_kwh: 0,
            defrost_cycles: 0,
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
    computed: {
        // Headline result cards, with deltas against the saved baseline.
        // `short` labels the narrow-screen KPI strip, which shows the first
        // four entries; the full cards use `label`.
        kpis: function () {
            var r = this.results;
            var b = this.baseline;
            var has_baseline = this.baseline_enabled;
            var dp = this.mode == "day" ? 1 : 0;

            function signed(v, dpx, unit, prefix) {
                var sign = v >= 0 ? "+" : "−";
                return sign + (prefix || "") + Math.abs(v).toFixed(dpx) + (unit || "");
            }
            // direction: +1 higher is better, -1 lower is better, 0 neutral
            function cls(v, direction) {
                if (!direction || v == 0) return "neutral";
                return (v * direction > 0) ? "good" : "bad";
            }

            var cop = r.elec_kwh > 0 ? r.heat_kwh_m2 / r.elec_kwh : 0;
            var cop_b = b.elec_kwh > 0 ? b.heat_kwh_m2 / b.elec_kwh : 0;

            var list = [
                {
                    label: "COP @ building entry",
                    short: "COP",
                    value: cop.toFixed(2),
                    delta: has_baseline ? signed(cop - cop_b, 2) : "",
                    cls: cls(cop - cop_b, 1)
                },
                {
                    label: "Electric input",
                    short: "Electric",
                    value: r.elec_kwh.toFixed(dp) + " kWh",
                    delta: has_baseline && b.elec_kwh > 0
                        ? signed(100 * (r.elec_kwh - b.elec_kwh) / b.elec_kwh, 1, "%") : "",
                    cls: cls(r.elec_kwh - b.elec_kwh, -1)
                },
                {
                    label: "Heat delivered @ M2",
                    short: "Heat",
                    value: r.heat_kwh_m2.toFixed(dp) + " kWh",
                    delta: has_baseline && b.heat_kwh_m2 > 0
                        ? signed(100 * (r.heat_kwh_m2 - b.heat_kwh_m2) / b.heat_kwh_m2, 1, "%") : "",
                    cls: "neutral"
                },
                {
                    label: "Cost",
                    short: "Cost",
                    value: "£" + r.total_cost.toFixed(2),
                    delta: has_baseline ? signed(r.total_cost - b.total_cost, 2, "", "£") : "",
                    cls: cls(r.total_cost - b.total_cost, -1)
                }
            ];
            if (this.mode == "year") {
                list.push({
                    label: "Cost (Agile 2024)",
                    short: "Agile",
                    value: "£" + r.agile_cost.toFixed(2),
                    delta: has_baseline ? signed(r.agile_cost - b.agile_cost, 2, "", "£") : "",
                    cls: cls(r.agile_cost - b.agile_cost, -1)
                });
            }
            list.push({
                label: "Mean room temp",
                short: "Room",
                value: r.mean_room_temp.toFixed(2) + " °C",
                delta: has_baseline ? signed(r.mean_room_temp - b.mean_room_temp, 2, " °C") : "",
                cls: "neutral"
            });
            return list;
        }
    },
    methods: {
        select_group: function (id) {
            this.ui.group = id;
        },
        select_view: function (id) {
            this.ui.view = id;
            // The chart needs a redraw once its container is visible again
            if (id == "chart") {
                this.$nextTick(function () { plot(); });
            }
        },
        // Redraw the chart without re-running the model (series display flags)
        replot: function () {
            plot();
        },
        change_mode: function () {

            if (this.mode == "day") {
                this.days = 1;
            } else {
                this.days = 365;
            }

            // Cylinder temperatures clutter the annual chart; show them by
            // default in day view only (the checkboxes still override)
            this.show_cyl_topT = this.mode == "day";
            this.show_cyl_bottomT = this.mode == "day";

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
            annual_dataset_humidity = []; // used for the frost model

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
                    annual_dataset_humidity.push(humidity*1);
                }
            }

            if (annual_dataset_outsideT.length > 0) {
                annual_dataset_loaded = true;
                console.log(`Loaded ${annual_dataset_outsideT.length} half hourly temperature readings`);
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
                this.pending_changes++;
                return;
            }
            this.run_model();
        },
        run_model: function () {
            if (this.progress.running) return;
            this.needs_run = false;
            this.pending_changes = 0;
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

                // Input clamps, written back so the UI reflects them
                if (app.control.fixed_compressor_speed > 100) app.control.fixed_compressor_speed = 100;
                if (app.control.fixed_compressor_speed < app.heatpump.minimum_modulation) app.control.fixed_compressor_speed = app.heatpump.minimum_modulation;
                if (!(app.heatpump.flow_rate >= 1)) app.heatpump.flow_rate = 1;
                if (app.heatpump.flow_rate > 40) app.heatpump.flow_rate = 40;
                let node_count = Math.round(app.dhw.node_count);
                if (node_count < 2) node_count = 2;
                if (node_count > 40) node_count = 40;
                app.dhw.node_count = node_count;

                // Snapshot the config actually used for this run, for Revert
                app.last_run_config = JSON.stringify(app.get_config());

                // Simulator config: the app's data objects by reference (the
                // same shape export_config produces), plus the waveform times
                var config = {
                    building: app.building,
                    external: app.external,
                    heatpump: app.heatpump,
                    primary: app.primary,
                    control: app.control,
                    schedule: app.schedule,
                    dhw: app.dhw,
                    dhw_schedule: app.dhw_schedule,
                    dhw_draw_profile: dhw_draw_profile,
                    battery: app.battery,
                    frost: app.frost,
                    outside_min_time: outside_min_time,
                    outside_max_time: outside_max_time
                };
                var dataset = {
                    loaded: annual_dataset_loaded,
                    outsideT: annual_dataset_outsideT,
                    solar: annual_dataset_solar,
                    agile: annual_dataset_agile,
                    humidity: annual_dataset_humidity
                };

                // Main run, started after the pre-sim completes
                var run_main = function () {
                    app.simulation_index++;
                    var sim_start = performance.now();
                    simulator.run(config, {
                        days: app.days,
                        state: sim_state,
                        dataset: dataset,
                        on_done: function (result) {
                            app.results.sim_time_ms = performance.now() - sim_start;
                            apply_results(result);
                        },
                        on_progress: function (days_done) {
                            app.progress.day = app.days_pre_sim + Math.floor(days_done);
                        }
                    });
                };

                // Pre-simulation days to stabilise system (warm start via the
                // shared sim_state)
                if (this.days_pre_sim > 0) {
                    simulator.run(config, {
                        days: app.days_pre_sim,
                        state: sim_state,
                        dataset: dataset,
                        on_done: run_main,
                        on_progress: function (days_done) {
                            app.progress.day = Math.floor(days_done);
                        }
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
                app.results.defrost_heat_kwh = result.defrost_heat_kwh;
                app.results.defrost_elec_kwh = result.defrost_elec_kwh;
                app.results.defrost_cycles = result.defrost_cycles;
                app.stats.flowT_weighted = result.flowT_weighted;
                app.stats.outsideT_weighted = result.outsideT_weighted;
                app.stats.flowT_minus_outsideT_weighted = result.flowT_minus_outsideT_weighted;
                app.stats.wa_prc_carnot = result.wa_prc_carnot;
                app.stats.degree_hours_above_setpoint = result.degree_hours_above_setpoint;
                app.stats.degree_hours_below_setpoint = result.degree_hours_below_setpoint;
                app.outsideT_996 = result.outsideT_996;
                app.outsideT_990 = result.outsideT_990;

                // Keep the plotting series from the main run
                sim_series = result.series;

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

        // Deep copy of every user-settable parameter, shared by export,
        // the last-run snapshot (Revert) and import validation
        get_config: function () {
            return {
                days: this.days,
                building: JSON.parse(JSON.stringify(this.building)),
                external: JSON.parse(JSON.stringify(this.external)),
                heatpump: JSON.parse(JSON.stringify(this.heatpump)),
                primary: JSON.parse(JSON.stringify(this.primary)),
                control: JSON.parse(JSON.stringify(this.control)),
                schedule: JSON.parse(JSON.stringify(this.schedule)),
                dhw: JSON.parse(JSON.stringify(this.dhw)),
                dhw_schedule: JSON.parse(JSON.stringify(this.dhw_schedule)),
                battery: JSON.parse(JSON.stringify(this.battery)),
                frost: JSON.parse(JSON.stringify(this.frost))
            };
        },
        // Apply a config object (imported or reverted) onto the app state
        apply_config: function (config) {
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
                // Older exports carry select values as strings; the new UI
                // binds numeric option values
                this.control.mode = Number(this.control.mode);
                this.control.wc_use_outside_mean = Number(this.control.wc_use_outside_mean);
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
            if (config.battery) {
                Object.assign(this.battery, config.battery);
            }
            if (config.frost) {
                // Old configs without a frost section keep the defaults
                Object.assign(this.frost, config.frost);
            }

            // Update fabric starting temperatures
            update_fabric_starting_temperatures();
        },
        // Restore the configuration used for the last completed run
        revert: function () {
            if (!this.last_run_config) return;
            this.apply_config(JSON.parse(this.last_run_config));
            this.needs_run = false;
            this.pending_changes = 0;
        },

        export_config: function () {
            // Convert to JSON string with nice formatting
            var jsonString = JSON.stringify(this.get_config(), null, 2);

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
                        this.apply_config(config);

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


// Warm-start simulation state, persisting across the pre-sim warmup run and
// the real run (and between runs, so repeated simulations start from a
// settled system). Owned here, passed into simulator.run(); each piece is
// (re)initialised by the simulator when its configuration changes:
//  - control: the controller's PI integrators
//  - fabric:  building fabric temperatures {room, t1, t2}
//  - pw:      primary pipework {sig, flow[], ret[], Th, Te}
//  - cyl_T:   hot water cylinder node temperatures (0 = bottom)
//  - frost:   evaporator frost mass & defrost state
var sim_state = { control: null, fabric: null, pw: null, cyl_T: null, frost: null };
app.state = sim_state;
update_fabric_starting_temperatures();

app.simulate();

app.baseline = JSON.parse(JSON.stringify(app.results));
app.baseline_enabled = false;

function update_fabric_starting_temperatures() {
    sim_state.fabric = building.init_state(app.building.fabric);
}
