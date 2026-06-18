// Quick benchmark: greedy vs optimal (DP) battery dispatch on the real data.
//   node bench_dp.js
const fs = require('fs');
const model = require('./model.js');

const data = JSON.parse(fs.readFileSync(__dirname + '/solarmatching_data.json', 'utf8'));
model._apply(data);   // remap + normalise, same as load() does after fetch

const capacities = [2, 5, 10, 15];

function run(dispatch, capacity, soc_levels) {
    const params = {
        battery: { capacity: capacity, dispatch: dispatch, soc_levels: soc_levels, cycle_cost: 0 }
    };
    const t0 = process.hrtime.bigint();
    const r = model.run(params);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { r: r.annual, ms: ms, soc_end: r.battery_soc_end, runs: r.run_count };
}

console.log('cap  mode     agile£   import   export   self%  time(ms)');
for (const cap of capacities) {
    const g = run('greedy', cap);
    const o = run('optimal', cap, 100);
    const fmt = (m, tag) => `${String(cap).padStart(2)}   ${tag.padEnd(8)} `
        + `${m.r.agile_cost.toFixed(1).padStart(7)} `
        + `${m.r.import_kwh.toFixed(0).padStart(7)} `
        + `${m.r.export_kwh.toFixed(0).padStart(7)} `
        + `${m.r.prc_from_solar.toFixed(1).padStart(6)} `
        + `${m.ms.toFixed(0).padStart(8)}`;
    console.log(fmt(g, 'greedy'));
    console.log(fmt(o, 'optimal'));
    const gain = g.r.agile_cost - o.r.agile_cost;
    console.log(`     -> optimal saves £${gain.toFixed(1)}/yr vs greedy `
        + `(${(100 * gain / Math.abs(g.r.agile_cost)).toFixed(1)}% of greedy agile bill)`);
}

// SOC-resolution sensitivity at one capacity, to show convergence toward the LP.
console.log('\nSOC-level sensitivity (cap=10):');
for (const K of [25, 50, 100, 200, 400]) {
    const o = run('optimal', 10, K);
    console.log(`  K=${String(K).padStart(3)}  agile£=${o.r.agile_cost.toFixed(2).padStart(8)}  time=${o.ms.toFixed(0)}ms`);
}
