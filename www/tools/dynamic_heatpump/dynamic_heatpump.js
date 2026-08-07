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

// ============================================================================
// Heat emitter sizing
//
// The emitter spec the simulator needs is a rated output at DT50, but the
// number a designer actually chooses is the design flow temperature: the flow
// temperature at which the emitters emit the design heat loss into a room at
// its design temperature. The two conversions below are the radiator equation
// (see tools/radequation) run forwards and backwards:
//
//   output = rated * ((MWT - room) / rated_DT) ^ 1.3
//
// MWT is the mean water temperature, flow - DT/2, the same basis the emitter
// node in pipework.js emits on. The design system DT is not a separate input:
// it is the drop across the emitters when the circulation carries the whole
// design heat loss at the configured flow rate.
// ============================================================================
var RADIATOR_EXPONENT = 1.3;

// Design system DT (K) from the design heat loss (W) and flow rate (L/min)
function design_system_dT(heat_loss, flow_rate) {
    var mcp = Math.max(0.1, flow_rate) / 60 * 4187; // W/K
    return heat_loss / mcp;
}

// Design flow temperature -> rated emitter output at the rated DT (W)
function rated_output_from_design_flowT(heatpump, building) {
    var dT = design_system_dT(building.heat_loss, heatpump.flow_rate);
    var rad_DT = (heatpump.design_flowT - 0.5 * dT) - heatpump.design_roomT;
    // Guard: emitters at or below room temperature emit nothing, so the
    // implied rated output would run away to infinity
    if (rad_DT < 1) rad_DT = 1;
    return building.heat_loss / Math.pow(rad_DT / heatpump.radiatorRatedDT, RADIATOR_EXPONENT);
}

// Rated emitter output (W) -> design flow temperature, the exact inverse
function design_flowT_from_rated_output(heatpump, building) {
    var dT = design_system_dT(building.heat_loss, heatpump.flow_rate);
    var rated = heatpump.radiatorRatedOutput > 0 ? heatpump.radiatorRatedOutput : 1;
    var rad_DT = heatpump.radiatorRatedDT *
        Math.pow(building.heat_loss / rated, 1 / RADIATOR_EXPONENT);
    return heatpump.design_roomT + rad_DT + 0.5 * dT;
}

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
              "else keeps its current value, open a group below to go deeper."
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
              "limit caps output during the window, an eco mode: e.g. 40% of " +
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
              "drives the compressor. Ramp rate applies in modulating modes " +
              "only. Heat emitters are sized from the design flow temperature."
    },
    pipework: {
        label: "Primary pipework",
        title: "Primary pipework",
        desc: "Pipework between the heat pump and the building entry (metering " +
              "point 2), modelled as 0.5 m finite-volume cells with transport " +
              "delay, warm-front propagation and stagnant cool-down between " +
              "cycles, the point 1 → point 2 gap is the primary pipework penalty."
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
              "air, worst in the 0–5°C high-humidity band. Capacity and COP " +
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
    },
    validator: {
        label: "Validator",
        title: "HeatpumpMonitor.org validator",
        desc: "Compare the model's annual stats against real monitored systems " +
              "on heatpumpmonitor.org: last-365-day totals, COPs and " +
              "heat-weighted averages, calculated the same way as the site " +
              "(heat metered at the heat pump connections, point 1)."
    }
};

// Rail order below the Essentials entry
var GROUP_ORDER = ["schedule", "dhw_schedule", "cylinder", "heatpump",
    "pipework", "fabric", "frost", "gains", "outside", "validator"];

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
            // Chart resolution: "power" is the 30 s timeseries, "daily" the
            // myheatpump-style daily bar chart (bargraph.js)
            chart: "power",
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
            // Emitter spec: design_flowT is the input, radiatorRatedOutput is
            // derived from it by the radiator equation on every run
            design_flowT: 50,
            design_roomT: 20,
            radiatorRatedOutput: 7400,
            radiatorRatedDT: 50,
            prc_carnot: 47,
            cop_model: "vaillant5",
            // Generic COP model: nominal (rated) capacity drives the load
            // fraction, eta_scale calibrates the fit to other units
            nominal_capacity: 5000,
            eta_scale: 1.0,
            standby: 11,
            pumps: 15,
            minimum_modulation: 30,
            ramp_rate: 1,
            // Optional cap on the unit's total electrical input
            // (compressor + pumps + standby), disabled by default
            max_elec_enabled: false,
            max_elec: 2000
        },
        // Primary pipework between the heat pump and the building entry.
        // "simple" = uniform copper pipe exposed to the live outside air
        // temperature; "segmented" = per-stage material & fixed ambient
        // (e.g. the buried MDPE example).
        primary: {
            mode: "simple",
            length: 2,          // m, one way
            pipe: "28",          // 22 | 28 | 35 mm copper
            insulation: "pp",    // key from pipework.insul_options(pipe)
            unit_volume: 1.5,    // L of water inside the heat pump itself
            pump_overrun: 5,     // minutes of circulation after the heat pump stops
            segments: [
                { name: "HP tails",   len: 0.8, type: "cu28_pp", amb: 18 },
                { name: "Buried out", len: 5.0, type: "mdpe32_75", amb: 15 },
                { name: "Buried in",  len: 3.5, type: "mdpe32_75", amb: 16 },
                { name: "To meter",   len: 0.6, type: "cu28_pp", amb: 20 }
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
        // Chart legend: one entry per series, rendered as clickable pills.
        // `show` is the default visibility; colours are shared with the plot
        // so the legend dots always match the chart. Order = legend order.
        chart_series: {
            dhw:        { label: "DHW",         color: "#8888ff", show: true },
            ch:         { label: "CH",          color: "#ffbb66", show: false },
            heat:       { label: "Heat",        color: "#edc240", show: true },
            elec:       { label: "Electric",    color: "#afd8f8", show: true },
            solar_pv:   { label: "Solar PV",    color: "#f5a623", show: true },
            flowT:      { label: "Flow T",      color: "#cb4b4b", show: true },
            returnT:    { label: "Return T",    color: "#4da74d", show: true },
            outsideT:   { label: "Outside T",   color: "#c880ff", show: true },
            roomT:      { label: "Room T",      color: "#000000", show: true },
            targetT:    { label: "Target T",    color: "#cccccc", show: false },
            cylTopT:    { label: "Cyl top",     color: "#cc0000", show: true },
            cylBottomT: { label: "Cyl bottom",  color: "#e08080", show: true },
            agile:      { label: "Agile price", color: "#a6196b", show: false },
            frost:      { label: "Frost",       color: "#00aacc", show: false }
        },
        // Show the reverse-cycle defrost draw as negative heat, as a heat
        // meter on the circuit would register it
        show_negative_heat: true,
        // Reactive mirror of the plot view window (seconds), written by
        // plot() — the `view` global is mutated outside Vue, so the chart
        // nav's enabled/disabled states track this copy instead
        chart_view: { start: 0, end: 0, max: 0 },
        // Daily bar chart: legend, mode (which energy split the bars show),
        // reactive mirror of `bar_view` and the totals across visible bars
        daily_series: {
            heat:     { label: "Heat",       color: "#edc240", show: true },
            elec:     { label: "Electric",   color: "#afd8f8", show: true },
            outsideT: { label: "Outside T",  color: "#c880ff", show: true },
            cop:      { label: "COP",        color: "#44b3e2", show: true }
        },
        bargraph_mode: "combined",
        bargraph_modes: [
            { id: "combined", label: "All",   title: "Space heating and hot water combined" },
            { id: "space",    label: "Space", title: "Space heating only" },
            { id: "water",    label: "Water", title: "Hot water only" }
        ],
        bar_view: { start: 0, end: 0, max: 0 },
        daily_stats: { heat_kwh: 0, elec_kwh: 0, cop: 0, days: 0 },
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
            // Energy & COP over the visible chart window (set by plot())
            window_heat_kwh: 0,
            window_elec_kwh: 0,
            window_cop: 0,
            degree_hours_above_setpoint: 0,
            degree_hours_below_setpoint: 0

        },
        // HeatpumpMonitor.org validator: public system list merged with the
        // last-365-day stats by system id, plus the search/selection state
        validator: {
            loading: false,
            loaded: false,
            error: "",
            query: "",
            candidate: null,
            systems: []
        },
        // HeatpumpMonitor.org-style stats from the last completed run and the
        // day count it covered (comparable when it was a full year)
        hpm_model: null,
        hpm_model_days: 0,
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
        // --- Heat emitter sizing ----------------------------------------
        // Live readouts of the emitter spec implied by the design flow
        // temperature, so the panel updates as the design inputs are edited.
        // simulate() writes the same rated output into heatpump before a run
        design_system_dT: function () {
            return design_system_dT(this.building.heat_loss, this.heatpump.flow_rate);
        },
        emitter_rated_output: function () {
            return rated_output_from_design_flowT(this.heatpump, this.building);
        },

        // --- Primary pipework insulation --------------------------------
        // U' depends on the pipe diameter as well as the lagging thickness,
        // so the options are rebuilt whenever the pipe size changes. The unit
        // is spelled out as "W/K per m of pipe" because U' and the foam's own
        // conductivity both come out as W/m.K and are easily confused — see
        // the derivation in model/pipework.js
        insul_options: function () {
            return pipework.insul_options(this.primary.pipe).map(function (o) {
                return {
                    value: o.key,
                    label: o.label + " — " + o.u.toFixed(3) + " W/K per m of pipe"
                };
            });
        },

        // --- Chart navigation state -------------------------------------
        // The nav drives whichever chart is showing, so its state reads from
        // that chart's window: the 30 s power view or the daily bar chart
        nav_view: function () {
            return this.ui.chart == "daily" ? this.bar_view : this.chart_view;
        },
        // Tightest window the nav will zoom to: one hour of power, one day of bars
        nav_min_span: function () {
            return this.ui.chart == "daily" ? 86400 : 3600;
        },
        // Each control greys out at the limit it would hit, so the nav shows
        // how much room is left to zoom or pan
        can_pan_left: function () {
            return this.nav_view.start > 0;
        },
        can_pan_right: function () {
            return this.nav_view.end < this.nav_view.max;
        },
        can_zoom_out: function () {
            return (this.nav_view.end - this.nav_view.start) < this.nav_view.max;
        },
        can_zoom_in: function () {
            return (this.nav_view.end - this.nav_view.start) > this.nav_min_span;
        },
        can_reset: function () {
            return this.can_pan_left || this.can_pan_right;
        },
        // Visible span, e.g. "12 hours" / "1.5 days" — reads as the zoom level
        view_range_label: function () {
            var seconds = this.nav_view.end - this.nav_view.start;
            if (!(seconds > 0)) return "";
            var value, unit;
            if (seconds >= 86400) {
                value = seconds / 86400;
                unit = "day";
            } else {
                value = seconds / 3600;
                unit = "hour";
            }
            var rounded = Math.round(value * 10) / 10;
            return (Number.isInteger(rounded) ? rounded : rounded.toFixed(1)) +
                " " + unit + (rounded == 1 ? "" : "s");
        },
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
        },

        // --- HeatpumpMonitor.org validator ------------------------------
        // Systems matching all whitespace-separated search terms. A term of
        // the form "<number>kw" (e.g. "5kw", "8.5kw") is an exact capacity
        // (hp_output) filter; every other term is a substring match across
        // system id, location, manufacturer, model and kW (same behaviour as
        // heatpumpmonitor.org's emitter tool). Empty search = full list.
        validator_filtered: function () {
            var q = (this.validator.query || "").trim().toLowerCase();
            var list = this.validator.systems;
            if (!q) return list;
            var terms = q.split(/\s+/);
            return list.filter(function (s) {
                var hay = (s.id + " " + s.location + " " + s.hp_manufacturer + " " +
                    s.hp_model + " " + s.hp_output + " kw").toLowerCase();
                var cap = parseFloat(s.hp_output);
                return terms.every(function (t) {
                    var m = t.match(/^(\d+(?:\.\d+)?)kw$/);
                    if (m) return cap === parseFloat(m[1]);
                    return hay.indexOf(t) !== -1;
                });
            });
        },
        validator_selected: function () {
            var id = this.validator.candidate;
            if (id === null) return null;
            var list = this.validator.systems;
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) return list[i];
            }
            return null;
        },
        // Days of data behind the selected system's stats; scaling to 365 is
        // shown when the record is meaningfully short of a full year
        validator_sys_days: function () {
            var sys = this.validator_selected;
            if (!sys) return 0;
            return sys.stats.combined_data_length / 86400;
        },
        validator_scale: function () {
            var days = this.validator_sys_days;
            return (days > 0 && days < 364.5) ? 365 / days : null;
        },
        // True when the model column holds stats from a full-year run
        validator_model_ready: function () {
            return this.hpm_model !== null && this.hpm_model_days >= 365;
        },
        // Comparison table: one row per annual stat, system value alongside
        // the optional linear ×365 scaling and the model's value. The delta
        // is model − system, against the scaled value when shown (the model
        // always covers a full year).
        validator_rows: function () {
            var sys = this.validator_selected;
            if (!sys) return [];
            var s = sys.stats;
            var m = this.validator_model_ready ? this.hpm_model : null;
            var mm = m || {};
            var scale = this.validator_scale;

            function valid(v) {
                return v !== null && v !== undefined && !isNaN(v);
            }
            function num(v, dp) {
                return valid(v) ? (+v).toFixed(dp) : "—";
            }
            // scaled_v === undefined -> stat is not scaled (blank cell)
            function row(label, unit, dp, sys_v, model_v, scaled_v) {
                var ref = valid(scaled_v) ? scaled_v : sys_v;
                var delta = "";
                if (m && valid(ref) && valid(model_v)) {
                    var d = model_v - ref;
                    delta = (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(dp);
                    if (unit == "kWh" && Math.abs(ref) > 1) {
                        delta += " (" + (d >= 0 ? "+" : "−") +
                            Math.abs(100 * d / ref).toFixed(1) + "%)";
                    }
                }
                return {
                    label: label, unit: unit,
                    sys: num(sys_v, dp),
                    scaled: scaled_v === undefined ? "" : num(scaled_v, dp),
                    model: m ? num(model_v, dp) : "—",
                    delta: delta
                };
            }
            function head(label) {
                return { head: label };
            }

            var sys_dhw_prc = (valid(s.water_heat_kwh) && s.combined_heat_kwh > 0)
                ? 100 * s.water_heat_kwh / s.combined_heat_kwh : null;
            var model_dhw_prc = (m && mm.combined_heat_kwh > 0)
                ? 100 * mm.water_heat_kwh / mm.combined_heat_kwh : null;

            return [
                head("Annual totals"),
                row("COP", "", 2, s.combined_cop, mm.combined_cop,
                    scale ? s.combined_cop : undefined),
                row("Electric", "kWh", 0, s.combined_elec_kwh, mm.combined_elec_kwh,
                    scale ? s.combined_elec_kwh * scale : undefined),
                row("Heat", "kWh", 0, s.combined_heat_kwh, mm.combined_heat_kwh,
                    scale ? s.combined_heat_kwh * scale : undefined),
                row("Cooling / defrost", "kWh", 0, s.combined_cooling_kwh, mm.combined_cooling_kwh,
                    scale ? s.combined_cooling_kwh * scale : undefined),
                row("Data length", "days", 1, this.validator_sys_days,
                    m ? mm.combined_data_length / 86400 : null),
                row("Mean room temp", "°C", 2, s.combined_roomT_mean, mm.combined_roomT_mean),
                row("Mean outside temp", "°C", 2, s.combined_outsideT_mean, mm.combined_outsideT_mean),
                head("Space heating"),
                row("Electric", "kWh", 0, s.space_elec_kwh, mm.space_elec_kwh),
                row("Heat", "kWh", 0, s.space_heat_kwh, mm.space_heat_kwh),
                row("COP", "", 2, s.space_cop, mm.space_cop),
                head("Hot water"),
                row("Electric", "kWh", 0, s.water_elec_kwh, mm.water_elec_kwh),
                row("Heat", "kWh", 0, s.water_heat_kwh, mm.water_heat_kwh),
                row("COP", "", 2, s.water_cop, mm.water_cop),
                row("DHW share of heat", "%", 1, sys_dhw_prc, model_dhw_prc),
                head("Heat-weighted averages"),
                row("Flow temp", "°C", 2, s.weighted_flowT, mm.weighted_flowT),
                row("Outside temp", "°C", 2, s.weighted_outsideT, mm.weighted_outsideT),
                row("Flow − outside", "K", 2, s.weighted_flowT_minus_outsideT, mm.weighted_flowT_minus_outsideT),
                row("Flow − return", "K", 2, s.weighted_flowT_minus_returnT, mm.weighted_flowT_minus_returnT),
                row("Electric power", "W", 0, s.weighted_elec, mm.weighted_elec),
                row("Heat power", "W", 0, s.weighted_heat, mm.weighted_heat),
                row("% of Carnot", "%", 1, s.weighted_prc_carnot, mm.weighted_prc_carnot)
            ];
        }
    },
    methods: {
        select_group: function (id) {
            this.ui.group = id;
            if (id == "validator" && !this.validator.loaded && !this.validator.loading) {
                this.validator_load();
            }
        },

        // --- HeatpumpMonitor.org validator ------------------------------
        // Fetch the public system list and last-365-day stats (via the
        // hpmon.php proxy, heatpumpmonitor.org sends no CORS headers) and
        // merge them by system id; systems without stats are dropped
        validator_load: function () {
            var v = this.validator;
            v.loading = true;
            v.error = "";
            Promise.all([
                fetch('hpmon.php?action=list').then(function (r) { return r.json(); }),
                fetch('hpmon.php?action=stats365').then(function (r) { return r.json(); })
            ]).then(function (results) {
                var list = results[0];
                var stats = results[1];
                var systems = [];
                list.forEach(function (s) {
                    var st = stats[s.id];
                    if (st && st.combined_data_length > 0) {
                        s.stats = st;
                        systems.push(s);
                    }
                });
                systems.sort(function (a, b) {
                    if (a.location < b.location) return -1;
                    if (a.location > b.location) return 1;
                    return 0;
                });
                v.systems = systems;
                v.loaded = true;
                v.loading = false;
                if (systems.length && v.candidate === null) {
                    v.candidate = systems[0].id;
                }
            }).catch(function (e) {
                v.loading = false;
                v.error = "Failed to load systems from heatpumpmonitor.org: " + e.message;
            });
        },
        validator_label: function (s) {
            return s.location + ", " + s.hp_manufacturer + " " + s.hp_model + ", " + s.hp_output + " kW";
        },
        // Step through the systems matching the current search
        validator_step: function (direction) {
            var list = this.validator_filtered;
            if (!list.length) return;
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === this.validator.candidate) { idx = i; break; }
            }
            idx = (idx === -1) ? (direction > 0 ? 0 : list.length - 1) : idx + direction;
            if (idx < 0) idx = 0;
            if (idx >= list.length) idx = list.length - 1;
            this.validator.candidate = list[idx].id;
        },
        select_view: function (id) {
            this.ui.view = id;
            // The chart needs a redraw once its container is visible again
            if (id == "chart") {
                this.$nextTick(function () { chart_redraw(); });
            }
        },
        // Switch between the 30 s power view and the daily bar chart. Each
        // keeps its own window, so switching back lands where you left off
        select_chart: function (id) {
            this.ui.chart = id;
            this.$nextTick(function () { chart_redraw(); });
        },
        // Daily bars: which energy split to show (all / space / water)
        select_bargraph_mode: function (id) {
            this.bargraph_mode = id;
            bargraph_draw();
        },
        // Click-through from a daily bar: open that day in the power view
        show_day: function (index) {
            view.start = index * 86400;
            view.end = view.start + 86400;
            view_calc_interval();
            this.ui.chart = "power";
            this.$nextTick(function () { plot(); });
        },
        // Redraw the chart without re-running the model (series display flags)
        replot: function () {
            plot();
        },
        // Legend pill click: flip a series on/off and redraw
        toggle_series: function (key) {
            this.chart_series[key].show = !this.chart_series[key].show;
            plot();
        },
        toggle_daily_series: function (key) {
            this.daily_series[key].show = !this.daily_series[key].show;
            bargraph_draw();
        },
        change_mode: function () {

            if (this.mode == "day") {
                this.days = 1;
            } else {
                this.days = 365;
            }

            // Cylinder temperatures clutter the annual chart; show them by
            // default in day view only (the checkboxes still override)
            this.chart_series.cylTopT.show = this.mode == "day";
            this.chart_series.cylBottomT.show = this.mode == "day";

            // A single day has nothing to show as daily bars
            if (this.days <= 1) this.ui.chart = "power";

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
                    app.heatpump.nominal_capacity = 5000;
                } else if (app.heatpump.cop_model == "vaillant12") {
                    // top end max capacity 12kW model
                    app.heatpump.capacity = 17900;
                    // modulation to 20
                    app.heatpump.minimum_modulation = 30;
                    app.heatpump.nominal_capacity = 12000;
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

                // Size the emitters from the design flow temperature (after
                // the flow rate clamp, which sets the design system DT)
                app.heatpump.radiatorRatedOutput =
                    Math.round(rated_output_from_design_flowT(app.heatpump, app.building));

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
                // HeatpumpMonitor.org-style stats for the validator; the day
                // count marks whether they cover a comparable full year
                app.hpm_model = result.hpm_stats || null;
                app.hpm_model_days = app.days;

                // Keep the plotting series from the main run
                sim_series = result.series;

                // Roll the 30 s series up into the per-day totals behind the
                // daily bar chart
                bargraph_build();

                // Set view if not already set
                if (view.start == 0 && view.end == 0) {
                    view.start = 0;

                    var timestep = 30;
                    var itterations = 3600 * 24 * app.days / timestep;

                    view.end = itterations * timestep;
                    view_calc_interval();
                }

                chart_redraw();

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
                len: 2, type: "cu28_pp", amb: 10
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
                { name: "HP tails",   len: 0.8, type: "cu28_pp", amb: 18 },
                { name: "Buried out", len: 5.0, type: "mdpe32_75", amb: 15 },
                { name: "Buried in",  len: 3.5, type: "mdpe32_75", amb: 16 },
                { name: "To meter",   len: 0.6, type: "cu28_pp", amb: 20 }
            ];
            this.simulate();
        },

        // Pan / zoom / reset act on whichever chart is showing; view_nav()
        // (plot.js) does the arithmetic and clamping for both windows
        chart_nav: function (action) {
            if (this.ui.chart == "daily") {
                view_nav(bar_view, bar_view.max, DAY_SECONDS, action);
                // Bars only make sense on whole-day boundaries
                bar_view.start = Math.floor(bar_view.start / DAY_SECONDS) * DAY_SECONDS;
                bar_view.end = Math.ceil(bar_view.end / DAY_SECONDS) * DAY_SECONDS;
                if (bar_view.start < 0) bar_view.start = 0;
                if (bar_view.end > bar_view.max) bar_view.end = bar_view.max;
                bargraph_draw();
            } else {
                view_nav(view, this.days * 24 * 3600, 3600, action);
                view_calc_interval();
                plot();
            }
        },
        zoom_out: function () { this.chart_nav("zoom_out"); },
        zoom_in: function () { this.chart_nav("zoom_in"); },
        pan_left: function () { this.chart_nav("pan_left"); },
        pan_right: function () { this.chart_nav("pan_right"); },
        reset: function () { this.chart_nav("reset"); },

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
                // Configs exported before the design flow temperature input
                // carry the emitter spec as a rated output only: run the
                // radiator equation backwards so the import is preserved
                var legacy_emitter = config.heatpump.design_flowT === undefined &&
                    config.heatpump.radiatorRatedOutput !== undefined;
                Object.assign(this.heatpump, config.heatpump);
                if (legacy_emitter) {
                    this.heatpump.design_flowT = Math.round(
                        design_flowT_from_rated_output(this.heatpump, this.building) * 10) / 10;
                }
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
