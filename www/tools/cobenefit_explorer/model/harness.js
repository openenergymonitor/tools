#!/usr/bin/env node
// cobenefit_explorer/model/harness.js
//
// Node test harness for the household energy ledger. It wires the real
// 15-minute dataset into model.js and runs the exact ledger logic the browser
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
//   node harness.js shapley [--optimal]             fair per-measure attribution of the full build
//   node harness.js interactions [--optimal]        individual vs combination-specific decomposition
//   node harness.js grid [solarList] [battList]     solar × battery co-benefit grid
//   node harness.js sweep <param> <from> <to> <step> [flags] [--optimal]
//   node harness.js ladder [--optimal]              cumulative build-up ladder (+ investment view)
//
// Build flags are a comma list of: ev, hp, solar, battery, agile  (gas is
// auto-disconnected with hp, mirroring the view). Override any DEFAULTS field
// with --p name=value (repeatable), e.g. --p batteryKwh=10 --p gridIntensity=80.
//
// Reading the code: the file goes bottom-up in dependency order —
//   1. data loading and the memoised model runner
//   2. build configs (cfg) and the one-line ledger call (run)
//   3. number/table formatting helpers
//   4. CLI argument parsing
//   5. the reports, each a pure "compute then print" function
//   6. main(), a switch that dispatches a subcommand to one report

const fs = require('fs');
const path = require('path');

const model = require('./model.js');
const ledger = require('./ledger.js');


// =============================================================================
// 1. Data
// =============================================================================

// The browser fetches this JSON over HTTP; here we read it straight off disk and
// hand it to the same loader the page uses. model._apply() remaps the 8 raw
// series into the layout the simulation expects and normalises them, so from
// this point on model.run() behaves exactly as it does in the view.
const DATA_PATH = path.join(__dirname, 'data.json');

(function loadData() {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    model._apply(raw);
    model.usingSynthetic = false;   // real dataset, not the generated fallback
})();


// =============================================================================
// 2. Running the model and the ledger
// =============================================================================

// A single 15-minute simulation over a full year is by far the most expensive
// thing here, and the coalition reports ask for the same builds over and over
// (32 subsets, each report re-deriving status quo, etc.). So memoise (cache the 
// run result) on the model parameters, exactly as the view's runModel() does. 
// The cache key is the JSON of the parameter object — fine because the object is
// small, flat and always built the same way by ledger.flowsHH().
const modelCache = new Map();

function runModel(mp) {
    const key = JSON.stringify(mp);
    let r = modelCache.get(key);
    if (!r) {
        r = model.run(mp);
        modelCache.set(key, r);
    }
    return r;
}

// The "context" object ledger.compute() expects as its second argument. In the
// browser that object is the Vue component instance itself, but compute() only
// ever reads a handful of properties off it — it never needs a real component.
// So here we hand it a plain object carrying just those properties:
//   p                the parameter set (DEFAULTS plus any --p overrides)
//   runModel         how to run a simulation (our memoised wrapper, above)
//   modelReady       is the dataset loaded? always true — we loaded it up front
//   useHHModel       prefer the 15-minute simulation over annual averages.
//                    Note compute() overrides this and uses the simulation anyway
//                    when the tariff varies in time, since averages cannot price it
//   optimalDispatch  battery uses the perfect-foresight optimiser, not the
//                    simple self-consumption/cheap-rate heuristic
function makeCtx(p, opts) {
    return {
        p,
        useHHModel: opts.useHHModel !== false,   // default on; --annual turns it off
        modelReady: true,
        optimalDispatch: !!opts.optimalDispatch,
        runModel,
    };
}

// Build a config object from a list of flags. A config says which technologies
// are installed and how electricity is priced; everything else lives in `p`.
//
// Two couplings mirror the view's watchers:
//   - a heat pump means the gas supply is disconnected (no standing charge),
//   - the export tariff follows the import tariff unless asked otherwise.
function cfg(flags) {
    const c = {
        ev: false,
        hp: false,
        solar: false,
        battery: false,
        agile: false,
        tariffMode: 'agile',     // 'agile' = the half-hourly price dataset
        exportMode: 'flat',      // 'flat' = fixed p/kWh export rate
        disconnectGas: false,
    };

    flags = flags || [];
    flags.forEach(f => { if (f in c) c[f] = true; });

    // 'custom' flag: a time-varying tariff priced against the user-defined
    // schedule (ledger.DEFAULTS.tariffSchedule) rather than the Agile dataset.
    // It is still "a time-varying tariff", hence agile = true.
    if (flags.includes('custom')) {
        c.agile = true;
        c.tariffMode = 'custom';
    }

    // Export source defaults to match the import (agile→agile, custom→schedule,
    // else flat); the 'outgoing' flag forces the half-hourly Agile Outgoing feed
    // even when importing on the custom schedule.
    c.exportMode = c.agile ? (c.tariffMode === 'custom' ? 'schedule' : 'agile') : 'flat';
    if (flags.includes('outgoing')) c.exportMode = 'agile';

    if (c.hp) c.disconnectGas = true;

    return c;
}

// One build → one full-year result object (costs, flows, carbon). Every report
// below is built out of repeated calls to this.
function run(c, p, opts) {
    return ledger.compute(c, makeCtx(p, opts));
}

// Deep-copy DEFAULTS and apply overrides. Copied because the reports mutate
// parameters when sweeping, and DEFAULTS is shared with the ledger module.
function makeP(overrides) {
    const p = JSON.parse(JSON.stringify(ledger.DEFAULTS));
    Object.assign(p, overrides || {});
    return p;
}


// =============================================================================
// 3. Formatting helpers
// =============================================================================
// Two flavours of each: a plain one, and an "s"-prefixed signed one used for
// deltas, where an explicit + or − matters more than the magnitude.

const gbp  = n => '£' + Math.round(n).toLocaleString('en-GB');
const sgbp = n => (n >= 0 ? '+' : '−') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
const kwh  = n => Math.round(n).toLocaleString('en-GB') + ' kWh';
const co2  = n => Math.round(n).toLocaleString('en-GB') + ' kg';
const sco2 = n => (n >= 0 ? '+' : '−') + Math.abs(Math.round(n)).toLocaleString('en-GB') + ' kg';

// Column padding: pad = left-aligned (labels), lpad = right-aligned (numbers).
const pad  = (s, w) => String(s).padEnd(w);
const lpad = (s, w) => String(s).padStart(w);

// Horizontal rule and a section heading.
function hr(ch = '─', n = 78) {
    return ch.repeat(n);
}

function h2(title) {
    console.log('\n' + title);
    console.log(hr());
}

// The five technologies, in the order used for bitmasks, tables and ladders.
// Changing this order changes the bitmask meaning in the coalition code, but
// nothing else — the masks are always derived from this array.
const TECHS = ['ev', 'hp', 'solar', 'battery', 'agile'];
const TECH_LABEL = { ev: 'EV', hp: 'Heat pump', solar: 'Solar', battery: 'Battery', agile: 'Agile tariff' };

// Human name for a build, e.g. "Solar + Battery + Agile tariff".
function buildName(c) {
    const on = TECHS.filter(t => c[t]).map(t => TECH_LABEL[t]);
    return on.length ? on.join(' + ') : 'fossil status quo';
}

// Every report prints the dispatch mode in its heading, so factor out the tag.
function dispatchTag(opts) {
    return opts.optimalDispatch ? '  [optimal dispatch]' : '';
}


// =============================================================================
// 4. Argument parsing
// =============================================================================
// Deliberately tiny and positional — no dependencies. Anything that is not a
// recognised switch and not a build-flag list is collected as a positional
// argument for the subcommand to interpret (sweep ranges, grid lists, …).
function parseArgs(argv) {
    const out = {
        cmd: argv[0] || 'report',
        positional: [],
        flags: [],
        p: {},        // --p overrides for the parameter set
        opts: {},     // switches that change how the model is run
    };

    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];

        if (a === '--optimal') {
            out.opts.optimalDispatch = true;
        } else if (a === '--annual') {
            out.opts.useHHModel = false;
        } else if (a === '--p') {
            // "--p name=value": the value is always numeric.
            const kv = argv[++i].split('=');
            out.p[kv[0]] = parseFloat(kv[1]);
        } else if (a.startsWith('--p=')) {
            // "--p=name=value", the same thing written as one token.
            const kv = a.slice(4).split('=');
            out.p[kv[0]] = parseFloat(kv[1]);
        } else if (a.includes(',') || TECHS.includes(a)) {
            // A build-flag list, e.g. "solar,battery,agile" or a lone "solar".
            out.flags = a.split(',').filter(Boolean);
        } else {
            out.positional.push(a);
        }
    }

    return out;
}


// =============================================================================
// 5. Reports
// =============================================================================

// -----------------------------------------------------------------------------
// One build, in full: energy flows, then money, then carbon — each block also
// compared against the fossil status quo so the numbers have a reference point.
// -----------------------------------------------------------------------------
function scenarioReport(c, p, opts) {
    const r = run(c, p, opts);
    const sq = run(cfg([]), p, opts);

    // Local row printer: label left-aligned in 26 cols, value right-aligned in
    // 14, plus an optional trailing note.
    const row = (label, value, note) => console.log(`  ${pad(label, 26)} ${lpad(value, 14)}${note || ''}`);

    h2('Scenario: ' + buildName(c) + dispatchTag(opts));

    // ---- energy ----
    row('Demand (electric)', kwh(r.demand));
    row('  EV', kwh(r.evElec));
    row('  Heat pump', kwh(r.hpElec));
    row('Solar generation', kwh(r.solarGen));
    row('  self-consumed', kwh(r.solarSelf) + ` (${r.selfPct}%)`);
    row('  exported', kwh(r.solarExport));
    row('Grid import', kwh(r.gridImport));

    // Only meaningful on a time-varying tariff: the consumption-weighted average
    // price actually paid/received, which is what shifting load is trying to move.
    if (r.avgAgileImport != null || r.avgAgileExport != null) {
        const imp = r.avgAgileImport != null ? r.avgAgileImport.toFixed(1) : 'flat';
        const exp = r.avgAgileExport != null ? r.avgAgileExport.toFixed(1) : 'flat';
        const name = c.tariffMode === 'custom' ? 'custom' : 'Agile';
        row('Avg ' + name + ' import/export', imp + ' / ' + exp + ' p/kWh');
    }

    // ---- money: running costs + annualised capital = the all-in figure ----
    console.log(hr('·'));
    row('Running cost', gbp(r.running));
    row('Annualised assets', gbp(r.assets));
    row('ALL-IN £/yr', gbp(r.allIn), '   vs status quo ' + sgbp(-(r.allIn - sq.allIn)) + '/yr');

    // ---- carbon: operational + embodied, on the same all-in basis ----
    console.log(hr('·'));
    row('Operational CO₂e', co2(r.opCO2));
    row('Embodied CO₂e (amortised)', co2(r.embCO2));
    row('TOTAL CO₂e/yr', co2(r.totalCO2), '   vs status quo ' + sco2(-(r.totalCO2 - sq.totalCO2)) + '/yr');

    return r;
}

// -----------------------------------------------------------------------------
// Marginal contribution of each tech, GIVEN a base build: the £/yr and kg/yr
// effect of flipping it on (or off if it is already in the base), plus £/tonne.
//
// This is the "what does adding X do here?" view, and the answer depends on the
// base — that dependence is precisely the co-benefit the tool is about.
// -----------------------------------------------------------------------------
function marginalsReport(base, p, opts) {
    h2('Marginal contribution of each technology — base: ' + buildName(base) + dispatchTag(opts));

    const here = run(base, p, opts);

    console.log(`  ${pad('Technology', 14)}${lpad('Δ cost/yr', 14)}${lpad('Δ carbon/yr', 16)}${lpad('£/tonne CO₂e', 16)}`);
    console.log('  ' + hr('─', 58));

    for (const tech of TECHS) {
        // ledger.flipCfg keeps the coupled fields consistent (hp ↔ disconnectGas).
        const flipped = ledger.flipCfg(base, tech);
        const there = run(flipped, p, opts);

        // Sign convention: + means this step saves money / cuts carbon. When the
        // tech is already in the base we are measuring its removal, so the
        // difference is taken the other way round.
        const dCost = base[tech] ? (there.allIn - here.allIn) : (here.allIn - there.allIn);
        const dCO2  = base[tech] ? (there.totalCO2 - here.totalCO2) : (here.totalCO2 - there.totalCO2);

        // Cost of carbon: £ spent per tonne abated. Negative = it saves money AND
        // carbon. Undefined when the carbon change is ~zero (divide by nothing).
        const tonnes = dCO2 / 1000;
        const perTonne = Math.abs(tonnes) > 0.0005 ? (-dCost / tonnes) : null;

        const perTonneTxt = perTonne == null
            ? '—'
            : (perTonne < 0 ? '−' : '+') + gbp(Math.abs(perTonne)) + '/t';
        const note = base[tech] ? '(remove)' : '(add)';

        console.log(`  ${pad(TECH_LABEL[tech], 14)}${lpad(sgbp(dCost), 14)}${lpad(sco2(dCO2), 16)}` +
                    `${lpad(perTonneTxt, 16)}  ${note}`);
    }
}

// -----------------------------------------------------------------------------
// Co-benefit / synergy matrix. For each pair (A,B): saving(A alone) + saving(B
// alone) vs saving(A+B together), both measured against the fossil status quo.
// Positive synergy = the two together save MORE than the sum of their parts.
//
// The matrix is symmetric (synergy of A,B equals B,A) — it is printed in full
// anyway because a square grid is easier to scan than a triangle.
// -----------------------------------------------------------------------------
function cobenefitsReport(p, opts) {
    h2('Co-benefit (synergy) matrix — £/yr saving beyond the sum of the parts' + dispatchTag(opts));
    console.log('  Positive = the pair saves MORE together than separately (a co-benefit).');
    console.log('  Measured vs fossil status quo. Carbon synergy shown in the second grid.\n');

    const statusQuo = run(cfg([]), p, opts);
    const sq = statusQuo.allIn;
    const sqC = statusQuo.totalCO2;

    // Each technology's standalone saving, the baseline the pair is judged against.
    const saveAlone = {};
    const carbonAlone = {};
    for (const t of TECHS) {
        const r = run(cfg([t]), p, opts);
        saveAlone[t] = sq - r.allIn;
        carbonAlone[t] = sqC - r.totalCO2;
    }

    // One grid, parameterised by which quantity we are reading off each result.
    //   baseVal   the status-quo value of that quantity
    //   aloneMap  standalone savings, keyed by tech
    //   valOf     pulls the quantity out of a result object
    function grid(label, baseVal, aloneMap, valOf) {
        console.log('  ' + label);
        console.log('  ' + pad('', 10) + TECHS.map(t => lpad(TECH_LABEL[t].slice(0, 9), 10)).join(''));

        for (const a of TECHS) {
            let row = '  ' + pad(TECH_LABEL[a].slice(0, 9), 10);
            for (const b of TECHS) {
                if (b === a) {
                    row += lpad('·', 10);      // a tech has no synergy with itself
                    continue;
                }
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

// -----------------------------------------------------------------------------
// Cumulative ladder: start fossil, switch each tech on in a sensible order and
// show how the marginal saving of each step shifts as the stack grows.
//
// Printed twice over the same steps: first the running totals, then the
// investment view (what each step costs and what it earns given the steps below).
// -----------------------------------------------------------------------------
function ladderReport(p, opts) {
    const order = ['ev', 'hp', 'solar', 'battery', 'agile'];

    h2('Build-up ladder — switching technologies on one at a time' + dispatchTag(opts));

    // ---- pass 1: all-in cost and carbon after each step ----
    console.log(`  ${pad('Step', 22)}${lpad('All-in £/yr', 14)}${lpad('Δ step', 12)}${lpad('CO₂e/yr', 12)}${lpad('Δ step', 12)}`);
    console.log('  ' + hr('─', 70));

    let on = [];
    let prev = run(cfg([]), p, opts);
    console.log(`  ${pad('fossil status quo', 22)}${lpad(gbp(prev.allIn), 14)}${lpad('—', 12)}${lpad(co2(prev.totalCO2), 12)}${lpad('—', 12)}`);

    for (const t of order) {
        on = on.concat(t);
        const r = run(cfg(on), p, opts);
        // Δ columns are savings, so negate the change in cost/carbon.
        console.log(`  ${pad('+ ' + TECH_LABEL[t], 22)}${lpad(gbp(r.allIn), 14)}${lpad(sgbp(-(r.allIn - prev.allIn)), 12)}` +
                    `${lpad(co2(r.totalCO2), 12)}${lpad(sco2(-(r.totalCO2 - prev.totalCO2)), 12)}`);
        prev = r;
    }

    // ---- pass 2: investment view of the same ladder ----
    // Each step's own extra capital vs the running-cost saving it adds GIVEN the
    // steps below it (mirrors the page's per-step payback / IRR / crossover).
    // Note this uses running cost, not all-in: the capital is the thing being
    // invested, so counting its annualised form as a cost too would double-count.
    console.log('');
    console.log(`  ${pad('Step (investment view)', 22)}${lpad('Extra upfront', 15)}${lpad('Δ running/yr', 14)}${lpad('Payback', 11)}${lpad('IRR', 9)}${lpad('ISA xover', 11)}`);
    console.log('  ' + hr('─', 80));

    on = [];
    prev = run(cfg([]), p, opts);

    for (const t of order) {
        const before = cfg(on);
        on = on.concat(t);
        const after = cfg(on);
        const r = run(after, p, opts);

        // extraUpfront is cumulative for a build, so this step's own capital is
        // the difference between the build with and without it.
        const stepUp = ledger.extraUpfront(p, after) - ledger.extraUpfront(p, before);
        const stepSave = prev.running - r.running;
        const inv = ledger.investment(p, stepUp, stepSave);

        // A step that costs nothing (e.g. switching tariff) pays back immediately;
        // one that never pays back gets a dash rather than a misleading number.
        const payback = inv.payback == null ? '—'
            : (inv.payback === 0 ? 'immediate' : inv.payback.toFixed(1) + 'y');
        const irrTxt = inv.irr == null ? '—'
            : (inv.irr >= 1 ? '>100%' : (inv.irr * 100).toFixed(0) + '%');
        // ISA crossover: the year the reinvested savings overtake putting the same
        // money in a savings account instead.
        const xover = (stepUp <= 0 || stepSave <= 0) ? '—'
            : (inv.crossover == null ? '>' + p.investHorizon + 'y' : 'yr ' + inv.crossover);

        console.log(`  ${pad('+ ' + TECH_LABEL[t], 22)}${lpad(gbp(stepUp), 15)}${lpad(sgbp(stepSave), 14)}` +
                    `${lpad(payback, 11)}${lpad(irrTxt, 9)}${lpad(xover, 11)}`);
        prev = r;
    }
}


// -----------------------------------------------------------------------------
// Coalition analysis (Shapley + Möbius interactions)
// -----------------------------------------------------------------------------
// Treat the five technologies as players in a cooperative game. The value of a
// coalition (subset) is its saving vs the fossil status quo. Once every subset
// has been evaluated, standard cooperative-game maths answers two questions:
//   - Shapley: what share of the full build's saving does each measure deserve?
//   - Möbius:  how much of the saving is standalone vs specific combinations?
//
// A subset is encoded as a bitmask over TECHS: bit i set = TECHS[i] installed.
// There are only 2^5 = 32 subsets, and runModel memoises, so enumerating them
// all is cheap and both analyses share the same runs.
// -----------------------------------------------------------------------------

// v(S) for every subset S, as a Map from bitmask to { cost, carbon } savings.
function coalitionValues(p, opts) {
    const sq = run(cfg([]), p, opts);
    const v = new Map();

    for (let mask = 0; mask < (1 << TECHS.length); mask++) {
        const techs = TECHS.filter((_, i) => mask & (1 << i));
        const r = run(cfg(techs), p, opts);
        v.set(mask, {
            cost: sq.allIn - r.allIn,          // + = cheaper than status quo
            carbon: sq.totalCO2 - r.totalCO2,  // + = less carbon than status quo
        });
    }

    return v;
}

// Bit helpers over those masks.
const popcount = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
const maskTechs = m => TECHS.filter((_, i) => m & (1 << i));
const maskLabel = m => maskTechs(m).map(t => TECH_LABEL[t]).join(' + ') || '∅';

// Möbius transform of a set function v:  m(S) = Σ_{T⊆S} (−1)^{|S\T|} v(T).
//
// It answers "how much of v(S) is NEW to S, over and above every sub-coalition?"
// So m({i}) is the standalone saving, m({i,j}) the pairwise synergy, and higher
// terms the irreducible 3-/4-/5-way synergies. By construction they sum back to
// v(full build), which is what makes the decomposition report add up.
//
// The inner loop is the standard "iterate all subsets of S" trick:
// T = (T − 1) & S walks S's subsets downwards, ending at 0.
function mobius(vMap, field) {
    const m = new Map();

    for (let S = 0; S < (1 << TECHS.length); S++) {
        let sum = 0;
        for (let T = S; ; T = (T - 1) & S) {
            // S ^ T is the part of S missing from T; its size sets the sign.
            sum += (popcount(S ^ T) % 2 ? -1 : 1) * vMap.get(T)[field];
            if (T === 0) break;
        }
        m.set(S, sum);
    }

    return m;
}

// Shapley value: each interaction m(S) is shared equally among the |S| members,
// so φ_i = Σ_{S∋i} m(S)/|S|. Because the Möbius terms sum to the full-build
// value, the φ_i do too — the "efficiency" property. This is the same number the
// usual all-orderings definition gives (averaging over all 5! = 120 build
// orders), just computed from the interaction terms instead.
function shapley(mob) {
    const phi = TECHS.map(() => 0);

    for (const [S, val] of mob) {
        if (S === 0) continue;                 // the empty coalition is worth nothing
        const k = popcount(S);
        for (let i = 0; i < TECHS.length; i++) {
            if (S & (1 << i)) phi[i] += val / k;
        }
    }

    return phi;
}

// Fair attribution of the whole-build saving across the five measures, and how
// much of each measure's credit is "standalone" vs "only there in combination".
function shapleyReport(p, opts) {
    const full = (1 << TECHS.length) - 1;      // all five bits set
    const v = coalitionValues(p, opts);

    h2('Shapley attribution — fair share of the FULL build saving per measure' + dispatchTag(opts));
    console.log('  Averaged over all 120 build orders. Standalone = the measure on its own;');
    console.log('  Synergy = Shapley − standalone (value it only has alongside the others).\n');

    // Same table twice: once in money, once in carbon.
    const views = [
        ['cost', sgbp, v.get(full).cost, '£/yr saving vs status quo'],
        ['carbon', sco2, v.get(full).carbon, 'kg/yr carbon saving vs status quo'],
    ];

    for (const [field, fmt, total, label] of views) {
        const mob = mobius(v, field);
        const phi = shapley(mob);

        console.log('  ' + label);
        console.log('  ' + pad('Measure', 14) + lpad('Standalone', 13) + lpad('Shapley', 13) +
                    lpad('Synergy', 13) + lpad('% of total', 12));
        console.log('  ' + hr('─', 63));

        let sumAlone = 0;
        let sumPhi = 0;

        TECHS.forEach((t, i) => {
            const alone = v.get(1 << i)[field];    // the singleton coalition
            sumAlone += alone;
            sumPhi += phi[i];
            console.log('  ' + pad(TECH_LABEL[t], 14) + lpad(fmt(alone), 13) + lpad(fmt(phi[i]), 13) +
                        lpad(fmt(phi[i] - alone), 13) + lpad((100 * phi[i] / total).toFixed(0) + '%', 12));
        });

        console.log('  ' + hr('─', 63));
        console.log('  ' + pad('TOTAL', 14) + lpad(fmt(sumAlone), 13) + lpad(fmt(sumPhi), 13) +
                    lpad(fmt(sumPhi - sumAlone), 13) + lpad('100%', 12));
        console.log('  (TOTAL Shapley = full-build saving ' + fmt(total) + '; ' +
                    'TOTAL synergy = full build − sum of standalones)\n');
    }
}

// Decompose the full-build saving into pure individual effects + 2-/3-/4-/5-way
// synergies (the Möbius terms grouped by coalition size). This is the direct
// answer to "how much is the measures themselves vs specific combinations".
function interactionsReport(p, opts) {
    const v = coalitionValues(p, opts);

    h2('Interaction decomposition — individual vs combination-specific saving' + dispatchTag(opts));
    console.log('  Splits the full-build saving into order-1 (each measure alone) plus the');
    console.log('  irreducible order-2..5 synergies. Each row sums into the total below.\n');

    const orderNames = [
        '',                        // order 0 (the empty set) is never printed
        'order-1  individual',
        'order-2  pairs',
        'order-3  triples',
        'order-4  quads',
        'order-5  all five',
    ];

    for (const [field, fmt, label] of [['cost', sgbp, '£/yr'], ['carbon', sco2, 'kg/yr carbon']]) {
        const mob = mobius(v, field);

        // Sum the interaction terms by coalition size: byOrder[k] is everything
        // that only appears once k specific measures are present together.
        const byOrder = [0, 0, 0, 0, 0, 0];
        for (const [S, val] of mob) {
            if (S) byOrder[popcount(S)] += val;
        }

        // The orders sum to the full-build saving (the Möbius property).
        const total = byOrder.reduce((a, b) => a + b, 0);

        console.log('  ' + label);
        for (let k = 1; k <= 5; k++) {
            console.log('  ' + pad(orderNames[k], 22) + lpad(fmt(byOrder[k]), 13) +
                        lpad((100 * byOrder[k] / total).toFixed(0) + '%', 10));
        }

        console.log('  ' + hr('─', 45));
        console.log('  ' + pad('FULL BUILD', 22) + lpad(fmt(total), 13) + lpad('100%', 10));

        // Everything above order 1 is, by definition, synergy.
        const synergy = total - byOrder[1];
        console.log('  ' + pad('  of which synergy', 22) + lpad(fmt(synergy), 13) +
                    lpad((100 * synergy / total).toFixed(0) + '%', 10));

        // The notable named combinations the research question asks about. Each
        // number is that exact set's own Möbius term — its irreducible synergy,
        // not including anything its subsets already explain.
        const pick = combo => mob.get(combo.reduce((m, t) => m | (1 << TECHS.indexOf(t)), 0));
        const named = [
            ['Solar + Battery', ['solar', 'battery']],
            ['Solar + Battery + Heat pump  (the "holy trinity")', ['solar', 'battery', 'hp']],
            ['Solar + Battery + EV', ['solar', 'battery', 'ev']],
            ['Battery + Agile', ['battery', 'agile']],
            ['Solar + Battery + Agile', ['solar', 'battery', 'agile']],
        ];

        console.log('    named combination-specific terms (pure synergy of that exact set):');
        for (const [nm, combo] of named) {
            console.log('      ' + pad(nm, 50) + lpad(fmt(pick(combo)), 12));
        }
        console.log('');
    }
}

// -----------------------------------------------------------------------------
// Solar × Battery co-benefit grid, focused on the Solar+Battery+Heat-pump
// question in a fixed tariff world. The base is "Agile only" (tariff on, no
// solar/battery/hp, EV off), and every build sits on that base, so the synergies
// are measured GIVEN you already have Agile. For each (solarKwp, batteryKwh) cell
// it reports, vs that Agile base:
//   S+B+H save   total £/yr saving of having all three
//   combo syn    that saving minus the sum of S, B, H added separately
//                (the headline co-benefit of the combination)
//   3-way        the irreducible solar×battery×heat-pump interaction (Möbius)
//   SB / SH / BH the three pairwise synergies that make up the rest of combo syn
// -----------------------------------------------------------------------------
function gridReport(p, opts, positional) {
    // Optional positional arguments: comma-separated sizes to sweep over.
    const parseList = (s, d) => (s ? s.split(',').map(Number) : d);
    const sList = parseList(positional[0], [2, 4, 6, 8]);        // solar kWp
    const bList = parseList(positional[1], [5, 7.5, 10]);        // battery kWh

    h2('Solar × Battery co-benefit grid — on an Agile base (EV off)' + dispatchTag(opts));
    console.log('  Saving & synergy vs "Agile only". combo syn = S+B+H together − (S + B + H apart).');
    console.log('  3-way = pure solar×battery×heat-pump interaction. SB/SH/BH = pairwise synergies.\n');
    console.log('  ' + pad('solar', 7) + pad('batt', 7) +
                lpad('S+B+H save', 12) + lpad('combo syn', 11) + lpad('3-way', 9) +
                lpad('SB', 8) + lpad('SH', 8) + lpad('BH', 8));
    console.log('  ' + hr('─', 68));

    for (const s of sList) {
        for (const b of bList) {
            // A parameter set with this cell's sizes; everything else as given.
            const pp = makeP(Object.assign({}, p, { solarKwp: s, batteryKwh: b }));

            // Every build in this cell keeps 'agile' on, so the base cancels out
            // of the synergy arithmetic and only solar/battery/hp interactions remain.
            const base = run(cfg(['agile']), pp, opts).allIn;
            const save = set => base - run(cfg(set.concat('agile')), pp, opts).allIn;

            const S = save(['solar']), B = save(['battery']), H = save(['hp']);
            const SB = save(['solar', 'battery']), SH = save(['solar', 'hp']), BH = save(['battery', 'hp']);
            const SBH = save(['solar', 'battery', 'hp']);

            const combo = SBH - S - B - H;                    // total synergy among the three
            const synSB = SB - S - B, synSH = SH - S - H, synBH = BH - B - H;
            // Inclusion–exclusion: strip the pairwise terms back out of the triple
            // to leave only what needs all three present at once.
            const threeWay = SBH - SB - SH - BH + S + B + H;

            console.log('  ' + pad(s + 'kWp', 7) + pad(b + 'kWh', 7) +
                        lpad(sgbp(SBH), 12) + lpad(sgbp(combo), 11) + lpad(sgbp(threeWay), 9) +
                        lpad(sgbp(synSB), 8) + lpad(sgbp(synSH), 8) + lpad(sgbp(synBH), 8));
        }
    }

    console.log('\n  Reading it: combo syn = SB + SH + BH + 3-way. A near-zero combo syn means the' +
                '\n  three measures barely help each other — their value is essentially standalone.');
}

// -----------------------------------------------------------------------------
// Sensitivity sweep: hold the build fixed, vary one parameter, and watch the
// saving and cost-of-carbon move. Useful for "how big should the battery be?" or
// "at what grid intensity does the heat pump stop cutting carbon?".
// -----------------------------------------------------------------------------
function sweepReport(param, from, to, step, c, p, opts) {
    h2(`Sweep ${param} from ${from} to ${to} step ${step} — build: ${buildName(c)}` + dispatchTag(opts));

    const sq = run(cfg([]), p, opts);

    console.log(`  ${lpad(param, 12)}${lpad('All-in £/yr', 14)}${lpad('Save/yr', 12)}${lpad('CO₂e/yr', 12)}${lpad('Cut/yr', 12)}${lpad('£/tonne', 12)}`);
    console.log('  ' + hr('─', 72));

    // The 1e-9 slack keeps the final step in despite floating-point drift when
    // `step` is something like 2.5 or 0.1.
    for (let v = from; v <= to + 1e-9; v += step) {
        const pp = makeP(Object.assign({}, p, { [param]: v }));
        const r = run(c, pp, opts);

        const save = sq.allIn - r.allIn;
        const cut = sq.totalCO2 - r.totalCO2;
        // Skip £/tonne when the carbon change is negligible — it would blow up.
        const perT = Math.abs(cut) > 0.5 ? (-save / (cut / 1000)) : null;
        const perTtxt = perT == null ? '—' : (perT < 0 ? '−' : '') + gbp(Math.abs(perT));

        // +v.toFixed(4) trims accumulated float noise (0.30000000000000004 → 0.3).
        console.log(`  ${lpad(+v.toFixed(4), 12)}${lpad(gbp(r.allIn), 14)}${lpad(sgbp(save), 12)}` +
                    `${lpad(co2(r.totalCO2), 12)}${lpad(sco2(cut), 12)}${lpad(perTtxt, 12)}`);
    }
}


// =============================================================================
// 6. Main
// =============================================================================
function main() {
    const args = parseArgs(process.argv.slice(2));
    const p = makeP(args.p);
    const opts = args.opts;

    // Should never fire — loadData() sets the flag — but if data.json is ever
    // swapped for the synthetic fallback the numbers must not be trusted.
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

        case 'shapley':
            shapleyReport(p, opts);
            break;

        case 'interactions':
        case 'interaction':
            interactionsReport(p, opts);
            break;

        case 'grid':
            gridReport(p, opts, args.positional);
            break;

        case 'ladder':
            ladderReport(p, opts);
            break;

        case 'sweep': {
            const [param, from, to, st] = args.positional;
            sweepReport(param, parseFloat(from), parseFloat(to), parseFloat(st), cfg(args.flags), p, opts);
            break;
        }

        // The default: everything worth seeing in one pass, ordered so each
        // section builds on the last — a single build, then how it decomposes.
        case 'report':
        default: {
            console.log(hr('═'));
            console.log('  HOUSEHOLD ENERGY LEDGER — test harness report');
            console.log('  Dataset: real 15-minute year (' + model.series[0].data.length + ' samples)');
            console.log(hr('═'));

            scenarioReport(cfg([]), p, opts);                                    // where we start
            scenarioReport(cfg(['ev', 'hp', 'solar', 'battery', 'agile']), p, opts);   // where we end up
            marginalsReport(cfg(['ev', 'hp', 'solar', 'battery', 'agile']), p, opts);  // what each part is worth there
            ladderReport(p, opts);                                               // the path between them
            cobenefitsReport(p, opts);                                           // pairwise interactions
            shapleyReport(p, opts);                                              // fair per-measure credit
            interactionsReport(p, opts);                                         // individual vs combination

            console.log('\nTip: node harness.js interactions --optimal  (individual vs combination-specific saving)');
            console.log('     node harness.js shapley --optimal       (fair per-measure attribution)');
            console.log('     node harness.js sweep batteryKwh 0 15 2.5 solar,battery,agile');
        }
    }
}

main();
