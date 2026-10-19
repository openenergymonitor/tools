// ============================================================================
// Monte Carlo sweep over system designs through the dynamic heat pump
// simulator, for studying how annual performance varies across a fleet.
// ----------------------------------------------------------------------------
// Each scenario is a full year on llanberis2024.csv, run through harness.js
// (the real app, headless). Scenarios run in parallel, one per worker thread.
//
// Fixed for every scenario: carnot_variable COP model at 47% of Carnot, single
// PI control (AUTO_ADAPT). Everything not listed in make_scenarios() keeps the
// app default (including frost and primary pipework). Varied: heat loss,
// capacity, design flow temperature, system DT, water volume, minimum
// modulation, standby and pump power, gains, room setpoint and setback, DHW
// volume, cylinder size and DHW set points.
//
// Usage:
//   node sweep.js [--n 400] [--workers <cpus-2>] [--seed 20260715] [--out sweep_results.csv]
//
// Output is one CSV row per scenario: the sampled design, the
// HeatpumpMonitor.org-style annual stats (metered at the heat pump, as the
// site would see it), comfort, and some extra annual metrics computed from
// the 30 s series (see annual_metrics()). A year takes ~10-20 s per worker.
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

function make_scenarios(n, seed) {
    const rng = mulberry32(seed);
    const U = (a, b) => a + (b - a) * rng();
    const scenarios = [];
    for (let i = 0; i < n; i++) {
        const heat_loss = U(2000, 9000);                       // W at design conditions
        const capacity = Math.min(18000, Math.max(3500, heat_loss * U(1.0, 2.2)));
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
                capacity: capacity,
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
                    cop_model: 'carnot_variable',
                    prc_carnot: 47,
                    capacity: capacity,
                    design_flowT: design_flowT,
                    system_water_volume: U(60, 250),
                    flow_rate: (capacity * 60) / (4187 * system_DT),   // L/min, the app clamps to 1-40
                    minimum_modulation: U(20, 45),
                    standby: U(5, 20),
                    pumps: U(10, 30),
                    ramp_rate: 1
                },
                control: { mode: 0 },                                   // single PI (AUTO_ADAPT)
                dhw: {
                    daily_volume: U(60, 350),
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

// --- Extra annual metrics from the 30 s series ------------------------------
// All electricity-free, so they can be tested as COP predictors on real
// monitoring data too (flowT, outsideT, heat and rated capacity only). Heat is
// net of the reverse-cycle defrost draw; samples without net heat are skipped.
function annual_metrics(series, capacity, days) {
    const heat = series.heat_data, defrost = series.defrost_data;
    const flowT = series.flowT_data, outsideT = series.outsideT_data;
    const n = heat.length;
    let sh = 0, s_ideal_fixed = 0, s_ideal_var = 0, s_dT = 0, s_dT2 = 0;
    let below40 = 0, on_steps = 0, starts = 0, prev_on = false;
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
        mean_load_ratio: sh / on_steps / capacity
    };
}

// --- Main thread: hand out scenarios, collect rows, write the CSV -----------
if (isMainThread) {
    const N = parseInt(arg_value('--n', '400'));
    const seed = parseInt(arg_value('--seed', '20260715'));
    const n_workers = Math.min(N, parseInt(arg_value('--workers', String(Math.max(1, os.cpus().length - 2)))));
    const out_file = path.resolve(arg_value('--out', 'sweep_results.csv'));

    const scenarios = make_scenarios(N, seed);
    console.log('running ' + N + ' scenarios on ' + n_workers + ' workers (seed ' + seed + ')');

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
        harness.run_annual(s.config).then(function (app) {
            const r = app.results, h = app.hpm_model;
            const row = Object.assign({ scenario: s.i }, s.params, {
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
            }, annual_metrics(sim_series, app.heatpump.capacity, app.days));
            for (const k in row) {
                if (typeof row[k] === 'number' && !Number.isInteger(row[k])) row[k] = +row[k].toPrecision(6);
            }
            parentPort.postMessage({ i: s.i, row: row });
        });
    });
}
