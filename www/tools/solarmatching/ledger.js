// solarmatching/ledger.js
//
// The household cost & carbon ledger, extracted from energy-ledger.html so the
// same logic can run both in the browser (the Vue view) and in Node (the test
// harness, harness.js). Everything here is pure: functions take a parameter
// object `p`, a build config `c`, and a small context `ctx`, and return plain
// results. Nothing reads globals except the optional half-hourly model, which is
// reached only through ctx.runModel.
//
// Layering:
//   model.js   – half-hourly solar/battery/EV/heat-pump simulation
//   ledger.js  – annual cost & carbon ledger built on top of those flows  <-- here
//   the view / the harness – wire parameters in and present the results
//
// ctx fields used by compute():
//   p               the full parameter object (DEFAULTS shape)
//   useHHModel      use the half-hourly simulation for solar/battery flows
//   modelReady      the half-hourly dataset has loaded
//   optimalDispatch battery uses the cost-optimised Agile DP dispatch
//   runModel(mp)    run model.js for the mapped params (caller memoises)

(function (root, factory) {
    var ledger = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = ledger; // Node
    if (root) root.ledger = ledger;                                               // browser
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

    var LITRES_PER_GALLON = 4.54609;

    var DEFAULTS = {
        // prices — unit rates p/kWh, standing charges p/day, all inc. VAT (retail
        // price-cap figures as quoted to domestic customers). The Agile import
        // feed is the one exception: it is stored ex-VAT and grossed up in
        // model.js _apply.
        elecRate: 26.11, elecStanding: 57.19, gasRate: 7.33, gasStanding: 29.04, segRate: 12,
        // user-defined tariff schedule (used when cfg.tariffMode==='custom'). Each
        // band carries an import `price` and an `export` rate (p/kWh, inc. VAT) that
        // apply from its start time until the next, wrapping past midnight. Default
        // mirrors Octopus Go: a cheap overnight window (00:30–05:30) with a flat day
        // rate the rest of the time (the pre-00:30 minutes wrap back to the day band).
        tariffSchedule: [
            { start: '00:30', price: 9.5, export: 12 },
            { start: '05:30', price: 35.73, export: 12 },
        ],
        // home energy
        gasTotal: 11500, heatingPct: 77, waterPct: 20, cookingPct: 3, boilerEff: 0.90, elecBaseload: 2700,
        // petrol car
        mileage: 12000, mpg: 48, petrolPrice: 1.55, carPrice: 12500, carLife: 10, carResidual: 1500, carMaint: 750,
        // boiler
        boilerPrice: 3000, boilerLife: 15, boilerService: 100, boilerRepairs: 70,
        // EV
        evEfficiency: 4.0, evChargeStart: 0.5, evChargeEnd: 7, evPrice: 13500, evLife: 10, evResidual: 2000, evMaint: 300, evBatteryKwh: 64,
        // heat pump
        scop: 4.0, hpPrice: 12000, busGrant: 7500, hpLife: 18, hpUpkeep: 200, inductionEff: 0.6,
        // solar — install cost modelled as a fixed component (scaffolding, inverter,
        // design, MCS, labour) plus a marginal £/kWp for panels & mounting, so the
        // £/kWp falls with system size. Fit to Octopus quotes: 5 kWp £7.5k, 8 kWp
        // £10.9k, 16.4 kWp £18k.
        solarKwp: 4, genPerKwp: 950, solarFixed: 2800, solarPerKwp: 670, solarLife: 25, solarMaint: 30,
        // battery — fixed component (hybrid inverter, install) plus a marginal £/kWh
        // for cells, so the £/kWh falls with capacity. Anchored to a 13.5 kWh
        // Powerwall add-on (~£4.1k) with a 5 kWh budget add-on (~£1.2k) as the floor.
        batteryKwh: 5, batteryFixed: 500, batteryPerKwh: 250, batteryLife: 15, batteryUtil: 0.8,
        // battery performance — inverter power limit (kW) and round-trip efficiency (0-1)
        batteryMaxPowerKw: 3.5, batteryRoundTrip: 0.8,
        // discounting — real (above-inflation) discount rate, %/yr, applied to capital
        discountRate: 3,
        // investment metrics — for the simple payback / IRR / ISA-crossover view
        isaReturn: 5,                 // assumed real return on a shares ISA, %/yr
        investHorizon: 20,            // years over which the extra capital's savings accrue
        // advanced — annual solar-matching estimate (used when the half-hourly model is off)
        daytimeFrac: 0.40, directMatch: 0.70,
        // carbon — operational emission factors
        petrolKgPerL: 2.9,            // well-to-wheel: ~2.3 combustion + ~0.6 upstream
        gasCombustionKg: 0.183,       // DEFRA 2025 combustion, kgCO2e/kWh
        gasUpstreamPct: 20,           // upstream/methane uplift on combustion (GWP100, UK pipe+LNG mix)
        gridIntensity: 75,            // gCO2/kWh, UK generation average — conservative forward figure (2024-25 actual ~125, falling toward ~50 by 2030)
        marginalIntensity: 400,       // gCO2/kWh, gas (CCGT) displaced by exported solar
        // carbon — embodied factors
        gliderEmbodied: 6500,         // kgCO2e to build a car ex-battery (≈ same for petrol & EV)
        batteryCO2PerKwh: 75,         // kgCO2e per kWh of cell (IVL central 61-100)
        vehicleLifeCarbon: 20,        // yrs to amortise vehicle embodied carbon over
        boilerEmbodied: 150,          // kgCO2e to manufacture a gas boiler
        hpEmbodied: 735,              // kgCO2e to manufacture a heat pump incl. refrigerant
        solarLifecycleCO2: 30,        // gCO2e/kWh lifecycle (manufacturing of panels)
    };

    // Ready-made schedules for the custom-tariff builder. Each is a list of
    // { start: 'HH:MM', price, export } bands (p/kWh inc. VAT) where a band holds
    // until the next, wrapping past midnight. Picking a preset copies its schedule
    // into p.tariffSchedule (then still editable) and sets the daily standing charge
    // (p/day inc. VAT). Go/Cosy have no published time-of-use export rate, so they use
    // a flat 12p SEG export across every band. The `agile` entry carries only a
    // standing charge — the Agile import feed has no editable schedule — so it has no
    // preset button; it's applied when the Agile import option is chosen.
    var TARIFF_PRESETS = {
        agile: { label: 'Octopus Agile', standing: 65.84 },
        // Octopus Go: a cheap overnight window (00:30–05:30) with a flat day rate.
        go: {
            label: 'Octopus Go',
            standing: 69.7,
            schedule: [
                { start: '00:30', price: 9.5, export: 12 },
                { start: '05:30', price: 35.73, export: 12 },
            ],
        },
        // Octopus Cosy: three cheap windows (04:00–07:00, 13:00–16:00, 22:00–00:00),
        // a teatime peak (16:00–19:00) and a flat day rate in between. The 22:00 cheap
        // band runs to midnight; the explicit 00:00 day band then resumes the day rate
        // through to the 04:00 cheap window.
        cosy: {
            label: 'Octopus Cosy',
            standing: 69.7,
            schedule: [
                { start: '00:00', price: 33.22, export: 12 },
                { start: '04:00', price: 16.29, export: 12 },
                { start: '07:00', price: 33.22, export: 12 },
                { start: '13:00', price: 16.29, export: 12 },
                { start: '16:00', price: 49.83, export: 12 },
                { start: '19:00', price: 33.22, export: 12 },
                { start: '22:00', price: 16.29, export: 12 },
            ],
        },
        // Octopus Flux: import & export both vary by time. A cheap overnight flux
        // window (02:00–05:00) to charge a battery, a teatime peak (16:00–19:00) with
        // a high export rate to sell into, and a flat day rate either side.
        flux: {
            label: 'Octopus Flux',
            standing: 68,
            schedule: [
                { start: '00:00', price: 26.79, export: 10.54 },
                { start: '02:00', price: 16.08, export: 5.12 },
                { start: '05:00', price: 26.79, export: 10.54 },
                { start: '16:00', price: 37.52, export: 30.68 },
                { start: '19:00', price: 26.79, export: 10.54 },
            ],
        },
    };

    // Equivalent annual cost of a lumpy capital sum, spread over its life.
    // With a discount rate it uses the capital-recovery (annuity) factor so money
    // spent today weighs more than money spent years out, and discounts the
    // end-of-life resale value back to today. At rate 0 this collapses to plain
    // straight-line spreading: (price − residual) / life.
    function ann(p, price, residual, life) {
        if (life <= 0) return 0;
        var r = (p.discountRate || 0) / 100;
        if (r <= 0) return (price - residual) / life;
        var crf = r * Math.pow(1 + r, life) / (Math.pow(1 + r, life) - 1);   // capital recovery factor
        var pvResidual = residual / Math.pow(1 + r, life);                   // resale received at end of life
        return crf * (price - pvResidual);
    }

    // Capacity-dependent capital cost: a fixed install component plus a marginal
    // per-unit rate. Because the fixed part is spread over more capacity, the
    // effective £/kWp (solar) and £/kWh (battery) fall as the system grows —
    // economies of scale. Returns the gross install price (pre-discounting).
    function solarCapital(p) {
        return (p.solarFixed || 0) + (p.solarPerKwp || 0) * p.solarKwp;
    }
    function batteryCapital(p) {
        return (p.batteryFixed || 0) + (p.batteryPerKwh || 0) * p.batteryKwh;
    }

    // ---- investment metrics (pure; ported from the view / solar-finance.js) ----
    // These power the simple homeowner-style payback / IRR / ISA-crossover view:
    // the EXTRA upfront capital (beyond a like-for-like petrol-car / boiler swap)
    // is the investment, and the drop in RUNNING costs is the annual return.

    // Net present value of a constant yearly saving against an upfront outlay.
    function npv(rate, upfront, yearly, years) {
        var total = -upfront;
        for (var t = 1; t <= years; t++) total += yearly / Math.pow(1 + rate, t);
        return total;
    }
    // Internal rate of return — the rate at which NPV is zero — by bisection over
    // 0–100%. Returns 1 (">100%") when the return exceeds the search cap.
    function irr(upfront, yearly, years) {
        if (npv(1, upfront, yearly, years) > 0) return 1;
        var lo = 0, hi = 1;
        for (var i = 0; i < 100; i++) {
            var mid = (lo + hi) / 2;
            if (npv(mid, upfront, yearly, years) > 0) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }
    // A lump sum left to compound at `rate`.
    function isaLumpSum(principal, rate, years) { return principal * Math.pow(1 + rate, years); }
    // Future value of investing each year's saving as it arrives (annuity FV).
    function reinvestedSavings(yearly, rate, years) {
        var pot = 0;
        for (var t = 1; t <= years; t++) pot += yearly * Math.pow(1 + rate, years - t);
        return pot;
    }
    // First year the reinvested-savings pot overtakes the ISA lump sum; null = never.
    function crossoverYear(yearly, principal, rate, maxYears) {
        for (var t = 1; t <= maxYears; t++) {
            if (reinvestedSavings(yearly, rate, t) > isaLumpSum(principal, rate, t)) return t;
        }
        return null;
    }
    // Cash today for new kit beyond a like-for-like petrol-car / boiler replacement.
    function extraUpfront(p, c) {
        var x = 0;
        if (c.ev) x += p.evPrice - p.carPrice;
        if (c.hp) x += (p.hpPrice - p.busGrant) - p.boilerPrice;
        if (c.solar) x += solarCapital(p);
        if (c.battery) x += batteryCapital(p);
        return x;
    }
    // Investment summary: payback (yrs), real IRR and ISA-crossover year for a
    // given outlay and constant yearly running-cost saving.
    function investment(p, upfront, yearly) {
        var H = p.investHorizon, r = (p.isaReturn || 0) / 100;
        var payback = yearly <= 0 ? null : (upfront <= 0 ? 0 : upfront / yearly);
        var theIrr = (upfront <= 0 || yearly <= 0) ? null : irr(upfront, yearly, H);
        var cross = (upfront <= 0 || yearly <= 0) ? null : crossoverYear(yearly, upfront, r, H);
        return { upfront: upfront, yearly: yearly, payback: payback, irr: theIrr, crossover: cross };
    }

    // Map the ledger's build + assumptions onto model.js parameters and run the
    // half-hourly simulation, returning the annual solar / import / export flows.
    // ctx.runModel does the actual model.run (and memoises).
    function flowsHH(p, c, d, ctx) {
        var mp = {
            solar_kWp: c.solar ? p.solarKwp : 0,
            solar_kWh_per_kWp: p.genPerKwp,
            // lights/appliances/cooking demand; induction cooking folds in here when
            // the gas supply is disconnected.
            lac_demand: p.elecBaseload + d.cookingElec,
            heat_demand: c.hp ? d.heatDelivered : 0,   // model divides by SCOP internally
            heatpump_scop: p.scop,
            ev_mode: 'simulated',
            ev_miles: c.ev ? p.mileage : 0,
            ev_efficiency: p.evEfficiency,
            ev_charge_power: 7,
            ev_charge_start_hour: p.evChargeStart,
            ev_charge_end_hour: p.evChargeEnd,
            battery: {
                capacity: c.battery ? p.batteryKwh : 0,
                dispatch: ctx.optimalDispatch ? 'optimal' : 'greedy',
                charge_max: p.batteryMaxPowerKw * 1000,
                discharge_max: p.batteryMaxPowerKw * 1000,
                round_trip_efficiency: p.batteryRoundTrip
            },
            // Flat import/export rates feed the model's own flat-cost figure (unused
            // here — the ledger applies its own rates); Agile figures come from the
            // half-hourly dataset prices baked into the model.
            import_rate: p.elecRate,
            export_rate: p.segRate
        };
        // Tell the model where to source import & export prices. Import follows the
        // build: 'schedule' (custom), 'agile' (agile import) or 'flat'. Export is an
        // independent choice (c.exportMode): 'flat' SEG, 'agile' Outgoing, or
        // 'schedule' (the custom band table's export column). The agile/agile pair is
        // the model default, so we only attach mp.tariff when something differs —
        // keeping the common Agile-tariff cache keys unchanged.
        var importSrc = c.agile ? (c.tariffMode === 'custom' ? 'schedule' : 'agile') : 'flat';
        var exportSrc = c.exportMode || 'flat';
        if (importSrc !== 'agile' || exportSrc !== 'agile') {
            mp.tariff = { import: importSrc, export: exportSrc };
            if (importSrc === 'schedule' || exportSrc === 'schedule') mp.tariff.schedule = p.tariffSchedule;
        }
        var r = ctx.runModel(mp);
        return {
            solarGen: r.annual.solar_kwh,
            solarExport: r.annual.export_kwh,
            gridImport: r.annual.import_kwh,
            agileImportCost: r.annual.agile_import_cost,
            agileExportEarnings: r.annual.agile_export_earnings,
            avgAgileImport: r.annual.avg_agile_import_rate,
            avgAgileExport: r.annual.avg_agile_export_rate,
            loadAttr: r.annual.load_attr,
            batteryFlow: r.annual.battery_flow
        };
    }

    // The whole annual ledger for one build config `c`. Pure: returns energy,
    // cost and carbon results, including the segment breakdowns the view plots.
    function compute(c, ctx) {
        var p = ctx.p;
        var heatingFrac = p.heatingPct / 100, waterFrac = p.waterPct / 100, cookingFrac = p.cookingPct / 100;

        // ---- electricity demand ----
        var evElec = c.ev ? p.mileage / p.evEfficiency : 0;
        var heatDelivered = p.gasTotal * (heatingFrac + waterFrac) * p.boilerEff;
        var hpElec = c.hp ? heatDelivered / p.scop : 0;
        var cookingElec = (c.hp && c.disconnectGas) ? (p.gasTotal * cookingFrac * p.inductionEff) : 0;
        var demand = p.elecBaseload + evElec + hpElec + cookingElec;

        // ---- solar generation, self-consumption & grid import ----
        // Two interchangeable engines produce the same flow figures. The half-hourly
        // simulation in model.js is the default; the original annualised estimate is
        // kept for comparison. The Agile tariff is priced half-hourly, so it always
        // uses the simulation regardless of the toggle.
        var useHH = (ctx.useHHModel || c.agile || (c.exportMode && c.exportMode !== 'flat')) && ctx.modelReady;
        var solarGen, solarSelf, solarExport, gridImport;
        var f = null;

        if (useHH) {
            f = flowsHH(p, c, { heatDelivered: heatDelivered, cookingElec: cookingElec }, ctx);
            solarGen = f.solarGen;
            solarExport = f.solarExport;
            gridImport = f.gridImport;
            solarSelf = Math.max(0, solarGen - solarExport);
        } else {
            // Annualised estimate: daytime-match + battery-shift, no time resolution.
            solarGen = c.solar ? p.solarKwp * p.genPerKwp : 0;
            var daytimeDemand = demand * p.daytimeFrac;
            var directSelf = Math.min(solarGen, daytimeDemand) * p.directMatch;
            var surplus = Math.max(0, solarGen - directSelf);
            var eveningDemand = Math.max(0, demand - directSelf);
            var batteryThroughput = c.battery ? p.batteryKwh * 365 * p.batteryUtil : 0;
            var batterySolarShift = Math.min(surplus, eveningDemand, batteryThroughput);
            solarSelf = directSelf + batterySolarShift;
            solarExport = Math.max(0, solarGen - solarSelf);
            gridImport = Math.max(0, demand - solarSelf);
        }

        // ---- electricity cost ----
        // Import and export are priced independently and the half-hourly model has
        // already costed each interval at the right source (see flowsHH / model.js),
        // so when the model ran we read its totals straight off. The avg-rate figures
        // are only meaningful for a time-varying side (import: agile/custom; export:
        // anything but flat). The annual-estimate fallback (no model) is flat both
        // sides. exportMode defaults to flat for older configs without the field.
        var exportMode = c.exportMode || 'flat';
        var importCost, exportRevenue, avgAgileImport = null, avgAgileExport = null;
        if (f) {
            importCost = f.agileImportCost;
            exportRevenue = f.agileExportEarnings;
            if (c.agile) avgAgileImport = f.avgAgileImport;
            if (exportMode !== 'flat') avgAgileExport = f.avgAgileExport;
        } else {
            importCost = gridImport * p.elecRate / 100;
            exportRevenue = solarExport * p.segRate / 100;
        }
        var elecStandingCost = p.elecStanding * 365 / 100;

        // ---- effective electricity unit rate by load (diagnostic) ----
        // For each load we know (from the half-hourly attribution) how many kWh
        // it drew from the grid, from solar-direct and from the battery, and the
        // grid kWh are already priced at the timing-weighted rate paid. The home-
        // generated/stored kWh are priced two ways:
        //   cash      — solar at the export it forgoes, battery at the cash spent
        //               charging it (grid import + forgone export on solar charge)
        //   levelised — solar at its production cost (annualised capital ÷ output),
        //               battery at its charge cost + storage capital per kWh cycled
        // Capital already appears in the ledger as the solar/battery asset lines,
        // so this is a STANDALONE lens (never summed into the all-in total) — it
        // shows how much solar+battery cut the rate the heat pump etc. pays, and
        // hence the spark gap vs gas. Only available with the half-hourly model.
        var elecRates = null, sparkGap = null;
        if (f && f.loadAttr) {
            // £/kWh prices for home energy
            var solarLcoe = (c.solar && solarGen > 0)
                ? (ann(p, solarCapital(p), 0, p.solarLife) + p.solarMaint) / solarGen : 0;
            var forgoneExport = (exportMode !== 'flat' ? (avgAgileExport || 0) : p.segRate) / 100;
            var bf = f.batteryFlow;
            var batChargeGridCost = c.agile ? bf.charge_grid_cost : bf.charge_grid_cost_flat;
            var batLcosCapital = c.battery ? ann(p, batteryCapital(p), 0, p.batteryLife) : 0;
            // battery cost per kWh delivered (charge cost spread over discharge —
            // round-trip losses fall out because more is charged than delivered)
            var batUnitCash = bf.discharge_kwh > 0
                ? (batChargeGridCost + bf.charge_solar_kwh * forgoneExport) / bf.discharge_kwh : 0;
            var batUnitLev = bf.discharge_kwh > 0
                ? (batChargeGridCost + bf.charge_solar_kwh * solarLcoe + batLcosCapital) / bf.discharge_kwh : 0;

            var loadRate = function (a) {
                if (!a) return null;
                var kwh = a.grid_kwh + a.solar_kwh + a.battery_kwh;
                if (kwh <= 0.5) return null;
                var grid = c.agile ? a.grid_cost : a.grid_cost_flat;
                var cashCost = grid + a.solar_kwh * forgoneExport + a.battery_kwh * batUnitCash;
                var levCost = grid + a.solar_kwh * solarLcoe + a.battery_kwh * batUnitLev;
                return {
                    kwh: kwh, gridKwh: a.grid_kwh, solarKwh: a.solar_kwh, batteryKwh: a.battery_kwh,
                    cashCost: cashCost, levCost: levCost,
                    cashRate: cashCost / kwh * 100, levRate: levCost / kwh * 100
                };
            };
            // lac carries baseload + cooking; they share one profile, so split the
            // result pro-rata by kWh (exact — identical timing).
            var scaleRate = function (r, frac) {
                if (!r || frac <= 0) return null;
                return {
                    kwh: r.kwh * frac, gridKwh: r.gridKwh * frac, solarKwh: r.solarKwh * frac,
                    batteryKwh: r.batteryKwh * frac, cashCost: r.cashCost * frac, levCost: r.levCost * frac,
                    cashRate: r.cashRate, levRate: r.levRate
                };
            };
            var lacRate = loadRate(f.loadAttr.lac);
            var lacTotal = p.elecBaseload + cookingElec;
            var cookFrac = lacTotal > 0 ? cookingElec / lacTotal : 0;
            elecRates = {
                baseload: scaleRate(lacRate, 1 - cookFrac),
                cooking: cookingElec > 0 ? scaleRate(lacRate, cookFrac) : null,
                ev: c.ev ? loadRate(f.loadAttr.ev) : null,
                hp: c.hp ? loadRate(f.loadAttr.hp) : null,
                solarLcoe: solarLcoe * 100, forgoneExport: forgoneExport * 100,
                batUnitCash: batUnitCash * 100, batUnitLev: batUnitLev * 100
            };
            // spark gap: cost of a useful kWh of heat, heat pump vs gas boiler
            if (elecRates.hp) {
                sparkGap = {
                    gasHeat: p.gasRate / p.boilerEff,            // p/kWh useful heat (gas)
                    hpHeatCash: elecRates.hp.cashRate / p.scop,  // p/kWh useful heat (HP, cash)
                    hpHeatLev: elecRates.hp.levRate / p.scop,    // p/kWh useful heat (HP, levelised)
                    elecGasRatio: p.elecRate / p.gasRate         // headline flat-rate spark ratio
                };
            }
        }

        // ---- gas ----
        var gas = 0;
        if (c.hp) {
            if (!c.disconnectGas) { gas = (p.gasTotal * cookingFrac * p.gasRate) / 100 + p.gasStanding * 365 / 100; }
        } else {
            gas = (p.gasTotal * p.gasRate) / 100 + p.gasStanding * 365 / 100;
        }

        // ---- petrol ----
        var petrol = c.ev ? 0 : (p.mileage / p.mpg) * LITRES_PER_GALLON * p.petrolPrice;

        var running = importCost - exportRevenue + elecStandingCost + gas + petrol;

        // ---- assets (annualised) ----
        var carAsset = c.ev ? (ann(p, p.evPrice, p.evResidual, p.evLife) + p.evMaint)
                            : (ann(p, p.carPrice, p.carResidual, p.carLife) + p.carMaint);
        var heatAsset = c.hp ? (ann(p, p.hpPrice - p.busGrant, 0, p.hpLife) + p.hpUpkeep)
                             : (ann(p, p.boilerPrice, 0, p.boilerLife) + p.boilerService + p.boilerRepairs);
        var solarAsset = c.solar ? (ann(p, solarCapital(p), 0, p.solarLife) + p.solarMaint) : 0;
        var batteryAsset = c.battery ? ann(p, batteryCapital(p), 0, p.batteryLife) : 0;
        var assets = carAsset + heatAsset + solarAsset + batteryAsset;

        var allIn = running + assets;

        // ---- carbon: operational (kgCO2e/yr) ----
        var petrolLitres = c.ev ? 0 : (p.mileage / p.mpg) * LITRES_PER_GALLON;
        var gasKwhBurned;
        if (c.hp) { gasKwhBurned = c.disconnectGas ? 0 : p.gasTotal * cookingFrac; }
        else { gasKwhBurned = p.gasTotal; }
        var gasFactor = p.gasCombustionKg * (1 + p.gasUpstreamPct / 100);   // combustion + upstream methane
        var petrolCO2 = petrolLitres * p.petrolKgPerL;
        var gasCO2 = gasKwhBurned * gasFactor;
        var gridCO2 = gridImport * p.gridIntensity / 1000;               // g → kg
        var exportCO2Credit = solarExport * p.marginalIntensity / 1000;  // displaces gas generation
        var opCO2 = petrolCO2 + gasCO2 + gridCO2 - exportCO2Credit;

        // ---- carbon: embodied, amortised over each asset's life (kgCO2e/yr) ----
        var carCO2 = c.ev ? (p.gliderEmbodied + p.evBatteryKwh * p.batteryCO2PerKwh) / p.vehicleLifeCarbon
                          : (p.gliderEmbodied) / p.vehicleLifeCarbon;
        var heatCO2 = c.hp ? p.hpEmbodied / p.hpLife : p.boilerEmbodied / p.boilerLife;
        var solarCO2 = c.solar ? (p.solarLifecycleCO2 * solarGen / 1000) : 0;   // lifecycle intensity × annual gen
        var batteryCO2 = c.battery ? (p.batteryKwh * p.batteryCO2PerKwh) / p.batteryLife : 0;
        var embCO2 = carCO2 + heatCO2 + solarCO2 + batteryCO2;

        var totalCO2 = opCO2 + embCO2;
        var netGridCO2 = Math.max(0, gridCO2 - exportCO2Credit);
        var carbonSegments = [
            { key: 'petrol', label: 'Petrol', color: 'var(--petrol)', value: petrolCO2 },
            { key: 'gas', label: 'Gas', color: 'var(--gas)', value: gasCO2 },
            { key: 'grid', label: 'Grid electricity', color: 'var(--grid)', value: netGridCO2 },
            { key: 'car', label: c.ev ? 'EV embodied' : 'Car embodied', color: c.ev ? 'var(--ev)' : 'var(--petrol)', value: carCO2 },
            { key: 'heat', label: c.hp ? 'Heat pump embodied' : 'Boiler embodied', color: c.hp ? 'var(--hp)' : 'var(--gas)', value: heatCO2 },
            { key: 'solar', label: 'Solar embodied', color: 'var(--solar)', value: solarCO2 },
            { key: 'battery', label: 'Battery embodied', color: 'var(--battery)', value: batteryCO2 },
        ].filter(function (s) { return s.value > 0.5; });

        // ---- ledger segments (sum to allIn) ----
        var netElec = Math.max(0, importCost + elecStandingCost - exportRevenue);
        var segments = [
            { key: 'petrol', label: 'Petrol', color: 'var(--petrol)', value: petrol },
            { key: 'gas', label: 'Gas', color: 'var(--gas)', value: gas },
            { key: 'elec', label: 'Grid electricity', color: 'var(--grid)', value: netElec },
            { key: 'car', label: c.ev ? 'EV asset' : 'Car asset', color: c.ev ? 'var(--ev)' : 'var(--petrol)', value: carAsset },
            { key: 'heat', label: c.hp ? 'Heat pump asset' : 'Boiler asset', color: c.hp ? 'var(--hp)' : 'var(--gas)', value: heatAsset },
            { key: 'solar', label: 'Solar asset', color: 'var(--solar)', value: solarAsset },
            { key: 'battery', label: 'Battery asset', color: 'var(--battery)', value: batteryAsset },
        ].filter(function (s) { return s.value > 0.5; });

        return {
            demand: demand, evElec: evElec, hpElec: hpElec, cookingElec: cookingElec, solarGen: solarGen, solarSelf: solarSelf,
            solarExport: solarExport, gridImport: gridImport,
            avgAgileImport: avgAgileImport, avgAgileExport: avgAgileExport,
            selfPct: solarGen > 0 ? Math.round(solarSelf / solarGen * 100) : 0,
            importCost: importCost, exportRevenue: exportRevenue, elecStandingCost: elecStandingCost,
            elecRates: elecRates, sparkGap: sparkGap,
            gas: gas, petrol: petrol, running: running,
            carAsset: carAsset, heatAsset: heatAsset, solarAsset: solarAsset, batteryAsset: batteryAsset,
            assets: assets, allIn: allIn, segments: segments,
            petrolCO2: petrolCO2, gasCO2: gasCO2, gridCO2: gridCO2, exportCO2Credit: exportCO2Credit, opCO2: opCO2,
            carCO2: carCO2, heatCO2: heatCO2, solarCO2: solarCO2, batteryCO2: batteryCO2,
            embCO2: embCO2, totalCO2: totalCO2, carbonSegments: carbonSegments,
        };
    }

    // The build config that flipping technology `tech` produces. Mirrors the
    // view's watchers: disconnecting gas is coupled to the heat pump, so flipping
    // hp flips disconnectGas too.
    function flipCfg(cfg, tech) {
        var flipped = Object.assign({}, cfg);
        flipped[tech] = !flipped[tech];
        if (tech === 'hp') flipped.disconnectGas = flipped.hp;
        return flipped;
    }

    return {
        LITRES_PER_GALLON: LITRES_PER_GALLON,
        DEFAULTS: DEFAULTS,
        TARIFF_PRESETS: TARIFF_PRESETS,
        ann: ann,
        solarCapital: solarCapital,
        batteryCapital: batteryCapital,
        npv: npv,
        irr: irr,
        isaLumpSum: isaLumpSum,
        reinvestedSavings: reinvestedSavings,
        crossoverYear: crossoverYear,
        extraUpfront: extraUpfront,
        investment: investment,
        flowsHH: flowsHH,
        compute: compute,
        flipCfg: flipCfg,
    };
});
