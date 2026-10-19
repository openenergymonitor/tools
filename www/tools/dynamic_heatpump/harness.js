// ============================================================================
// Headless Node harness for dynamic_heatpump.js
// ----------------------------------------------------------------------------
// Runs the browser-coupled simulator (Vue 2 + jQuery/flot) in Node by stubbing
// the browser globals, so simulation physics can be tested and compared from
// the command line without a browser.
//
// Usage:
//   node harness.js                 # single day (default config)
//   node harness.js --annual       # full year using llanberis2024.csv
//   node harness.js --app <file>   # test an alternative version of the app
//                                  # e.g. one extracted with git show HEAD:
//
// Settings can be changed before the run via a small JS snippet:
//   node harness.js --set "app.dhw.daily_volume=200; app.dhw.node_count=8"
//
// The app runs asynchronously (the sim loop is chunked for UI progress), so
// completion is detected by polling app.progress.running / sim_time_ms.
// Note: in annual mode app.simulate() only flags needs_run - the harness uses
// app.run_model() to actually run.
//
// It can also be loaded from another script with require('./harness.js'),
// which skips the CLI and exports run_annual() (see the end of the file).
// The app lives in the globals of the thread that loads it, so one thread
// runs one simulation at a time: sweep.js uses a worker thread per core.
// ============================================================================

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const BASE = __dirname;
const LIB = path.join(BASE, '..', '..', 'lib');
const is_cli = require.main === module;

// --- CLI arguments ----------------------------------------------------------
const args = is_cli ? process.argv.slice(2) : [];
function arg_value(name) {
    const i = args.indexOf(name);
    return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
}
const annual = args.includes('--annual');
const app_file = arg_value('--app') || path.join(BASE, 'dynamic_heatpump.js');
const set_snippet = arg_value('--set');

// --- Browser stubs ----------------------------------------------------------
global.window = global;
global.document = {};
global.alert = function (msg) { console.log('[alert]', msg); };
global.prompt = function () { return null; };

// Minimal Vue 2 stub: assigns data properties and binds methods onto the instance
global.Vue = function (opts) {
    Object.assign(this, opts.data);
    if (opts.methods) {
        for (const k in opts.methods) this[k] = opts.methods[k].bind(this);
    }
    // No render cycle to wait for, so run the callback straight away
    this.$nextTick = function (cb) { cb(); };
    return this;
};
Vue.filter = function () {};
Vue.component = function () {};

// Chainable jQuery stub: width()/height() return a number with no args,
// chain when called with args (as setters); everything else chains
function jqProxy() {
    const handler = {
        get: function (target, prop) {
            if (prop === 'width' || prop === 'height') {
                return function () {
                    if (arguments.length === 0) return 800;
                    return new Proxy(function () {}, handler);
                };
            }
            return function () { return new Proxy(function () {}, handler); };
        },
        apply: function () { return new Proxy(function () {}, handler); }
    };
    return new Proxy(function () {}, handler);
}
global.$ = function () { return jqProxy(); };
global.$.plot = function () { return jqProxy(); };

// --- Load the app (vm.runInThisContext so implicit globals like MWT, cyl_T work)
function load(file) {
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
load(path.join(LIB, 'ecodan.js'));
load(path.join(LIB, 'vaillant.js'));
load(path.join(LIB, 'vaillant_cop_fit.js'));
// Model modules and plot glue (order matters); older self-contained app
// versions passed via --app may predate the split, so only load what exists
const MODEL_FILES = ['pipework.js', 'cylinder.js', 'controller.js', 'building.js', 'frost.js', 'simulator.js'];
const model_dir = path.join(path.dirname(app_file), 'model');
if (fs.existsSync(model_dir)) {
    for (const f of MODEL_FILES) {
        const p = path.join(model_dir, f);
        if (fs.existsSync(p)) load(p);
    }
}
const timeseries_file = path.join(BASE, 'timeseries.js');
if (fs.existsSync(timeseries_file)) load(timeseries_file);
const plot_file = path.join(path.dirname(app_file), 'plot.js');
if (fs.existsSync(plot_file)) load(plot_file);
const bargraph_file = path.join(path.dirname(app_file), 'bargraph.js');
if (fs.existsSync(bargraph_file)) load(bargraph_file);
load(app_file);

// --- Completion detection ---------------------------------------------------
// A run is finished when progress.running is false and sim_time_ms has changed
// from its value when the wait started (sim_time_ms is only written when the
// main run's results are applied)
function wait_done(callback) {
    const sim_time_at_start = app.results.sim_time_ms;
    const timer = setInterval(function () {
        const running = app.progress && app.progress.running;
        if (!running && app.results.sim_time_ms !== sim_time_at_start) {
            clearInterval(timer);
            callback();
        }
    }, 50);
}

function report() {
    const r = app.results;
    console.log('--- results ---');
    console.log('days simulated:      ', app.days, '(+' + app.days_pre_sim + ' pre-sim)');
    console.log('sim time:            ', r.sim_time_ms.toFixed(0), 'ms');
    console.log('space elec kWh:      ', (r.elec_kwh - r.dhw_elec_kwh).toFixed(3));
    console.log('space heat kWh:      ', (r.heat_kwh - r.dhw_heat_kwh).toFixed(3));
    if (r.heat_kwh_m1 !== undefined) { // metering fields absent in pre-pipework versions
        console.log('heat @ source kWh:   ', r.heat_kwh.toFixed(3));
        console.log('heat @ M1 kWh:       ', r.heat_kwh_m1.toFixed(3));
        console.log('heat @ M2 kWh:       ', r.heat_kwh_m2.toFixed(3));
        console.log('primary loss kWh:    ', r.primary_loss_kwh.toFixed(3));
        console.log('COP source/M1/M2:    ', (r.heat_kwh / r.elec_kwh).toFixed(3) + ' / ' +
            (r.heat_kwh_m1 / r.elec_kwh).toFixed(3) + ' / ' + (r.heat_kwh_m2 / r.elec_kwh).toFixed(3));
    }
    console.log('mean room T:         ', r.mean_room_temp.toFixed(3));
    console.log('max room T:          ', r.max_room_temp.toFixed(3));
    console.log('total cost:          ', r.total_cost.toFixed(2));
    console.log('dhw heat kWh:        ', r.dhw_heat_kwh.toFixed(3));
    console.log('dhw elec kWh:        ', r.dhw_elec_kwh.toFixed(3));
    console.log('dhw COP:             ', r.dhw_elec_kwh > 0 ? (r.dhw_heat_kwh / r.dhw_elec_kwh).toFixed(2) : '-');
    console.log('dhw delivered kWh:   ', r.dhw_delivered_kwh.toFixed(3));
    console.log('cylinder loss kWh:   ', r.cylinder_loss_kwh.toFixed(3));
    console.log('min cyl top T:       ', r.min_cylinder_top_temp.toFixed(2));
    if (r.defrost_cycles !== undefined) { // absent in pre-frost versions
        console.log('defrost cycles:      ', r.defrost_cycles);
        console.log('defrost heat kWh:    ', r.defrost_heat_kwh.toFixed(3),
            '(' + (100 * r.defrost_heat_kwh / r.heat_kwh).toFixed(2) + '% of heat)');
        console.log('defrost elec kWh:    ', r.defrost_elec_kwh.toFixed(3));
    }
    // Post-refactor state/series live on app.state / sim_series; fall back to
    // the old globals when testing a pre-refactor version via --app
    const cyl = (app.state && app.state.cyl_T) ? app.state.cyl_T : (typeof cyl_T !== 'undefined' ? cyl_T : []);
    console.log('cyl_T (bottom->top): ', cyl.map(t => t.toFixed(1)).join(' '));
    const flowT = (typeof sim_series !== 'undefined' && sim_series) ? sim_series.flowT_data
        : (typeof flowT_data !== 'undefined' ? flowT_data : []);
    let max_flow = -Infinity;
    for (let i = 0; i < flowT.length; i++) if (flowT[i] > max_flow) max_flow = flowT[i];
    console.log('max flow T:          ', max_flow.toFixed(2));

    // HeatpumpMonitor.org-style stats (validator): same field names and
    // calculation as the site's system/stats/last365 API
    if (app.hpm_model) {
        const h = app.hpm_model;
        const f = (v, dp) => (v === null || v === undefined) ? '-' : (+v).toFixed(dp);
        console.log('--- heatpumpmonitor.org-style stats ---');
        console.log('combined elec/heat/COP:', f(h.combined_elec_kwh, 3), '/', f(h.combined_heat_kwh, 3),
            'kWh /', f(h.combined_cop, 3));
        console.log('combined cooling kWh:  ', f(h.combined_cooling_kwh, 3));
        console.log('combined data length:  ', f(h.combined_data_length / 86400, 1), 'days');
        console.log('combined roomT/outsideT mean:', f(h.combined_roomT_mean, 2), '/', f(h.combined_outsideT_mean, 2));
        console.log('space elec/heat/COP:   ', f(h.space_elec_kwh, 3), '/', f(h.space_heat_kwh, 3),
            'kWh /', f(h.space_cop, 3));
        console.log('water elec/heat/COP:   ', f(h.water_elec_kwh, 3), '/', f(h.water_heat_kwh, 3),
            'kWh /', f(h.water_cop, 3));
        console.log('DHW share of heat:     ', h.combined_heat_kwh > 0
            ? (100 * h.water_heat_kwh / h.combined_heat_kwh).toFixed(1) + '%' : '-');
        console.log('weighted flowT:        ', f(h.weighted_flowT, 2));
        console.log('weighted outsideT:     ', f(h.weighted_outsideT, 2));
        console.log('weighted flow-outside: ', f(h.weighted_flowT_minus_outsideT, 2));
        console.log('weighted flow-return:  ', f(h.weighted_flowT_minus_returnT, 2));
        console.log('weighted elec/heat W:  ', f(h.weighted_elec, 0), '/', f(h.weighted_heat, 0));
        console.log('weighted % of carnot:  ', f(h.weighted_prc_carnot, 1));
    }

    // Daily bar chart aggregates (bargraph.js): the per-day totals must add
    // back up to the run totals, so this doubles as a conservation check
    if (typeof daily !== 'undefined' && daily.length) {
        let heat = 0, elec = 0, space_heat = 0, water_heat = 0;
        for (const d of daily) {
            heat += d.combined.heat;
            elec += d.combined.elec;
            space_heat += d.space.heat;
            water_heat += d.water.heat;
        }
        console.log('--- daily aggregates ---');
        console.log('days:                ', daily.length);
        console.log('sum heat kWh:        ', heat.toFixed(3),
            '(net of defrost: run ' + (r.heat_kwh - r.defrost_heat_kwh).toFixed(3) + ')');
        console.log('sum elec kWh:        ', elec.toFixed(3), '(run ' + r.elec_kwh.toFixed(3) + ')');
        console.log('space / water heat:  ', space_heat.toFixed(3), '/', water_heat.toFixed(3));
        console.log('mean daily COP:      ', elec > 0 ? (heat / elec).toFixed(3) : '-');
    }

    // Coldest day flow temperatures, against the design flow temperature the
    // emitters were sized to
    if (app.coldest_day) {
        const c = app.coldest_day;
        const f = (v, dp) => (v === null || v === undefined) ? '-' : (+v).toFixed(dp === undefined ? 2 : dp);
        console.log('--- coldest day flow temperatures ---');
        console.log('coldest day:         ', c.label, '· mean outside', f(c.mean_outsideT),
            '· min outside', f(c.min_outsideT));
        console.log('design flowT:        ', f(app.heatpump.design_flowT));
        console.log('space max flowT:     ', f(c.space.max));
        console.log('space weighted/mean: ', f(c.space.weighted), '/', f(c.space.mean),
            '(' + f(c.space.hours, 1) + ' h)');
        console.log('all weighted/mean:   ', f(c.combined.weighted), '/', f(c.combined.mean),
            '(' + f(c.combined.hours, 1) + ' h)');
    }
}

// --- Library use ------------------------------------------------------------
// Defaults as loaded, before the first run touches anything: each run_annual()
// config is applied on top of these so earlier runs can't leak into later ones
const default_config = app.get_config();

// The app auto-runs a single-day simulation on load; runs wait for it
const app_ready = new Promise(function (resolve) { wait_done(resolve); });

// Recursive merge of plain objects; arrays and values from src replace
function merge_config(base, src) {
    const out = JSON.parse(JSON.stringify(base));
    for (const k in src) {
        const v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) &&
            out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
            out[k] = merge_config(out[k], v);
        } else {
            out[k] = JSON.parse(JSON.stringify(v));
        }
    }
    return out;
}

// Run a full year on llanberis2024.csv with config (any subset of the
// export_config shape) applied over the defaults, from a cold start. Two
// extra optional keys: days_pre_sim, and outsideT_offset (K added to every
// outside temperature in the dataset, to stand in for a colder or warmer
// site). Resolves with the app once results are in: app.results, app.stats,
// app.hpm_model and the 30 s series in sim_series.
let base_outsideT = null;
function run_annual(config) {
    return app_ready.then(function () {
        return new Promise(function (resolve) {
            // Cold start: the simulator re-initialises any null state
            for (const k in sim_state) sim_state[k] = null;
            const cfg = Object.assign({}, config);
            const offset = cfg.outsideT_offset || 0;
            delete cfg.outsideT_offset;
            app.apply_config(merge_config(default_config, cfg));
            app.days_pre_sim = (config && config.days_pre_sim !== undefined) ? config.days_pre_sim : 5;
            app.mode = 'year';
            app.days = 365;
            app.external.use_csv = true;
            if (!base_outsideT) {
                // Load the dataset once; parse_csv would also start a run
                const run_model = app.run_model;
                app.run_model = function () {};
                app.parse_csv(fs.readFileSync(path.join(BASE, 'llanberis2024.csv'), 'utf8'));
                app.run_model = run_model;
                base_outsideT = annual_dataset_outsideT.slice();
            }
            annual_dataset_outsideT = base_outsideT.map(function (t) { return t + offset; });
            wait_done(function () { resolve(app); });
            app.run_model();
        });
    });
}

// --- Extra annual metrics from the 30 s series ------------------------------
// All electricity-free, so they can be tested as COP predictors on real
// monitoring data too (flowT, outsideT, heat and rated capacity only). Heat is
// net of the reverse-cycle defrost draw; samples without net heat are skipped.
// Load ratios use the rated capacity: the badge for fitted models (as on
// heatpumpmonitor.org), the maximum output for carnot models.
function annual_metrics(series, capacity, days) {
    const heat = series.heat_data, defrost = series.defrost_data;
    const flowT = series.flowT_data, outsideT = series.outsideT_data;
    const n = heat.length;
    let sh = 0, s_ideal_fixed = 0, s_ideal_var = 0, s_dT = 0, s_dT2 = 0;
    let s_hr = 0, below40 = 0, on_steps = 0, starts = 0, prev_on = false;
    for (let i = 0; i < n; i++) {
        const on = heat[i] > 0;
        if (on && !prev_on) starts++;
        prev_on = on;
        const h = heat[i] - defrost[i];
        if (!on || h <= 0) continue;
        on_steps++;
        const fT = flowT[i], oT = outsideT[i];
        const dT = fT - oT;
        sh += h; s_dT += h * dT; s_dT2 += h * dT * dT;
        // Ideal Carnot, fixed +2/-6 K offsets (the heatpumpmonitor.org convention)
        const lift_fixed = (fT + 2) - (oT - 6);
        if (lift_fixed > 0) s_ideal_fixed += h * lift_fixed / (fT + 2 + 273.15);
        // Ideal Carnot, offsets growing with load ratio r (+3r / -8r K)
        const r = h / capacity;
        const lift_var = (fT + 3 * r) - (oT - 8 * r);
        if (lift_var > 0) s_ideal_var += h * lift_var / (fT + 3 * r + 273.15);
        s_hr += h * r;
        if (h < 0.4 * capacity) below40 += h;
    }
    const dT_w = s_dT / sh;
    return {
        // Heat-weighted harmonic mean of the ideal COP: sum(heat) / sum(heat / carnot)
        H_fixed: sh / s_ideal_fixed,
        H_star: sh / s_ideal_var,
        dT_sd: Math.sqrt(Math.max(0, s_dT2 / sh - dT_w * dT_w)),
        runtime_frac: on_steps / n,
        starts_per_day: starts / days,
        heat_frac_below_40pct: below40 / sh,
        mean_load_ratio: sh / on_steps / capacity,             // time-weighted while running
        r_bar: s_hr / sh                                       // heat-weighted
    };
}

module.exports = { run_annual: run_annual, annual_metrics: annual_metrics, default_config: default_config };

// --- Run --------------------------------------------------------------------
// The app auto-runs a single-day simulation on load; wait for it first
if (is_cli) wait_done(function () {
    if (set_snippet) {
        eval(set_snippet);
    }

    if (annual) {
        app.mode = 'year';
        app.days = 365;
        app.external.use_csv = true;
        const progress_timer = setInterval(function () {
            if (app.progress.running) {
                process.stdout.write('\rday ' + app.progress.day + ' of ' + app.progress.total + '   ');
            }
        }, 500);
        // parse_csv triggers run_model itself
        app.parse_csv(fs.readFileSync(path.join(BASE, 'llanberis2024.csv'), 'utf8'));
        wait_done(function () {
            clearInterval(progress_timer);
            process.stdout.write('\n');
            report();
        });
    } else if (set_snippet) {
        // Re-run the single day with the modified settings
        app.run_model();
        wait_done(report);
    } else {
        report();
    }
});
