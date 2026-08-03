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
// ============================================================================

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const BASE = __dirname;
const LIB = path.join(BASE, '..', '..', 'lib');

// --- CLI arguments ----------------------------------------------------------
const args = process.argv.slice(2);
function arg_value(name) {
    const i = args.indexOf(name);
    return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
}
const annual = args.includes('--annual');
const app_file = arg_value('--app') || path.join(BASE, 'dynamic_heatpump.js');
const set_snippet = arg_value('--set');

// --- Browser stubs ----------------------------------------------------------
global.window = global;
global.alert = function (msg) { console.log('[alert]', msg); };
global.prompt = function () { return null; };

// Minimal Vue 2 stub: assigns data properties and binds methods onto the instance
global.Vue = function (opts) {
    Object.assign(this, opts.data);
    if (opts.methods) {
        for (const k in opts.methods) this[k] = opts.methods[k].bind(this);
    }
    return this;
};
Vue.filter = function () {};

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
load(path.join(BASE, 'timeseries.js'));
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
    console.log('mean room T:         ', r.mean_room_temp.toFixed(3));
    console.log('max room T:          ', r.max_room_temp.toFixed(3));
    console.log('total cost:          ', r.total_cost.toFixed(2));
    console.log('dhw heat kWh:        ', r.dhw_heat_kwh.toFixed(3));
    console.log('dhw elec kWh:        ', r.dhw_elec_kwh.toFixed(3));
    console.log('dhw COP:             ', r.dhw_elec_kwh > 0 ? (r.dhw_heat_kwh / r.dhw_elec_kwh).toFixed(2) : '-');
    console.log('dhw delivered kWh:   ', r.dhw_delivered_kwh.toFixed(3));
    console.log('cylinder loss kWh:   ', r.cylinder_loss_kwh.toFixed(3));
    console.log('min cyl top T:       ', r.min_cylinder_top_temp.toFixed(2));
    console.log('cyl_T (bottom->top): ', cyl_T.map(t => t.toFixed(1)).join(' '));
    let max_flow = -Infinity;
    for (let i = 0; i < flowT_data.length; i++) if (flowT_data[i] > max_flow) max_flow = flowT_data[i];
    console.log('max flow T:          ', max_flow.toFixed(2));
}

// --- Run --------------------------------------------------------------------
// The app auto-runs a single-day simulation on load; wait for it first
wait_done(function () {
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
