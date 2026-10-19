// ============================================================================
// Monte Carlo sweep over system designs through the dynamic heat pump
// simulator, for studying how annual performance varies across a fleet.
// ----------------------------------------------------------------------------
// Each scenario is a full year on llanberis2024.csv, run through harness.js
// (the real app, headless). Scenarios run in parallel, one per worker thread.
//
// The COP model is the same for every scenario, chosen with --cop-model:
//   generic_v2       (default) Vaillant Arotherm+ datasheet fit, speed based.
//                    Each unit is an Arotherm+ badge size (3.5-12 kW) nearest
//                    the sampled sizing; max output and minimum modulation
//                    (30 of 120 rps) come from the fit's capacity model.
//   generic          as above, with the load-fraction efficiency curve
//   carnot_variable  47% of Carnot with load-dependent offsets; capacity and
//                    minimum modulation are sampled directly
// Control is single PI (AUTO_ADAPT). Everything not listed in
// make_scenarios() keeps the app default (including frost and primary
// pipework). Varied: heat loss, sizing, design flow temperature, system DT,
// water volume, standby and pump power, gains, room setpoint and setback,
// DHW volume, cylinder size and DHW set points. The same seed gives the same
// houses whatever the COP model, so models can be compared like for like.
//
// Usage:
//   node sweep.js [--n 400] [--workers <cpus-2>] [--seed 20260715]
//                 [--cop-model generic_v2] [--out sweep_results.csv]
//
// Output is one CSV row per scenario: the sampled design, the
// HeatpumpMonitor.org-style annual stats (metered at the heat pump, as the
// site would see it), comfort, and some extra annual metrics computed from
// the 30 s series (see annual_metrics() in harness.js). A year takes ~10-20 s per worker.
// ============================================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

// --- CLI arguments ----------------------------------------------------------
const args = process.argv.slice(2);
function arg_value(name, fallback) {
    const i = args.indexOf(name);
    return (i >= 0 && i + 1 < args.length) ? args[i + 1] : fallback;
}

// --- Scenarios --------------------------------------------------------------
// Deterministic RNG so a seed always gives the same scenarios
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Arotherm+ badge sizes, kW
const AROTHERM_BADGES = [3.5, 5, 7, 10, 12];
const FITTED_MODELS = ['generic', 'generic_v2'];

function make_scenarios(n, seed, cop_model) {
    const rng = mulberry32(seed);
    const U = (a, b) => a + (b - a) * rng();
    const fitted = FITTED_MODELS.includes(cop_model);
    const scenarios = [];
    // Every value is drawn whatever the COP model, so a seed always gives the
    // same houses and the models can be compared scenario by scenario
    for (let i = 0; i < n; i++) {
        const heat_loss = U(2000, 9000);                       // W at design conditions
        const sizing = U(1.0, 2.2);                            // capacity / heat loss
        // carnot_variable: capacity is the maximum output. Fitted models:
        // nearest Arotherm+ badge (nominal capacity), and the worker sets the
        // maximum output and minimum modulation from the fit
        const capacity = Math.min(18000, Math.max(3500, heat_loss * sizing));
        const target_kw = heat_loss * sizing / 1000;
        const badge = AROTHERM_BADGES.reduce((best, b) =>
            Math.abs(Math.log(b / target_kw)) < Math.abs(Math.log(best / target_kw)) ? b : best);
        const design_flowT = U(35, 55);                        // emitters sized from this
        const system_DT = U(4, 8);                             // flow rate sized for this at full output
        const setpointT = U(18.5, 21.5);
        const setback = rng() < 0.5;
        const schedule = setback
            ? [{ start: '00:00', set_point: setpointT - 2, price: 24.67 },
               { start: '06:00', set_point: setpointT, price: 24.67 },
               { start: '22:00', set_point: setpointT - 2, price: 24.67 }]
            : [{ start: '00:00', set_point: setpointT, price: 24.67 }];
        scenarios.push({
            i: i,
            params: {
                heat_loss: heat_loss,
                sizing: sizing,
                badge: fitted ? badge : '',
                design_flowT: design_flowT,
                system_DT: system_DT,
                setpointT: setpointT,
                setback: setback ? 1 : 0
            },
            config: {
                building: {
                    heat_loss: heat_loss,
                    solar_gains_scale: U(0, 8),
                    lac_gains: U(100, 350),
                    metabolic_gains: U(50, 150)
                },
                heatpump: {
                    cop_model: cop_model,
                    prc_carnot: 47,                                     // carnot models only
                    nominal_capacity: badge * 1000,                     // fitted models only
                    eta_scale: 1.0,
                    capacity: capacity,
                    design_flowT: design_flowT,
                    system_water_volume: U(60, 250),
                    minimum_modulation: U(20, 45),
                    standby: U(5, 20),
                    pumps: U(10, 30),
                    ramp_rate: 1
                },
                control: { mode: 0 },                                   // single PI (AUTO_ADAPT)
                dhw: {
                    daily_volume: U(40, 200),             // L/day mixed at the tap
                    cylinder_volume: U(120, 300)
                },
                dhw_schedule: [
                    { start: '04:00', set_point: U(42, 50), duration: 10800, modulation: 50 },
                    { start: '13:00', set_point: U(42, 50), duration: 7200, modulation: 50 }
                ],
                schedule: schedule
            }
        });
    }
    return scenarios;
}

// --- Main thread: hand out scenarios, collect rows, write the CSV -----------
if (isMainThread) {
    const N = parseInt(arg_value('--n', '400'));
    const seed = parseInt(arg_value('--seed', '20260715'));
    const n_workers = Math.min(N, parseInt(arg_value('--workers', String(Math.max(1, os.cpus().length - 2)))));
    const out_file = path.resolve(arg_value('--out', 'sweep_results.csv'));
    const cop_model = arg_value('--cop-model', 'generic_v2');
    if (!FITTED_MODELS.includes(cop_model) && cop_model !== 'carnot_variable') {
        console.error('--cop-model must be generic_v2, generic or carnot_variable');
        process.exit(1);
    }

    const scenarios = make_scenarios(N, seed, cop_model);
    console.log('running ' + N + ' scenarios on ' + n_workers + ' workers (seed ' + seed + ', ' + cop_model + ')');

    const rows = new Array(N);
    let next = 0, done = 0;
    const t0 = Date.now();

    for (let w = 0; w < n_workers; w++) {
        const worker = new Worker(__filename);
        const feed = function () {
            if (next < N) worker.postMessage(scenarios[next++]);
            else worker.terminate();
        };
        worker.on('message', function (msg) {
            rows[msg.i] = msg.row;
            done++;
            if (done % 10 === 0 || done === N) {
                const rate = done / ((Date.now() - t0) / 1000);
                console.log('  ' + done + '/' + N + '  (' + (rate * 60).toFixed(1) + '/min, eta ' +
                    ((N - done) / rate / 60).toFixed(1) + ' min)');
            }
            feed();
        });
        worker.on('error', function (e) { console.error('worker error:', e); process.exit(1); });
        feed();
    }

    process.on('exit', function () {
        const first = rows.find(Boolean);
        if (!first) return;
        const cols = Object.keys(first);
        const lines = [cols.join(',')];
        for (const r of rows) if (r) lines.push(cols.map(c => r[c]).join(','));
        fs.writeFileSync(out_file, lines.join('\n') + '\n');
        console.log('wrote ' + out_file + ' (' + rows.filter(Boolean).length + ' rows)');
    });

// --- Worker thread: one headless app, one scenario at a time ----------------
} else {
    console.log = function () {};   // the app and simulator log every run
    const harness = require('./harness.js');
    parentPort.on('message', function (s) {
        const hp = s.config.heatpump;
        const fitted = FITTED_MODELS.includes(hp.cop_model);
        if (fitted) {
            // Arotherm+ modulation range from the fit's capacity model at A7/W35
            hp.capacity = 1000 * outputRange(0.001 * hp.nominal_capacity, 35, 7).maxKW;
            hp.minimum_modulation = 100 * VAILLANT_MIN_RPS / VAILLANT_MAX_RPS;
        }
        // Load ratios and flow rate use the rated capacity: the badge for
        // fitted models, the maximum output for carnot models. Flow is sized
        // for the system DT at rated output (the app clamps to 1-40 L/min)
        const rated = fitted ? hp.nominal_capacity : hp.capacity;
        hp.flow_rate = (rated * 60) / (4187 * s.params.system_DT);
        harness.run_annual(s.config).then(function (app) {
            const r = app.results, h = app.hpm_model;
            const row = Object.assign({ scenario: s.i }, s.params, {
                capacity: app.heatpump.capacity,
                minimum_modulation: app.heatpump.minimum_modulation,
                flow_rate: app.heatpump.flow_rate,
                spf: h.combined_cop,
                heat_kwh: h.combined_heat_kwh,
                elec_kwh: h.combined_elec_kwh,
                water_heat_frac: h.water_heat_kwh / h.combined_heat_kwh,
                weighted_flowT: h.weighted_flowT,
                weighted_outsideT: h.weighted_outsideT,
                weighted_flowT_minus_outsideT: h.weighted_flowT_minus_outsideT,
                weighted_flowT_minus_returnT: h.weighted_flowT_minus_returnT,
                weighted_prc_carnot: h.weighted_prc_carnot,
                defrost_heat_kwh: r.defrost_heat_kwh,
                primary_loss_kwh: r.primary_loss_kwh,
                mean_room_temp: r.mean_room_temp,
                degree_hours_below_setpoint: app.stats.degree_hours_below_setpoint,
                degree_hours_above_setpoint: app.stats.degree_hours_above_setpoint
            }, harness.annual_metrics(sim_series, rated, app.days));
            for (const k in row) {
                if (typeof row[k] === 'number' && !Number.isInteger(row[k])) row[k] = +row[k].toPrecision(6);
            }
            parentPort.postMessage({ i: s.i, row: row });
        });
    });
}
