#!/usr/bin/env node
// solarmatching/harness.js
//
// Node test harness for the household energy ledger. It wires the real
// half-hourly dataset into model.js and runs the exact ledger logic the browser
// uses (ledger.js — DEFAULTS, ann, flowsHH, compute), so results match the page.
//
// The point of the tool: explore how solar, battery, tariffs, EVs and heat pumps
// COMBINE — the co-benefits. Adding a battery saves more once you also have
// solar and an Agile tariff; the harness quantifies those interactions.
//
// Usage:
//   node harness.js                      full report (status quo, build, marginals, synergy)
//   node harness.js scenario ev,hp,solar,battery,agile [--optimal] [--p k=v ...]
//   node harness.js marginals [base flags] [--optimal]
//   node harness.js cobenefits [--optimal]          pairwise synergy matrix
//   node harness.js sweep <param> <from> <to> <step> [flags] [--optimal]
//   node harness.js ladder [--optimal]              cumulative build-up ladder
//
// Build flags are a comma list of: ev, hp, solar, battery, agile  (gas is
// auto-disconnected with hp, mirroring the view). Override any DEFAULTS field
// with --p name=value (repeatable), e.g. --p batteryKwh=10 --p gridIntensity=80.

const fs = require('fs');
const path = require('path');

const model = require('./model.js');
const ledger = require('./ledger.js');

// ---- load the real half-hourly dataset into the model -----------------------
const DATA_PATH = path.join(__dirname, 'solarmatching_data.json');
(function loadData() {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  model._apply(raw);        // remap 8 raw series -> sim layout, then normalise
  model.usingSynthetic = false;
})();

// ---- model runner with memoisation (mirrors the view's runModel) ------------
const modelCache = new Map();
function runModel(mp) {
  const key = JSON.stringify(mp);
  let r = modelCache.get(key);
  if (!r) { r = model.run(mp); modelCache.set(key, r); }
  return r;
}

// ---- ledger context ---------------------------------------------------------
// p is a deep copy of DEFAULTS merged with CLI overrides; flags toggle engines.
function makeCtx(p, opts) {
  return {
    p,
    useHHModel: opts.useHHModel !== false,
    modelReady: true,
    optimalDispatch: !!opts.optimalDispatch,
    runModel,
  };
}

// Normalise a build config: disconnectGas tracks hp unless set explicitly.
function cfg(flags) {
  const c = { ev: false, hp: false, solar: false, battery: false, agile: false, disconnectGas: false };
  (flags || []).forEach(f => { if (f in c) c[f] = true; });
  if (c.hp && !('disconnectGasExplicit' in c)) c.disconnectGas = true;
  return c;
}

function run(c, p, opts) { return ledger.compute(c, makeCtx(p, opts)); }

// ---- formatting -------------------------------------------------------------
const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
const sgbp = n => (n >= 0 ? '+' : '−') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
const kwh = n => Math.round(n).toLocaleString('en-GB') + ' kWh';
const co2 = n => Math.round(n).toLocaleString('en-GB') + ' kg';
const sco2 = n => (n >= 0 ? '+' : '−') + Math.abs(Math.round(n)).toLocaleString('en-GB') + ' kg';
const pad = (s, w) => String(s).padEnd(w);
const lpad = (s, w) => String(s).padStart(w);
const TECHS = ['ev', 'hp', 'solar', 'battery', 'agile'];
const TECH_LABEL = { ev: 'EV', hp: 'Heat pump', solar: 'Solar', battery: 'Battery', agile: 'Agile tariff' };

function buildName(c) {
  const on = TECHS.filter(t => c[t]).map(t => TECH_LABEL[t]);
  return on.length ? on.join(' + ') : 'fossil status quo';
}

function hr(ch = '─', n = 78) { return ch.repeat(n); }
function h2(title) { console.log('\n' + title); console.log(hr()); }

// ---- argument parsing -------------------------------------------------------
function parseArgs(argv) {
  const out = { cmd: argv[0] || 'report', positional: [], flags: [], p: {}, opts: {} };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--optimal') out.opts.optimalDispatch = true;
    else if (a === '--annual') out.opts.useHHModel = false;
    else if (a === '--p') { const kv = argv[++i].split('='); out.p[kv[0]] = parseFloat(kv[1]); }
    else if (a.startsWith('--p=')) { const kv = a.slice(4).split('='); out.p[kv[0]] = parseFloat(kv[1]); }
    else if (a.includes(',') || TECHS.includes(a)) out.flags = a.split(',').filter(Boolean);
    else out.positional.push(a);
  }
  return out;
}

function makeP(overrides) {
  const p = JSON.parse(JSON.stringify(ledger.DEFAULTS));
  Object.assign(p, overrides || {});
  return p;
}

// ---- reports ----------------------------------------------------------------

function scenarioReport(c, p, opts) {
  const r = run(c, p, opts);
  const sq = run(cfg([]), p, opts);
  h2('Scenario: ' + buildName(c) + (opts.optimalDispatch ? '  [optimal dispatch]' : ''));
  console.log(`  ${pad('Demand (electric)', 26)} ${lpad(kwh(r.demand), 14)}`);
  console.log(`  ${pad('  EV', 26)} ${lpad(kwh(r.evElec), 14)}`);
  console.log(`  ${pad('  Heat pump', 26)} ${lpad(kwh(r.hpElec), 14)}`);
  console.log(`  ${pad('Solar generation', 26)} ${lpad(kwh(r.solarGen), 14)}`);
  console.log(`  ${pad('  self-consumed', 26)} ${lpad(kwh(r.solarSelf) + ` (${r.selfPct}%)`, 14)}`);
  console.log(`  ${pad('  exported', 26)} ${lpad(kwh(r.solarExport), 14)}`);
  console.log(`  ${pad('Grid import', 26)} ${lpad(kwh(r.gridImport), 14)}`);
  if (r.avgAgileImport != null)
    console.log(`  ${pad('Avg Agile import/export', 26)} ${lpad(r.avgAgileImport.toFixed(1) + ' / ' + r.avgAgileExport.toFixed(1) + ' p/kWh', 14)}`);
  console.log(hr('·'));
  console.log(`  ${pad('Running cost', 26)} ${lpad(gbp(r.running), 14)}`);
  console.log(`  ${pad('Annualised assets', 26)} ${lpad(gbp(r.assets), 14)}`);
  console.log(`  ${pad('ALL-IN £/yr', 26)} ${lpad(gbp(r.allIn), 14)}   vs status quo ${sgbp(-(r.allIn - sq.allIn))}/yr`);
  console.log(hr('·'));
  console.log(`  ${pad('Operational CO₂e', 26)} ${lpad(co2(r.opCO2), 14)}`);
  console.log(`  ${pad('Embodied CO₂e (amortised)', 26)} ${lpad(co2(r.embCO2), 14)}`);
  console.log(`  ${pad('TOTAL CO₂e/yr', 26)} ${lpad(co2(r.totalCO2), 14)}   vs status quo ${sco2(-(r.totalCO2 - sq.totalCO2))}/yr`);
  return r;
}

// Marginal contribution of each tech, GIVEN a base build: the £/yr and kg/yr
// effect of flipping it on (or off if already in the base), plus £/tonne.
function marginalsReport(base, p, opts) {
  h2('Marginal contribution of each technology — base: ' + buildName(base) +
     (opts.optimalDispatch ? '  [optimal dispatch]' : ''));
  const here = run(base, p, opts);
  console.log(`  ${pad('Technology', 14)}${lpad('Δ cost/yr', 14)}${lpad('Δ carbon/yr', 16)}${lpad('£/tonne CO₂e', 16)}`);
  console.log('  ' + hr('─', 58));
  for (const tech of TECHS) {
    const flipped = ledger.flipCfg(base, tech);
    const there = run(flipped, p, opts);
    // sign convention: + = this step saves money / cuts carbon
    const dCost = base[tech] ? (there.allIn - here.allIn) : (here.allIn - there.allIn);
    const dCO2 = base[tech] ? (there.totalCO2 - here.totalCO2) : (here.totalCO2 - there.totalCO2);
    const tonnes = dCO2 / 1000;
    const perTonne = Math.abs(tonnes) > 0.0005 ? (-dCost / tonnes) : null;
    const note = base[tech] ? '(remove)' : '(add)';
    console.log(`  ${pad(TECH_LABEL[tech], 14)}${lpad(sgbp(dCost), 14)}${lpad(sco2(dCO2), 16)}` +
                `${lpad(perTonne == null ? '—' : (perTonne < 0 ? '−' : '+') + gbp(Math.abs(perTonne)) + '/t', 16)}  ${note}`);
  }
}

// Co-benefit / synergy matrix. For each pair (A,B): saving(A alone) + saving(B
// alone) vs saving(A+B together), both measured against the fossil status quo.
// Positive synergy = the two together save MORE than the sum of their parts.
function cobenefitsReport(p, opts) {
  h2('Co-benefit (synergy) matrix — £/yr saving beyond the sum of the parts' +
     (opts.optimalDispatch ? '  [optimal dispatch]' : ''));
  console.log('  Positive = the pair saves MORE together than separately (a co-benefit).');
  console.log('  Measured vs fossil status quo. Carbon synergy shown in the second grid.\n');
  const sq = run(cfg([]), p, opts).allIn;
  const sqC = run(cfg([]), p, opts).totalCO2;
  const saveAlone = {}, carbonAlone = {};
  for (const t of TECHS) {
    const r = run(cfg([t]), p, opts);
    saveAlone[t] = sq - r.allIn;
    carbonAlone[t] = sqC - r.totalCO2;
  }

  function grid(label, baseVal, aloneMap, valOf) {
    console.log('  ' + label);
    console.log('  ' + pad('', 10) + TECHS.map(t => lpad(TECH_LABEL[t].slice(0, 9), 10)).join(''));
    for (const a of TECHS) {
      let row = '  ' + pad(TECH_LABEL[a].slice(0, 9), 10);
      for (const b of TECHS) {
        if (b === a) { row += lpad('·', 10); continue; }
        const together = baseVal - valOf(run(cfg([a, b]), p, opts));
        const synergy = together - aloneMap[a] - aloneMap[b];
        row += lpad(Math.round(synergy), 10);
      }
      console.log(row);
    }
    console.log('');
  }
  grid('£/yr cost synergy', sq, saveAlone, r => r.allIn);
  grid('kg/yr carbon synergy', sqC, carbonAlone, r => r.totalCO2);
}

// Cumulative ladder: start fossil, switch each tech on in a sensible order and
// show how the marginal saving of each step shifts as the stack grows.
function ladderReport(p, opts) {
  const order = ['ev', 'hp', 'solar', 'battery', 'agile'];
  h2('Build-up ladder — switching technologies on one at a time' +
     (opts.optimalDispatch ? '  [optimal dispatch]' : ''));
  console.log(`  ${pad('Step', 22)}${lpad('All-in £/yr', 14)}${lpad('Δ step', 12)}${lpad('CO₂e/yr', 12)}${lpad('Δ step', 12)}`);
  console.log('  ' + hr('─', 70));
  let on = [];
  let prev = run(cfg([]), p, opts);
  console.log(`  ${pad('fossil status quo', 22)}${lpad(gbp(prev.allIn), 14)}${lpad('—', 12)}${lpad(co2(prev.totalCO2), 12)}${lpad('—', 12)}`);
  for (const t of order) {
    on = on.concat(t);
    const r = run(cfg(on), p, opts);
    console.log(`  ${pad('+ ' + TECH_LABEL[t], 22)}${lpad(gbp(r.allIn), 14)}${lpad(sgbp(-(r.allIn - prev.allIn)), 12)}` +
                `${lpad(co2(r.totalCO2), 12)}${lpad(sco2(-(r.totalCO2 - prev.totalCO2)), 12)}`);
    prev = r;
  }
}

function sweepReport(param, from, to, step, c, p, opts) {
  h2(`Sweep ${param} from ${from} to ${to} step ${step} — build: ${buildName(c)}` +
     (opts.optimalDispatch ? '  [optimal dispatch]' : ''));
  const sq = run(cfg([]), p, opts);
  console.log(`  ${lpad(param, 12)}${lpad('All-in £/yr', 14)}${lpad('Save/yr', 12)}${lpad('CO₂e/yr', 12)}${lpad('Cut/yr', 12)}${lpad('£/tonne', 12)}`);
  console.log('  ' + hr('─', 72));
  for (let v = from; v <= to + 1e-9; v += step) {
    const pp = makeP(Object.assign({}, p, { [param]: v }));
    const r = run(c, pp, opts);
    const save = sq.allIn - r.allIn, cut = sq.totalCO2 - r.totalCO2;
    const perT = Math.abs(cut) > 0.5 ? (-save / (cut / 1000)) : null;
    console.log(`  ${lpad(+v.toFixed(4), 12)}${lpad(gbp(r.allIn), 14)}${lpad(sgbp(save), 12)}` +
                `${lpad(co2(r.totalCO2), 12)}${lpad(sco2(cut), 12)}` +
                `${lpad(perT == null ? '—' : (perT < 0 ? '−' : '') + gbp(Math.abs(perT)), 12)}`);
  }
}

// ---- main -------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const p = makeP(args.p);
  const opts = args.opts;

  if (model.usingSynthetic) console.log('⚠  using SYNTHETIC data (real dataset not found)\n');

  switch (args.cmd) {
    case 'scenario':
      scenarioReport(cfg(args.flags), p, opts);
      break;
    case 'marginals':
      marginalsReport(cfg(args.flags), p, opts);
      break;
    case 'cobenefits':
      cobenefitsReport(p, opts);
      break;
    case 'ladder':
      ladderReport(p, opts);
      break;
    case 'sweep': {
      const [param, from, to, st] = args.positional;
      sweepReport(param, parseFloat(from), parseFloat(to), parseFloat(st), cfg(args.flags), p, opts);
      break;
    }
    case 'report':
    default: {
      console.log(hr('═'));
      console.log('  HOUSEHOLD ENERGY LEDGER — test harness report');
      console.log('  Dataset: real half-hourly year (15-min, ' + model.series[0].data.length + ' samples)');
      console.log(hr('═'));
      scenarioReport(cfg([]), p, opts);
      scenarioReport(cfg(['ev', 'hp', 'solar', 'battery', 'agile']), p, opts);
      marginalsReport(cfg(['ev', 'hp', 'solar', 'battery', 'agile']), p, opts);
      ladderReport(p, opts);
      cobenefitsReport(p, opts);
      console.log('\nTip: node harness.js cobenefits --optimal   (cost-optimised battery dispatch)');
      console.log('     node harness.js sweep batteryKwh 0 15 2.5 solar,battery,agile');
    }
  }
}

main();
