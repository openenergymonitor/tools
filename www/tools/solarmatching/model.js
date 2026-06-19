// solarmatching/model.js
//
// Core half-hourly solar / battery / demand simulation, extracted from
// solarmatching.php so it can be reused independently of the Vue view.
//
// Usage:
//   model.load("tools/solarmatching/solarmatching_data.json", function () {
//       var result = model.run(params);   // params described in defaultParams()
//       // ... use result ...
//   });
//
// The model holds the loaded timeseries data internally. run() is pure with
// respect to that data: it takes a parameter object and returns a result
// object, mutating nothing the caller passes in.
//
// Timeseries are stored as values-only arrays (no timestamps) to keep the data
// file small. The fixed start time and interval are enough to derive the time
// of any sample; timestamps are only added to the series handed to a plotting
// library (see timeseries() in the view).

var model = {

    // ---- loaded data ----
    // Fixed start time of the dataset (ms) and sample interval (seconds).
    data_start_time: new Date("2025-06-01T00:00:00Z").getTime(),
    interval: 900, // 15 minutes

    // Series layout the simulation expects:
    // [0] solar, [1] lac demand, [2] heatpump, [3] agile import, [4] agile export, [5] measured ev
    series: [],

    // Set true when load() falls back to synthetically generated data because
    // the live data file could not be fetched.
    usingSynthetic: false,

    // Input totals (kWh/year) used to normalise the raw shape data to the
    // requested annual energy figures. Populated by normalise().
    input: {
        solar_kwh: 0,
        lac_kwh: 0,
        heatpump_kwh: 0,
        ev_kwh: 0
    },

    // Time (ms) of sample i, derived from the fixed start time and interval.
    time_at: function (i) {
        return this.data_start_time + i * this.interval * 1000;
    },

    // Measured EV charging power at sample i (0 where the series is absent or
    // has no value for that interval).
    measured_ev_at: function (i) {
        var s = this.series[5];
        return (s && s.data[i] != undefined) ? (s.data[i] || 0) : 0;
    },

    // ---- data loading ----
    // Remap the 8 raw series from the data file to the series layout the
    // simulation expects, then compute the normalisation totals.
    _apply: function (result) {

        // Combine appliance (1), cooker (2) and lighting (3) into a single
        // "lac" (lights, appliances, cooking) demand series.
        var lac = result[1].data.map(function (v, i) {
            return (v || 0) + (result[2].data[i] || 0) + (result[3].data[i] || 0);
        });

        // The Agile import feed (518378) is stored ex-VAT; domestic electricity
        // supply carries 5% VAT, so gross the import price up here. This is the
        // single point that feeds the cost calc, the no-solar baseline, the
        // volume-weighted average and the DP battery optimiser. Export (399363)
        // is left as-is: domestic export/SEG payments are not subject to VAT.
        var VAT = 1.05;
        var agile_import = result[5].data.map(function (v) {
            return v == null ? v : v * VAT;
        });

        // Re-map to the series layout the simulation expects:
        // [0] solar, [1] lac demand, [2] heatpump, [3] agile import, [4] agile export, [5] measured ev
        this.series = [
            result[0],
            { data: lac },
            result[4],
            { data: agile_import },
            result[6],
            result[7]
        ];

        this.normalise();
    },

    // Fetch the cached data file, remap and normalise it, then invoke
    // callback(). If the fetch fails (no data file, or fetch unavailable) we
    // fall back to a synthetic year (see generateSyntheticData below) so the
    // page still works; usingSynthetic is set so the view can flag it.
    load: function (url, callback) {
        var self = this;
        var done = function () { if (callback) callback(); };

        var synth = function () {
            self.usingSynthetic = true;
            self._apply(generateSyntheticData());
            done();
        };

        if (typeof fetch === 'undefined') { synth(); return; }
        fetch(url)
            .then(function (r) { if (!r.ok) throw new Error('no data'); return r.json(); })
            .then(function (result) { self.usingSynthetic = false; self._apply(result); done(); })
            .catch(function () { synth(); });
    },

    // Sum the raw input series to annual kWh totals, used as the denominator
    // when scaling the shape data to the requested annual energy figures.
    normalise: function () {
        let power_to_kwh = this.interval / 3600000;
        let sum_kwh = function (series) {
            return series.data.reduce(function (acc, v) { return acc + (v || 0) * power_to_kwh; }, 0);
        };

        this.input = {
            solar_kwh: sum_kwh(this.series[0]),
            lac_kwh: sum_kwh(this.series[1]),
            heatpump_kwh: sum_kwh(this.series[2]),
            ev_kwh: this.series[5] ? sum_kwh(this.series[5]) : 0
        };
    },

    // Default parameter set. Callers can spread / merge over this.
    defaultParams: function () {
        return {
            // solar
            solar_kWp: 4,
            solar_kWh_per_kWp: 870,

            // demand
            lac_demand: 2120,
            heat_demand: 9610,
            heatpump_scop: 4.0,

            // electric vehicle
            ev_mode: 'simulated',     // 'simulated' charging profile or 'real' measured data
            ev_miles: 16000,          // miles per year
            ev_efficiency: 3.8,       // miles per kWh
            ev_charge_power: 7,       // kW charge rate
            ev_charge_start_hour: 0,  // start charging overnight (midnight)
            ev_charge_end_hour: 7,    // latest hour charging can continue to

            // battery
            battery: {
                capacity: 0,
                soc_start: 0,
                charge_max: 3.5,
                discharge_max: 3.5,
                charge_efficiency: 0.9,
                discharge_efficiency: 0.9,
                // Dispatch strategy: 'greedy' (per-interval heuristic + the
                // scheduled windows below) or 'optimal' (globally near-optimal
                // perfect-foresight DP over the half-hourly agile prices; the
                // scheduled windows are then ignored — the DP subsumes them).
                dispatch: 'greedy',
                soc_levels: 100,   // SOC discretisation for 'optimal' (more = closer to LP)
                cycle_cost: 0,     // battery wear charged per kWh discharged (p/kWh), 'optimal' only
                // Forced peak discharge: empty remaining charge to load + grid in the window
                force_discharge_enable: false,
                force_discharge_start_hour: 16, // 4pm
                force_discharge_end_hour: 19,   // 7pmmax_runs
                // Overnight recharge from grid up to a target state of charge
                overnight_charge_enable: false,
                overnight_charge_start_hour: 0, // midnight
                overnight_charge_end_hour: 5,   // 5am
                overnight_charge_target_pct: 80
            },

            // tariff
            import_rate: 26, // p/kWh flat-rate import
            export_rate: 10, // p/kWh flat-rate export

            // Off-peak window. Used only to report how much grid import falls in
            // the window (annual.import_offpeak_kwh); it does not change battery
            // or EV dispatch. A caller applying a two-rate (peak/off-peak) tariff
            // can split the reported import on this volume.
            off_peak_start_hour: 0,
            off_peak_end_hour: 7,

            // SOC convergence: re-run feeding the final battery SOC back in as
            // the starting SOC, so the annual figures settle to a steady state.
            max_runs: 3
        };
    },

    // Run the simulation for the given parameters and return a result object.
    // Does not mutate the passed params object.
    run: function (params) {

        // Merge over defaults so partial parameter sets work. Battery is merged
        // separately (onto a fresh default battery, so partial battery objects
        // keep defaults and the caller's object is never mutated).
        var p = Object.assign(this.defaultParams(), params || {});
        p.battery = Object.assign(this.defaultParams().battery, (params && params.battery) || {});

        var series = this.series;
        var data_start_time = this.data_start_time;
        var interval = this.interval;
        var time_at = this.time_at.bind(this);
        var measured_ev_at = this.measured_ev_at.bind(this);
        var input = this.input;

        let power_to_kwh = interval / 3600000;
        let max_runs = p.max_runs || 1;

        // Derived demand totals (independent of the per-interval loop).
        // 'real' EV mode uses the recorded annual total, otherwise derive it
        // from annual mileage and efficiency.
        let heatpump_elec_kwh = p.heat_demand / p.heatpump_scop;
        let ev_elec_kwh = (p.ev_mode == 'real') ? input.ev_kwh : p.ev_miles / p.ev_efficiency;
        let total_elec_kwh = p.lac_demand + heatpump_elec_kwh + ev_elec_kwh;

        // Normalisation factors scale the raw shape series to the requested
        // annual energy figures.
        let solar_normalisation_factor = p.solar_kWh_per_kWp / input.solar_kwh;
        let lac_normalisation_factor = p.lac_demand / input.lac_kwh;
        let heatpump_normalisation_factor = heatpump_elec_kwh / input.heatpump_kwh;

        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        // EV: charge overnight at fixed power until the day's energy need is met
        let ev_daily_kwh = ev_elec_kwh / 365;

        // Battery charge/discharge power caps (W) scale with array size, as in
        // the original model.
        p.battery.charge_max = p.solar_kWp * 1000;
        p.battery.discharge_max = p.solar_kWp * 1000;
        let overnight_target_soc = p.battery.capacity * p.battery.overnight_charge_target_pct / 100;

        // Pre-pass: solar generation (W) and total demand (W) per interval.
        // Neither depends on battery state, so we build them once here and reuse
        // them across every SOC-convergence pass and the optimal-dispatch DP.
        let n_intervals = series[0].data.length;
        let solar_w = new Array(n_intervals);
        let demand_w = new Array(n_intervals);
        let prepass_ev_today = 0;
        let prepass_day = new Date(data_start_time).getDate();
        for (var pi = 0; pi < n_intervals; pi++) {
            let date = new Date(time_at(pi));
            let hour = date.getHours();
            let solarpv = series[0].data[pi] * solar_normalisation_factor * p.solar_kWp;
            let lac = series[1].data[pi] * lac_normalisation_factor;
            let heatpump = series[2].data[pi] * heatpump_normalisation_factor;
            let ev = 0;
            if (p.ev_mode == 'real') {
                ev = measured_ev_at(pi);
            } else {
                if (date.getDate() != prepass_day) { prepass_day = date.getDate(); prepass_ev_today = 0; }
                if (ev_daily_kwh > 0 &&
                    hour >= p.ev_charge_start_hour && hour < p.ev_charge_end_hour &&
                    prepass_ev_today < ev_daily_kwh) {
                    ev = p.ev_charge_power * 1000;
                    let ev_kwh = ev * power_to_kwh;
                    if (prepass_ev_today + ev_kwh > ev_daily_kwh) {
                        ev_kwh = ev_daily_kwh - prepass_ev_today;
                        ev = ev_kwh / power_to_kwh;
                    }
                    prepass_ev_today += ev_kwh;
                }
            }
            solar_w[pi] = solarpv;
            demand_w[pi] = lac + heatpump + ev;
        }

        // Optimal dispatch: compute the whole-year schedule once, up front.
        // Perfect foresight over the half-hourly agile import/export prices.
        let optimal = (p.battery.dispatch === 'optimal' && p.battery.capacity > 0);
        let dp_charge_w, dp_discharge_w, dp_soc;
        if (optimal) {
            let sched = optimiseBatteryDP(solar_w, demand_w, series[3].data, series[4].data, {
                capacity: p.battery.capacity,
                soc_levels: p.battery.soc_levels,
                power_to_kwh: power_to_kwh,
                charge_efficiency: p.battery.charge_efficiency,
                discharge_efficiency: p.battery.discharge_efficiency,
                charge_max: p.battery.charge_max,
                discharge_max: p.battery.discharge_max,
                cycle_cost: p.battery.cycle_cost,
                initial_soc: p.battery.soc_start
            });
            dp_charge_w = sched.charge_w;
            dp_discharge_w = sched.discharge_w;
            dp_soc = sched.soc;
        }

        // Result holder, (re)populated by each pass below.
        var result;

        // SOC convergence loop: feed the final SOC back in as the starting SOC
        // until it settles or we hit max_runs.
        let battery_soc_start = p.battery.soc_start;
        let run_count = 0;

        do {
            run_count++;

            // Monthly breakdown. `table` holds one row per month (the single
            // source of monthly figures, including the end-of-month battery SOC);
            // `timestamps` holds the [start, end] of each month for zooming.
            // The view derives its plot series from the table.
            let monthly = {
                table: [],
                timestamps: []
            };

            // power series for the power view
            let solar_data = [];
            let demand_data = [];
            let soc_data = [];

            // Running energy/cost totals. `annual` accumulates over the whole
            // year; `mtot` accumulates the current month and is reset at each
            // month boundary. Both share the same shape.
            let new_totals = function () {
                return {
                    solar_kwh: 0, demand_kwh: 0, import_kwh: 0, export_kwh: 0,
                    agile_import_cost: 0, agile_export_earnings: 0
                };
            };
            let add_interval = function (t, solar_kwh, demand_kwh, import_kwh, export_kwh, import_cost, export_earnings) {
                t.solar_kwh += solar_kwh;
                t.demand_kwh += demand_kwh;
                t.import_kwh += import_kwh;
                t.export_kwh += export_kwh;
                t.agile_import_cost += import_cost;
                t.agile_export_earnings += export_earnings;
            };
            let annual = new_totals();
            let mtot = new_totals();

            // Annual-only agile accumulators.
            // Cost of meeting all demand from agile import, no solar/battery (baseline for saving %)
            let annual_agile_no_solar_cost = 0;
            // Grid import that falls in the off-peak window (kWh).
            let annual_import_offpeak_kwh = 0;
            // Volume-weighted average agile price accumulators (p/kWh * kWh)
            let agile_import_rate_sum = 0;
            let agile_export_rate_sum = 0;

            let battery_soc = battery_soc_start;
            let month = new Date(data_start_time).getMonth();
            let month_start = data_start_time;

            let bat = p.battery;

            // Charge the battery with up to `power` (W), capping SOC at `cap`
            // (kWh) and applying charge losses. Returns the power actually drawn.
            let charge_battery = function (power, cap) {
                let charge = power;
                let soc_inc = charge * bat.charge_efficiency * power_to_kwh;
                if (battery_soc + soc_inc > cap) {
                    soc_inc = cap - battery_soc;
                    charge = soc_inc / power_to_kwh / bat.charge_efficiency;
                }
                battery_soc += soc_inc;
                return charge;
            };

            // Discharge the battery by up to `power` (W), limited by available
            // SOC and applying discharge losses. Returns the power delivered.
            let discharge_battery = function (power) {
                let discharge = power;
                let soc_dec = discharge / bat.discharge_efficiency * power_to_kwh;
                if (battery_soc - soc_dec < 0) {
                    soc_dec = battery_soc;
                    discharge = soc_dec / power_to_kwh * bat.discharge_efficiency;
                }
                battery_soc -= soc_dec;
                return discharge;
            };

            for (var i = 0; i < n_intervals; i++) {

                let time = time_at(i);
                let date = new Date(time);
                let hour = date.getHours();

                // Solar generation (W) and total demand (W), precomputed above.
                let solarpv = solar_w[i];
                let demand = demand_w[i];

                // Agile import / export rates (p/kWh)
                let import_rate = series[3].data[i];
                let export_rate = series[4].data[i];

                // Balance of generation minus demand (W), before the battery.
                let balance = solarpv - demand;

                // Time-of-day windows for scheduled battery behaviour.
                let in_force_discharge = bat.force_discharge_enable &&
                    hour >= bat.force_discharge_start_hour && hour < bat.force_discharge_end_hour;
                let in_overnight_charge = bat.overnight_charge_enable &&
                    hour >= bat.overnight_charge_start_hour && hour < bat.overnight_charge_end_hour;

                // Battery: each branch adjusts `balance` by the power actually
                // charged (drawn from balance) or discharged (added to balance).
                if (bat.capacity > 0) {
                    if (optimal) {
                        // Pre-computed globally near-optimal dispatch (see
                        // optimiseBatteryDP). charge/discharge are grid-side W;
                        // SOC is taken straight from the optimised trajectory.
                        balance -= dp_charge_w[i];
                        balance += dp_discharge_w[i];
                        battery_soc = dp_soc[i];
                    } else if (in_force_discharge) {
                        // Forced peak discharge: empty remaining charge to load + grid
                        balance += discharge_battery(bat.discharge_max);
                    } else if (in_overnight_charge && battery_soc < overnight_target_soc) {
                        // Overnight recharge from grid up to the target SOC
                        balance -= charge_battery(bat.charge_max, overnight_target_soc);
                    } else if (balance > 0) {
                        // Charge from solar surplus
                        balance -= charge_battery(balance, bat.capacity);
                    } else {
                        // Discharge to meet demand
                        balance += discharge_battery(-balance);
                    }
                }

                // Grid import / export for this interval (kWh).
                let import_kwh = (balance < 0 ? -balance : 0) * power_to_kwh;
                let export_kwh = (balance > 0 ? balance : 0) * power_to_kwh;
                let solar_kwh = solarpv * power_to_kwh;
                let demand_kwh = demand * power_to_kwh;

                // Agile cost / earnings for this interval (rates in p/kWh -> £)
                let import_cost = import_kwh * import_rate * 0.01;
                let export_earnings = export_kwh * export_rate * 0.01;

                add_interval(annual, solar_kwh, demand_kwh, import_kwh, export_kwh, import_cost, export_earnings);
                add_interval(mtot, solar_kwh, demand_kwh, import_kwh, export_kwh, import_cost, export_earnings);

                // Grid import falling in the off-peak window (for two-rate tariffs)
                if (hour >= p.off_peak_start_hour && hour < p.off_peak_end_hour) {
                    annual_import_offpeak_kwh += import_kwh;
                }

                // Baseline: full demand imported at the agile import price (no solar/battery)
                annual_agile_no_solar_cost += demand_kwh * import_rate * 0.01;
                // For volume-weighted average agile prices
                agile_import_rate_sum += import_rate * import_kwh;
                agile_export_rate_sum += export_rate * export_kwh;

                // Roll up monthly totals for graph and table at month boundaries.
                let lastMonth = month;
                month = date.getMonth();
                if (month != lastMonth) {
                    monthly.timestamps.push([month_start, time]);
                    month_start = time;

                    // Table row: month number/label, the month's totals, the
                    // end-of-month SOC, and two derived costs. The view plots its
                    // chart series straight off these rows.
                    monthly.table.push(Object.assign({ m: lastMonth + 1, month: months[lastMonth] }, mtot, {
                        soc: battery_soc,
                        agile_cost: mtot.agile_import_cost - mtot.agile_export_earnings,
                        flat_cost: (mtot.import_kwh * p.import_rate - mtot.export_kwh * p.export_rate) * 0.01
                    }));

                    mtot = new_totals();
                }

                // Store values only; timestamps are added when plotting.
                solar_data.push(solarpv);
                demand_data.push(demand);
                soc_data.push(battery_soc);
            }

            // Flat-rate cost (comparison baseline)
            let annual_cost = (annual.import_kwh * p.import_rate * 0.01) - (annual.export_kwh * p.export_rate * 0.01);
            let saving = 100 * (1 - (annual_cost / (p.import_rate * annual.demand_kwh * 0.01)));
            // Self-sufficiency: share of demand met locally (not imported)
            let prc_from_solar = 100 * (annual.demand_kwh - annual.import_kwh) / annual.demand_kwh;
            // Self-consumption: share of solar generation used on-site (not exported)
            let prc_self_consumption = annual.solar_kwh > 0 ? 100 * (annual.solar_kwh - annual.export_kwh) / annual.solar_kwh : 0;

            // Agile (half-hourly) tariff results
            let annual_agile_cost = annual.agile_import_cost - annual.agile_export_earnings;
            // Volume-weighted average agile prices (p/kWh)
            let avg_agile_import_rate = annual.import_kwh > 0 ? agile_import_rate_sum / annual.import_kwh : 0;
            let avg_agile_export_rate = annual.export_kwh > 0 ? agile_export_rate_sum / annual.export_kwh : 0;
            // Saving vs meeting all demand from agile import with no solar/battery
            let agile_saving = annual_agile_no_solar_cost > 0 ? 100 * (1 - (annual_agile_cost / annual_agile_no_solar_cost)) : 0;

            result = {
                // Annual (whole-year) results.
                annual: {
                    // derived demand
                    heatpump_elec_kwh: heatpump_elec_kwh,
                    ev_elec_kwh: ev_elec_kwh,
                    total_elec_kwh: total_elec_kwh,

                    // energy
                    solar_kwh: annual.solar_kwh,
                    demand_kwh: annual.demand_kwh,
                    import_kwh: annual.import_kwh,
                    import_offpeak_kwh: annual_import_offpeak_kwh,
                    export_kwh: annual.export_kwh,
                    prc_from_solar: prc_from_solar,
                    prc_self_consumption: prc_self_consumption,

                    // flat-rate tariff
                    cost: annual_cost,
                    saving: saving,

                    // agile tariff
                    agile_import_cost: annual.agile_import_cost,
                    agile_export_earnings: annual.agile_export_earnings,
                    agile_cost: annual_agile_cost,
                    agile_saving: agile_saving,
                    avg_agile_import_rate: avg_agile_import_rate,
                    avg_agile_export_rate: avg_agile_export_rate
                },

                // Monthly breakdown: one table row per month (the view derives
                // its plot series from these) plus the month boundary timestamps.
                monthly: monthly,

                // half-hourly power series (values only) for the power view
                solar_data: solar_data,
                demand_data: demand_data,
                soc_data: soc_data,

                // battery state
                battery_soc_end: battery_soc,
                run_count: run_count
            };

            // Feed the final SOC back in for the next pass.
            battery_soc_start = battery_soc;

        } while (!optimal && result.battery_soc_end > 10 && run_count < max_runs);

        return result;
    }
};

// ---- synthetic data ----
// A small seeded PRNG (mulberry32) and a generator that produces a realistic
// synthetic year in the same 8-series raw shape as the data file:
//   [0] solar [1] appliance [2] cooker [3] lighting
//   [4] heatpump [5] agile import p/kWh [6] agile export p/kWh [7] measured EV (W)
// load() falls back to this when the live data file can't be fetched, so any
// tool building on the model still has something to run against.
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function generateSyntheticData() {
    var start = model.data_start_time;
    var interval = model.interval; // s
    var n = 365 * 96;
    var rnd = mulberry32(20250601);
    var solar = [], app = [], cook = [], light = [], hp = [], imp = [], exp = [], ev = [];
    var TWO_PI = Math.PI * 2;
    // per-day random factors
    var cloud = [], evNight = [];
    for (var d = 0; d < 366; d++) { cloud[d] = 0.55 + 0.45 * rnd(); evNight[d] = rnd(); }
    for (var i = 0; i < n; i++) {
        var t = start + i * interval * 1000;
        var dt = new Date(t);
        var h = dt.getHours() + dt.getMinutes() / 60;
        var doy = Math.floor((t - new Date(dt.getFullYear(), 0, 0).getTime()) / 86400000);
        var dayIdx = Math.floor(i / 96);
        // seasonal: 1 at midsummer (~day 172), 0 at midwinter
        var summer = 0.5 * (1 + Math.cos((doy - 172) / 365.25 * TWO_PI));
        // ---- solar ----
        var dayHalf = 3.6 + 3.2 * summer;           // half-day length in hours
        var s = 0;
        if (Math.abs(h - 13) < dayHalf) {
            var c = Math.cos(((h - 13) / dayHalf) * (Math.PI / 2));
            s = Math.pow(Math.max(0, c), 1.25) * (0.32 + 0.68 * summer) * cloud[dayIdx];
        }
        solar.push(s * 4000); // arbitrary W shape, gets normalised
        // ---- appliances (base + bumps) ----
        var a = 80 + 30 * Math.sin(h / 24 * TWO_PI);
        a += 220 * Math.exp(-Math.pow(h - 7.5, 2) / 1.5);  // morning
        a += 300 * Math.exp(-Math.pow(h - 19, 2) / 3.0);   // evening
        a += 40 * rnd();
        app.push(Math.max(20, a));
        // ---- cooker spikes ----
        var ck = 0;
        ck += 1500 * Math.exp(-Math.pow(h - 7.7, 2) / 0.12);
        ck += 900 * Math.exp(-Math.pow(h - 12.7, 2) / 0.15);
        ck += 2200 * Math.exp(-Math.pow(h - 18.4, 2) / 0.18);
        cook.push(ck);
        // ---- lighting (evening + early morning, seasonal) ----
        var darkness = 0.35 + 0.65 * (1 - summer);
        var lt = 0;
        lt += 180 * Math.exp(-Math.pow(h - 7, 2) / 2.0) * darkness;
        lt += 260 * Math.exp(-Math.pow(h - 21, 2) / 4.0) * darkness;
        light.push(lt);
        // ---- heat pump (electrical demand shape, seasonal) ----
        var winter = 1 - summer;
        var hpv = winter * (260 + 180 * Math.exp(-Math.pow(h - 7, 2) / 4) + 160 * Math.exp(-Math.pow(h - 18, 2) / 6) + 60 * Math.sin(h / 24 * TWO_PI));
        hp.push(Math.max(0, hpv));
        // ---- agile import p/kWh ----
        var ir = 22;
        if (h >= 0 && h < 5) ir = 10 + 3 * rnd();              // cheap overnight
        else if (h >= 10 && h < 15) ir = 15 + 5 * (1 - summer);   // midday solar dip
        else if (h >= 16 && h < 19.5) ir = 30 + 9 * rnd();      // evening peak
        else ir = 21 + 4 * Math.sin(h / 24 * TWO_PI);
        ir += (1 - summer) * 4 - 2;                          // a touch pricier in winter
        imp.push(Math.max(4, ir + (rnd() - 0.5) * 2));
        // ---- agile export p/kWh ----
        var er = 5 + 10 * Math.max(0, Math.cos(((h - 13) / 6) * (Math.PI / 2)));
        if (h >= 16 && h < 19.5) er = 12 + 4 * rnd();
        exp.push(Math.max(2, er + (rnd() - 0.5) * 1.5));
        // ---- measured EV (W) ----
        ev.push(0);
    }
    // EV: charge on ~64% of nights, from 00:30, 4-8 intervals at 7kW
    for (var d2 = 0; d2 < 365; d2++) {
        if (evNight[d2] < 0.64) {
            var base = d2 * 96 + 2; // ~00:30
            var len = 4 + Math.floor(rnd() * 5);
            for (var k = 0; k < len; k++) { if (base + k < n) ev[base + k] = 7000; }
        }
    }
    return [
        { name: 'solar', data: solar },
        { name: 'appliance', data: app },
        { name: 'cooker', data: cook },
        { name: 'lighting', data: light },
        { name: 'heatpump', data: hp },
        { name: 'agile_import', data: imp },
        { name: 'agile_export', data: exp },
        { name: 'measured_ev', data: ev }
    ];
}

// ---- optimal battery dispatch (dynamic programming) ----
// Near-optimal perfect-foresight dispatch. State-of-charge is discretised into
// `soc_levels` steps and a forward DP over the whole horizon finds the cheapest
// schedule against the half-hourly agile prices. It converges to the LP optimum
// as soc_levels grows, but is pure JS with no solver dependency.
//
// Why this captures most of the LP's value: a home battery cycles roughly daily,
// so cross-horizon SOC coupling is weak (the LP optimiser itself splits the year
// in half and barely loses anything). The DP handles the time-coupling, the
// asymmetric charge/discharge efficiency and the cycle cost exactly — only the
// SOC quantisation separates it from the LP optimum.
//
// All powers are grid-side watts, matching model.run()'s `balance` convention:
// charge_w is drawn from balance (before charge losses), discharge_w is added to
// balance (after discharge losses). Returns { charge_w, discharge_w, soc } arrays
// with one entry per interval (soc is kWh at the end of each interval).
function optimiseBatteryDP(solar_w, demand_w, import_rate, export_rate, opts) {
    var N = solar_w.length;
    var cap = opts.capacity;
    var K = Math.max(2, Math.round(opts.soc_levels || 100));   // SOC steps
    var nLev = K + 1;                                          // SOC levels (states)
    var step = cap / K;                                        // kWh per level
    var p2k = opts.power_to_kwh;                               // W * interval -> kWh
    var ceff = opts.charge_efficiency;
    var deff = opts.discharge_efficiency;
    var pmaxCh = opts.charge_max;                              // W
    var pmaxDch = opts.discharge_max;                          // W
    var cycle = (opts.cycle_cost || 0) * 0.01;                 // £ per grid-side kWh discharged
    var SOC_PEN = 1e-9;                                        // tie-break: prefer holding less

    // Reachable SOC-level change per slot, bounded by the power limits.
    var upLevels = Math.floor((pmaxCh * ceff * p2k) / step);   // charging raises SOC
    var dnLevels = Math.floor((pmaxDch / deff * p2k) / step);  // discharging lowers SOC
    if (upLevels < 1) upLevels = 1; if (upLevels > K) upLevels = K;
    if (dnLevels < 1) dnLevels = 1; if (dnLevels > K) dnLevels = K;

    // Battery grid power (W) and cycle cost (£) per SOC-level delta. Both depend
    // only on the delta, not on the slot or the absolute SOC, so precompute once.
    var dLo = -dnLevels, dHi = upLevels;
    var dN = dHi - dLo + 1;
    var batPower = new Float64Array(dN);   // >0 discharge (adds to balance), <0 charge
    var cycleCost = new Float64Array(dN);
    for (var d = dLo; d <= dHi; d++) {
        var dsoc = d * step;               // cell-side kWh change
        var di = d - dLo;
        if (dsoc >= 0) {                   // charging (d == 0 -> idle, zero power)
            var inKwh = dsoc / ceff;       // grid-side energy drawn
            batPower[di] = -(inKwh / p2k);
            cycleCost[di] = 0;
        } else {                           // discharging
            var outKwh = (-dsoc) * deff;   // grid-side energy delivered
            batPower[di] = outKwh / p2k;
            cycleCost[di] = cycle * outKwh;
        }
    }

    // SOC tie-break penalty per level (nudges the solver off degenerate plateaus).
    var pen = new Float64Array(nLev);
    for (var s = 0; s < nLev; s++) pen[s] = SOC_PEN * s * step;

    var INF = Infinity;
    var dp = new Float64Array(nLev); dp.fill(INF);
    var newdp = new Float64Array(nLev);
    var s0 = Math.round((opts.initial_soc || 0) / step);
    if (s0 < 0) s0 = 0; if (s0 > K) s0 = K;
    dp[s0] = 0;

    // choice[t*nLev + sp] = SOC level at the start of slot t that optimally
    // reaches level sp at its end (for backtracking the schedule afterwards).
    var choice = new Int16Array(N * nLev);

    for (var t = 0; t < N; t++) {
        newdp.fill(INF);
        var base = t * nLev;
        var net = solar_w[t] - demand_w[t];                     // W, before battery
        var ir = import_rate[t] * 0.01, er = export_rate[t] * 0.01;  // £/kWh
        for (var dd = dLo; dd <= dHi; dd++) {
            var idx = dd - dLo;
            var balance = net + batPower[idx];                  // W
            // Grid cost for this slot: import costs, export earns (negative cost).
            var slotCost = (balance < 0 ? (-balance) * p2k * ir : -(balance * p2k * er))
                         + cycleCost[idx];
            // Valid start levels s such that sp = s + dd stays within [0, K].
            var sStart = dd > 0 ? 0 : -dd;
            var sEnd = dd > 0 ? K - dd : K;
            for (var ss = sStart; ss <= sEnd; ss++) {
                var from = dp[ss];
                if (from === INF) continue;
                var sp = ss + dd;
                var cand = from + slotCost + pen[sp];
                if (cand < newdp[sp]) { newdp[sp] = cand; choice[base + sp] = ss; }
            }
        }
        var tmp = dp; dp = newdp; newdp = tmp;   // swap rows
    }

    // Cheapest terminal SOC, then backtrack to recover the dispatch + trajectory.
    var sBest = 0, best = INF;
    for (var se = 0; se < nLev; se++) if (dp[se] < best) { best = dp[se]; sBest = se; }

    var charge_w = new Float64Array(N);
    var discharge_w = new Float64Array(N);
    var soc = new Float64Array(N);
    var cur = sBest;
    for (var tb = N - 1; tb >= 0; tb--) {
        var prev = choice[tb * nLev + cur];
        var bp = batPower[(cur - prev) - dLo];
        if (bp < 0) charge_w[tb] = -bp; else discharge_w[tb] = bp;
        soc[tb] = cur * step;     // SOC at end of slot tb
        cur = prev;
    }
    return { charge_w: charge_w, discharge_w: discharge_w, soc: soc };
}

// Expose the generator on the model so callers in either environment can reach
// it (and so load()'s fallback works without a separate global script).
model.generateSyntheticData = generateSyntheticData;
model.mulberry32 = mulberry32;
model.optimiseBatteryDP = optimiseBatteryDP;

// Expose as a CommonJS module too, so the model can be unit-tested / reused
// outside the browser. Harmless in the browser where module is undefined.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = model;
}
