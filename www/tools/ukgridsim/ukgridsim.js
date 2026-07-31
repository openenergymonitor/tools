// Start by loading hourly average outside temperature data from emoncms.org API
// Create basic Vue outline

var series = [];

// Used for input data normalisation
var input_solar_data_GWh = 0;
var input_wind_data_GWh = 0;
var input_demand_data_GWh = 0;
var input_heatpump_elec_data_GWh = 0;
var input_heatpump_heat_data_GWh = 0;

// Power series
var solar_data = [];
var wind_data = [];
var nuclear_data = [];
var trad_demand_data = [];
var heatpump_demand_data = [];
var demand_data = [];
var ev_demand_data = [];
var store1_soc_data = [];
var store2_soc_data = [];
var store2_discharge_data = [];
var backup_demand_data = [];

var month_timestamps = [];

var app = new Vue({
    el: '#app',
    data: {

        loading: true,
        show_chart: true,
        activeTab: 'costs',

        // demand
        standard_demand_TWh: 320,

        // Heat pumps
        heatpump: {
            households: 0.5,                // millions of households with heat pumps
            kwh_per_household: 9100,        // Average annual heat demand per household (includes space heating and hot water)
            spf: 3.73,                      // Seasonal performance factor (average efficiency over the year, accounting for seasonal variation)
            demand_GWh: 0,                  // Calculated annual electricity demand for heat pumps (GWh)
        },

        // Electric vehicles
        ev: {
            households: 1.0,
            miles_per_household: 12000,
            summer_efficiency: 4.5,
            winter_efficiency: 3.5,
            charging_efficiency: 85,
            demand_GWh: 0,
        },

        // solar generation
        solar_prc_of_demand: 6,
        solar_GWh_per_GWp: 870,
        solar_GWp: 0,
        solar_GWh: 0,
        solar_cost_per_mwh: 65, // Latest AR7 auction results

        // wind generation
        wind_prc_of_demand: 42,
        wind_cap_factor: 35,
        wind_GWp: 0,
        wind_GWh: 0,
        wind_cost_per_mwh: 85, // Latest AR7 auction results (30% of onshore wind cost £72/MWh, 70% offshore wind cost £91/MWh)

        // Renewable obligation costs 2023-2024
        // £6.7 bn for 78.2 TWh = £85.7 / MWh + £70-80/MWh wholesale = ~£160/MWh 
        // 1.3734 ROCs per MWh average. £62.4 per ROC
        // 72% of all renewables generation in 2023-2024: 108.9 TWh
        // RPI adjusted 2025: £93-99 / MWh?
        // https://www.ofgem.gov.uk/transparency-document/renewables-obligation-ro-annual-report-scheme-year-22-april-2023-march-2024
        // FITs: 6.5 GW, 8.3 TWh (exported 1.3 TWh), £1.86 billion ~£224/MWh
        // https://www.ofgem.gov.uk/transparency-document/feed-tariffs-annual-report-scheme-year-14-april-2023-march-2024#:~:text=Through%20this%2C%20the%20FIT%20has,to%20new%20entrants%20in%202019.
        // CFDs: ~22.4 TWh (approx £120/MWh https://johnewbank.co.uk/what-is-the-true-cost-of-renewables-a-cfd-analysis/)
        // Overall estimate for renewables cost in 2025 ~£160/MWh?

        // nuclear generation
        nuclear_prc_of_demand: 16,
        nuclear_cap_factor: 70,
        nuclear_GWp: 0,
        nuclear_GWh: 0,
        nuclear_cost_per_mwh: 128, // Hinkley Point C inflation adjusted estimate

        // calculated costs
        backup_cost_per_mwh: 0,
        energy_cost_per_mwh: 0,
        grid_cost_per_mwh: 0,
        total_cost_per_mwh: 0,

        // calculated total costs
        solar_cost: 0,
        wind_cost: 0,
        nuclear_cost: 0,
        backup_cost: 0,
        store1_cost: 0,

        include_carbon_cost: true,
        carbon_cost: 0, // £/MWh of gas generation (should ideally be dynamic based on efficiency etc)

        supply_GWh: 0,
        demand_GWh: 0,

        demand_met: "---",

        balance: {
            before_store1: 0,
            after_store1: 0,
            after_store2: 0,
            surplus: 0,
            unmet: 0
        },

        max_curtailement: 0,

        store1: {
            capacity: 0,
            soc_start: 0,
            charge_GWh: 0,
            discharge_GWh: 0,
            charge_max: 100,
            discharge_max: 100,
            round_trip_efficiency: 80,
            capital_cost_per_kwh: 245, // £/kWh based on £147 million for 600 MWh (Kilmarnock South project)
            cost_mwh: 0,
            // Dispatch strategy: 'greedy' (charge on surplus, discharge on
            // deficit) or 'optimal' (perfect-foresight DP over the whole year,
            // adapted from tools/solarmatching optimiseBatteryDP; targets
            // backup energy AND backup peak, so the battery shrinks the gas
            // fleet rather than just displacing a little gas energy).
            dispatch: "optimal",
            soc_levels: 200,   // SOC discretisation for 'optimal' (more = finer dispatch, slower)
            peak_weight: 2,    // peak-shaving weight (relative cost on backup GW^2)
            backup_value: 150  // £/MWh value placed on displaced backup generation
        },

        store2: {
            enabled: false,
            charge_max: 30.0,
            charge_efficiency: 80,
            discharge_max: 70,
            discharge_efficiency: 50,
            capacity: 44000,
            starting_soc: 12000,
            charge_GWh: 0,
            discharge_GWh: 0,
            cycles: 0,
            max_charge: 0,
            max_discharge: 0
        },

        backup: {
            CF: 0,
            max: 0,
            margin: 10,
            capacity: 0,
            demand_GWh: 0
        },

        auto_optimise: false,
        show_peak_shaving_balance: false,
        max_peak_shaving_deficit: 0,

        interval: 900,
        run_count: 0,

        view: "power", // or "power",
        csv_output: ""
    },
    methods: {
        update: function () {
            console.log("---- Update ----");
            app.run_count = 0;
            app.model();
        },
        model: function () {
            app.run_count++;

            let standard_demand_scaler = app.standard_demand_TWh / (input_demand_data_GWh * 0.001);

            let average_household_heat_scaler = (app.heatpump.kwh_per_household / input_heatpump_heat_data_GWh)
            let heatpump_elec_demand_GWh = (input_heatpump_elec_data_GWh * app.heatpump.households * average_household_heat_scaler);
            let heatpump_heat_demand_GWh = (input_heatpump_heat_data_GWh * app.heatpump.households * average_household_heat_scaler);

            let heatpump_elec_demand_GWh_adjusted = heatpump_heat_demand_GWh / app.heatpump.spf;
            let heatpump_elec_spf_scaler = heatpump_elec_demand_GWh_adjusted / heatpump_elec_demand_GWh;

            app.demand_GWh = (input_demand_data_GWh * standard_demand_scaler) + heatpump_elec_demand_GWh_adjusted;

            // Calculate EV demand
            // Annual miles per household converted to kWh using average efficiency
            let avg_efficiency = (app.ev.summer_efficiency + app.ev.winter_efficiency) / 2;
            let annual_kwh_per_household = (app.ev.miles_per_household / avg_efficiency) / (app.ev.charging_efficiency / 100);
            let ev_demand_GWh_annual = (annual_kwh_per_household * app.ev.households * 1000000) / 1000000;
            let ev_daily_demand_GW = ev_demand_GWh_annual / (365 * 24);

            app.demand_GWh += ev_demand_GWh_annual;

            app.heatpump.demand_GWh = heatpump_elec_demand_GWh_adjusted;
            app.ev.demand_GWh = ev_demand_GWh_annual;

            // Solar generation
            app.solar_GWh = (app.solar_prc_of_demand / 100) * app.demand_GWh;
            app.solar_GWp = app.solar_GWh / app.solar_GWh_per_GWp;

            // Wind generation
            app.wind_GWh = (app.wind_prc_of_demand / 100) * app.demand_GWh;
            let wind_average_power = app.wind_GWh / (365 * 24);
            app.wind_GWp = wind_average_power / (app.wind_cap_factor / 100);

            // Nuclear generation
            app.nuclear_GWh = (app.nuclear_prc_of_demand / 100) * app.demand_GWh;
            let nuclear_average_power = app.nuclear_GWh / (365 * 24);
            app.nuclear_GWp = nuclear_average_power / (app.nuclear_cap_factor / 100);

            // reset power series
            solar_data = [];
            wind_data = [];
            nuclear_data = [];
            demand_data = [];
            trad_demand_data = [];
            heatpump_demand_data = [];
            ev_demand_data = [];
            store1_soc_data = [];
            store2_soc_data = [];
            demand_plus_store_charge_data = [];
            store2_discharge_data = [];

            let solar_GWh = 0;
            let wind_GWh = 0;
            let nuclear_GWh = 0;
            let supply_GWh = 0;
            let demand_GWh = 0;
            let backup_demand_GWh = 0;

            let deficit_before_store1_GWh = 0;
            let deficit_after_store1_GWh = 0;
            let deficit_after_store2_GWh = 0;

            let balance_surplus = 0;
            let balance_unmet = 0;
            let max_demand = 0;

            let peak_shaving_balance = 0;

            let store1_charge_GWh = 0;
            let store1_discharge_GWh = 0;
            let store1_max_charge = 0;
            let store1_max_discharge = 0;

            let store2_charge_GWh = 0;
            let store2_discharge_GWh = 0;
            let store2_max_charge = 0;
            let store2_max_discharge = 0;
            let store2_max_level = 0;
            let store2_min_level = 100000;

            let max_curtailement = 0;

            if (app.auto_optimise) {
                app.store1.charge_max = 1000;
                app.store1.discharge_max = 1000;
                app.store2.charge_max = 1000;
                app.store2.discharge_max = 1000;
                // app.store2.capacity = 100000;
                // app.store2.starting_soc = 5000;
                // app.store2.soc = app.store2.starting_soc;                
            }

            let max_peak_shaving_deficit = 0;

            // Setup store1
            let store1_soc = app.store1.soc_start;
            let store1_soc_start_used = store1_soc;
            let store1_charge_efficiency = 1 - ((1 - app.store1.round_trip_efficiency * 0.01) / 2);
            let store1_discharge_efficiency = 1 - ((1 - app.store1.round_trip_efficiency * 0.01) / 2);
            app.store1.discharge_max = app.store1.charge_max;

            // Setup store2
            let store2_soc = app.store2.starting_soc;
            let store2_soc_start_used = store2_soc;
            let store2_charge_efficiency = app.store2.charge_efficiency * 0.01;
            let store2_discharge_efficiency = app.store2.discharge_efficiency * 0.01;

            let power_to_GWh = app.interval / 3600;

            // Normalisation factors
            let wind_normalisation_factor = app.wind_GWh / input_wind_data_GWh;
            let solar_normalisation_factor = app.solar_GWh_per_GWp / input_solar_data_GWh;

            // Max backup demand
            let max_backup_demand = 0;

            // ---------------------------------------------------------------
            // Pre-pass: per-interval supply & demand components (GW). None of
            // these depend on storage state, so they are built once here. The
            // optimal store1 dispatch (DP) works on the residual balance and
            // the main loop below reads from these arrays.
            // ---------------------------------------------------------------
            let n_intervals = series[0].data.length;
            let solar_arr = new Array(n_intervals);
            let wind_arr = new Array(n_intervals);
            let nuclear_arr = new Array(n_intervals);
            let trad_arr = new Array(n_intervals);
            let heatpump_arr = new Array(n_intervals);
            let ev_arr = new Array(n_intervals);
            let demand_arr = new Array(n_intervals);
            let residual_arr = new Array(n_intervals);

            for (var i = 0; i < n_intervals; i++) {

                // Solar generation
                let solarpv = series[2].data[i][1] * solar_normalisation_factor * app.solar_GWp;
                let wind = series[1].data[i][1] * wind_normalisation_factor;
                let nuclear = app.nuclear_GWp * app.nuclear_cap_factor / 100;

                // Demand
                let trad_demand = series[0].data[i][1] * 0.001 * standard_demand_scaler; // MW to GW
                let heatpump = series[3].data[i][1] * 0.001 * app.heatpump.households * average_household_heat_scaler * heatpump_elec_spf_scaler; // MW to GW, scaled by number of households and heat pump demand



                // ---------------------------------------------------------------------------
                // Synthesized EV demand profile
                // ---------------------------------------------------------------------------
                // Calculate EV demand with seasonal efficiency variation
                // Day of year (0-364)
                let dayOfYear = Math.floor((series[0].data[i][0] - series[0].data[0][0]) / (24 * 3600 * 1000)) % 365;
                // Sinusoidal variation: cos(2π * day/365) 
                // Jan 1 (day 0) = minimum efficiency (winter), July 1 (day ~182) = maximum (summer)
                let efficiency_variation = Math.cos(2 * Math.PI * dayOfYear / 365);
                // Map -1 to +1 range to winter to summer efficiency
                let seasonal_efficiency = app.ev.winter_efficiency + 
                    (app.ev.summer_efficiency - app.ev.winter_efficiency) * (efficiency_variation + 1) / 2;
                
                // Adjust demand based on efficiency (lower efficiency = higher demand)
                let efficiency_factor = avg_efficiency / seasonal_efficiency;
                
                // Time of day charging profile using sinusoidal function
                // Get hour of day from timestamp
                let date = new Date(series[0].data[i][0]);
                let hour = date.getUTCHours();
                let minutes = date.getUTCMinutes();
                
                // Convert to decimal hours for smooth sinusoidal function
                let decimal_hour = hour + minutes / 60;
                
                // Sinusoidal charging profile with peak at 2am (hour 2)
                // cos(2π * (hour - 2) / 24) peaks at hour 2
                // Shift and scale to maintain daily average of 1.0
                // Range from ~0.25 (minimum at 14:00) to ~1.75 (maximum at 02:00)
                let charging_rate_factor = 1.0 + 0.4 * Math.cos(2 * Math.PI * (decimal_hour - 4) / 24);

                let ev_demand = ev_daily_demand_GW * efficiency_factor * charging_rate_factor;
                // ---------------------------------------------------------------------------

                let demand = trad_demand + heatpump + ev_demand;

                if (demand < 0) {
                    demand = 0;
                }

                solar_arr[i] = solarpv;
                wind_arr[i] = wind;
                nuclear_arr[i] = nuclear;
                trad_arr[i] = trad_demand;
                heatpump_arr[i] = heatpump;
                ev_arr[i] = ev_demand;
                demand_arr[i] = demand;
                residual_arr[i] = (solarpv + wind + nuclear) - demand;
            }

            // Optimal store1 dispatch: perfect-foresight DP over the whole
            // year (adapted from tools/solarmatching optimiseBatteryDP).
            // Computed up front on the residual balance; the main loop then
            // applies the pre-computed schedule instead of the greedy rules.
            let dp_sched = null;
            if (app.store1.dispatch == "optimal" && app.store1.capacity > 0) {

                // Store2 (LDES) discharge power actually available per slot,
                // from a store2-only pre-simulation of the residual balance.
                // The backup peaks the battery should target are usually set
                // by the LDES running EMPTY late in the winter, not by
                // deficits above its discharge cap, so a constant cap is not
                // enough — the DP needs to know when the LDES can no longer
                // help. Approximate: the battery's own dispatch shifts the
                // LDES SOC path a little, but the deep energy droughts that
                // set the backup fleet size dwarf the battery's capacity.
                let s2_avail = null;
                if (app.store2.enabled) {
                    s2_avail = new Float64Array(n_intervals);
                    let s2_soc = store2_soc;
                    for (var si = 0; si < n_intervals; si++) {
                        let r = residual_arr[si];
                        if (r > 0) {
                            let c = Math.min(r, app.store2.charge_max);
                            s2_soc = Math.min(app.store2.capacity, s2_soc + c * store2_charge_efficiency * power_to_GWh);
                            s2_avail[si] = Math.min(app.store2.discharge_max, s2_soc * store2_discharge_efficiency / power_to_GWh);
                        } else {
                            let avail = Math.min(app.store2.discharge_max, s2_soc * store2_discharge_efficiency / power_to_GWh);
                            s2_avail[si] = avail;
                            let d = Math.min(-r, avail);
                            s2_soc -= d / store2_discharge_efficiency * power_to_GWh;
                        }
                    }
                }

                dp_sched = optimiseStoreDP(residual_arr, {
                    capacity: app.store1.capacity,
                    soc_levels: app.store1.soc_levels,
                    power_to_GWh: power_to_GWh,
                    charge_efficiency: store1_charge_efficiency,
                    discharge_efficiency: store1_discharge_efficiency,
                    charge_max: app.store1.charge_max,
                    discharge_max: app.store1.discharge_max,
                    backup_value: app.store1.backup_value,
                    peak_weight: app.store1.peak_weight,
                    initial_soc: store1_soc,
                    s2_avail: s2_avail
                });
            }

            for (var i = 0; i < n_intervals; i++) {

                let solarpv = solar_arr[i];
                let wind = wind_arr[i];
                let nuclear = nuclear_arr[i];
                let trad_demand = trad_arr[i];
                let heatpump = heatpump_arr[i];
                let ev_demand = ev_arr[i];
                let demand = demand_arr[i];

                if (demand > max_demand) {
                    max_demand = demand;
                }

                var supply = solarpv + wind + nuclear;


                solar_GWh += solarpv * power_to_GWh;
                wind_GWh += wind * power_to_GWh;
                nuclear_GWh += nuclear * power_to_GWh;

                supply_GWh += supply * power_to_GWh;
                demand_GWh += demand * power_to_GWh;

                // Balance
                var balance = supply - demand;

                // Record deficit before store1 storage
                if (balance < 0) {
                    let deficit_before_store1 = -balance;
                    deficit_before_store1_GWh += deficit_before_store1 * power_to_GWh;
                }

                // store1
                if (app.store1.capacity > 0 && dp_sched != null) {
                    // Pre-computed optimal schedule: charge/discharge are
                    // grid-side GW, SOC is taken from the DP trajectory.
                    let charge = dp_sched.charge[i];
                    let discharge = dp_sched.discharge[i];
                    balance -= charge;
                    balance += discharge;
                    store1_soc = dp_sched.soc[i];
                    store1_charge_GWh += charge * power_to_GWh;
                    store1_discharge_GWh += discharge * power_to_GWh;
                    if (charge > store1_max_charge) {
                        store1_max_charge = charge;
                    }
                    if (discharge > store1_max_discharge) {
                        store1_max_discharge = discharge;
                    }
                } else if (app.store1.capacity > 0) {
                    if (balance > 0) {

                        // Charge store1
                        let charge = balance;
                        if (charge > app.store1.charge_max) {
                            charge = app.store1.charge_max;
                        }
                        let charge_after_loss = charge * store1_charge_efficiency;
                        let soc_inc = charge_after_loss * power_to_GWh;
                        // Limit charge to store1 capacity
                        if (store1_soc + soc_inc > app.store1.capacity) {
                            soc_inc = app.store1.capacity - store1_soc;
                            charge_after_loss = soc_inc * (1 / power_to_GWh);
                            charge = charge_after_loss / store1_charge_efficiency;
                        }
                        if (charge > store1_max_charge) {
                            store1_max_charge = charge;
                        }
                        store1_soc += soc_inc;
                        balance -= charge;
                        store1_charge_GWh += charge * power_to_GWh;
                    } else {
                        // Discharge store1
                        let discharge = -balance;
                        if (discharge > app.store1.discharge_max) {
                            discharge = app.store1.discharge_max;
                        }
                        let discharge_before_loss = discharge / store1_discharge_efficiency;
                        let soc_dec = discharge_before_loss * power_to_GWh;
                        // Limit discharge to store1 SOC
                        if (store1_soc - soc_dec < 0) {
                            soc_dec = store1_soc;
                            discharge_before_loss = soc_dec * (1 / power_to_GWh);
                            discharge = discharge_before_loss * store1_discharge_efficiency;
                        }
                        if (discharge > store1_max_discharge) {
                            store1_max_discharge = discharge;
                        }
                        store1_soc -= soc_dec;
                        balance += discharge;
                        store1_discharge_GWh += discharge * power_to_GWh;
                    }
                }

                // Record deficit after store1 storage
                if (balance < 0) {
                    let deficit_after_store1 = -balance;
                    deficit_after_store1_GWh += deficit_after_store1 * power_to_GWh;
                }

                let store2_charge = 0;
                let store2_discharge = 0;

                // Store 2 (hydrogen, e-methanol LDES)
                if (app.store2.enabled) {
                    if (balance > 0) {
                        // Charge store
                        let charge = balance;
                        if (charge > app.store2.charge_max) {
                            charge = app.store2.charge_max;
                        }
                        let charge_after_loss = charge * store2_charge_efficiency;
                        let soc_inc = charge_after_loss * power_to_GWh;
                        // Limit charge to store capacity
                        if (store2_soc + soc_inc > app.store2.capacity) {
                            soc_inc = app.store2.capacity - store2_soc;
                            charge_after_loss = soc_inc * (1 / power_to_GWh);
                            charge = charge_after_loss / store2_charge_efficiency;
                        }
                        if (charge > store2_max_charge) {
                            store2_max_charge = charge;
                        }
                        store2_soc += soc_inc;
                        balance -= charge;
                        store2_charge_GWh += charge * power_to_GWh;
                        store2_charge = charge;
                    } else {
                        // Discharge store
                        let discharge = -balance;
                        if (discharge > app.store2.discharge_max) {
                            discharge = app.store2.discharge_max;
                        }
                        // peak_shaving_balance -= (-balance - app.store2.discharge_max) * power_to_GWh;

                        let discharge_before_loss = discharge / store2_discharge_efficiency;
                        let soc_dec = discharge_before_loss * power_to_GWh;
                        // Limit discharge to store SOC
                        if (store2_soc - soc_dec < 0) {
                            soc_dec = store2_soc;
                            discharge_before_loss = soc_dec * (1 / power_to_GWh);
                            discharge = discharge_before_loss * store2_discharge_efficiency;
                        }
                        if (discharge > store2_max_discharge) {
                            store2_max_discharge = discharge;
                        }
                        store2_soc -= soc_dec;
                        balance += discharge;
                        store2_discharge_GWh += discharge * power_to_GWh;
                        store2_discharge = discharge;
                    }
                }

                // Record max and min store level
                if (store2_soc > store2_max_level) {
                    store2_max_level = store2_soc;
                }
                if (store2_soc < store2_min_level) {
                    store2_min_level = store2_soc;
                }

                if (peak_shaving_balance > 0) {
                    peak_shaving_balance = 0;
                }

                if (-peak_shaving_balance > max_peak_shaving_deficit) {
                    max_peak_shaving_deficit = -peak_shaving_balance;
                }

                let backup_demand = 0;

                // Record deficit after store2 storage
                if (balance < 0) {
                    let deficit_after_store2 = -balance;
                    deficit_after_store2_GWh += deficit_after_store2 * power_to_GWh;

                    // unmet demand is backup demand (gas turbines)
                    backup_demand = deficit_after_store2;
                    backup_demand_GWh += backup_demand * power_to_GWh;
                    if (backup_demand > max_backup_demand) {
                        max_backup_demand = backup_demand;
                    }

                } else {
                    balance_surplus += balance * power_to_GWh;
                    if (balance > max_curtailement) {
                        max_curtailement = balance;
                    }
                }

                let time = series[0].data[i][0];
                solar_data.push([time, solarpv]);
                wind_data.push([time, wind]);
                nuclear_data.push([time, nuclear]);
                demand_data.push([time, demand]);
                trad_demand_data.push([time, trad_demand]);
                heatpump_demand_data.push([time, heatpump]);
                ev_demand_data.push([time, ev_demand]);

                store1_soc_data.push([time, store1_soc]);
                store2_soc_data.push([time, store2_soc]);
                store2_discharge_data.push([time, store2_discharge]);
                demand_plus_store_charge_data.push([time, demand + store2_charge]);
                backup_demand_data.push([time, backup_demand]);
            }

            if (app.auto_optimise) {
                if (store1_max_charge < app.store1.charge_max) {
                    app.store1.charge_max = 1 * (store1_max_charge).toFixed(2);
                }
                if (store2_max_charge < app.store2.charge_max) {
                    app.store2.charge_max = 1 * (store2_max_charge).toFixed(2);
                }
                if (store1_max_discharge < app.store1.discharge_max) {
                    app.store1.discharge_max = 1 * (store1_max_discharge).toFixed(2);
                }
                if (store2_max_discharge < app.store2.discharge_max) {
                    app.store2.discharge_max = 1 * (store2_max_discharge).toFixed(2);
                }
                // let store_diff = store2_max_level - store2_min_level;
                // app.store2.capacity = 1*(store_diff*1.1).toFixed(0);
                // app.store2.starting_soc = 1*(store_diff*0.05).toFixed(0);
            }

            app.store1.charge_CF = store1_charge_GWh / (app.store1.charge_max * 24 * 365);
            app.store2.charge_CF = store2_charge_GWh / (app.store2.charge_max * 24 * 365);
            app.store1.discharge_CF = store1_discharge_GWh / (app.store1.discharge_max * 24 * 365);
            app.store2.discharge_CF = store2_discharge_GWh / (app.store2.discharge_max * 24 * 365);

            // backup
            app.backup.demand_GWh = backup_demand_GWh;
            app.backup.max = max_backup_demand;
            app.backup.capacity = max_backup_demand * (1 + app.backup.margin * 0.01);

            app.backup.CF = 0;
            if (backup_demand_GWh>0) {
                app.backup.CF = backup_demand_GWh / (app.backup.capacity * 24 * 365);
            }

            app.balance.before_store1 = (demand_GWh - deficit_before_store1_GWh) / demand_GWh;
            app.balance.after_store1 = (demand_GWh - deficit_after_store1_GWh) / demand_GWh;
            app.balance.after_store2 = (demand_GWh - deficit_after_store2_GWh) / demand_GWh;
            app.balance.unmet = deficit_after_store2_GWh;
            app.balance.surplus = balance_surplus;
            app.max_curtailement = max_curtailement;

            app.store1.cycles = 0.5 * (store1_charge_GWh + store1_discharge_GWh) / app.store1.capacity;
            if (app.store1.capacity == 0) {
                app.store1.cycles = 0;
            }
            app.store2.cycles = 0.5 * (store2_charge_GWh + store2_discharge_GWh) / app.store2.capacity;
            if (app.store2.capacity == 0) {
                app.store2.cycles = 0;
            }

            // Copy over to vue (faster than using vue reactive data during model run)
            app.solar_GWh = solar_GWh;
            app.wind_GWh = wind_GWh;
            app.nuclear_GWh = nuclear_GWh;
            app.supply_GWh = supply_GWh;
            app.demand_GWh = demand_GWh;
            app.store1_discharge_GWh = store1_discharge_GWh;

            app.max_demand = max_demand;
            app.backup_demand_GWh = backup_demand_GWh;
            app.model_costs();

            console.log("Run count: " + app.run_count);
            console.log("Annual wind: " + wind_GWh.toFixed(0) + " GWh");
            console.log("Annual solar: " + solar_GWh.toFixed(0) + " GWh");
            console.log("Annual nuclear: " + nuclear_GWh.toFixed(0) + " GWh");

            // SOC convergence: feed each store's final SOC back in as its
            // starting SOC and re-run until the year is in steady state
            // (start ≈ end), so results don't depend on free initial charge.
            // Only re-run when a store is actually in use and its SOC moved.
            let store1_soc_moved = app.store1.capacity > 0 && Math.abs(store1_soc - store1_soc_start_used) > 1;
            let store2_soc_moved = app.store2.enabled && Math.abs(store2_soc - store2_soc_start_used) > 10;
            app.store1.soc_start = store1_soc;
            app.store2.starting_soc = store2_soc;
            if ((store1_soc_moved || store2_soc_moved) && app.run_count < 3) {
                console.log("Re-running model with store1 SOC start: " + store1_soc.toFixed(2) + " GWh, store2 SOC start: " + store2_soc.toFixed(2) + " GWh");
                app.model();
            }

            app.draw_power_view();
        },
        model_costs: function () {

            // Battery storage LCOS calculation
            app.store1.cost_mwh = 0;
            if (app.store1.capacity > 0 && app.store1.cycles > 0) {
                let storage1_lcoe = calculateLCOE({
                    hurdle_rate: 8.9 * 0.01,
                    pre_development_years: 1,              // assumed
                    construction_years: 2,                 // Kilmarnock South project
                    operation_years: 20,
                    net_power_output_mw: 600,              // 600 MWh, this value makes no difference to LCOE 
                    gross_load_factor: app.store1.cycles/(24*365),
                    availability: 1.0,
                    pre_development_costs_per_kw: 0,       // assumed part of the capital cost
                    construction_capital_cost_per_kw: app.store1.capital_cost_per_kwh,
                    om_fixed_costs_per_kw_year: 0,
                    om_variable_costs_per_mwh: 3,
                    fuel_price_per_therm: 0.0,
                    mwh_per_therm: 1.0,
                    efficiency: 1.0,
                    carbon_price_per_ton: 0.0,
                    co2_scrubbing_prc: 0.0,
                    co2_emissions_per_therm: 0.0
                });
                app.store1.cost_mwh = storage1_lcoe.total_lcoe;
            }

            // Backup gas turbine LCOE calculation
            app.backup.cost_mwh = 0;
            if (app.backup.CF > 0) {
                let carbon_price = 0;
                if (app.include_carbon_cost) {
                    // higher than gov LCOE spreadsheet?
                    // and higher than combined ETS + UK carbon tax? ~£50-£60/tonne?
                    carbon_price = 120;
                }

                let gas_price_per_mwh = 25; // ~£0.73 per therm, 1 MWh = 0.0293 therms

                // biomethane price per mwh
                let biomethane_price_per_mwh = 75;

                let backup_lcoe = calculateLCOE({
                    hurdle_rate: 8.9 * 0.01,
                    pre_development_years: 2,
                    construction_years: 3,
                    operation_years: 25,
                    net_power_output_mw: 1666,
                    gross_load_factor: app.backup.CF,
                    availability: 0.93,
                    pre_development_costs_per_kw: 20,
                    construction_capital_cost_per_kw: 1000,
                    om_fixed_costs_per_kw_year: 22,
                    om_variable_costs_per_mwh: 5,
                    fuel_price_per_therm: gas_price_per_mwh * 0.0293,
                    mwh_per_therm: 0.0293,
                    efficiency: 0.54,
                    carbon_price_per_ton: carbon_price,
                    co2_scrubbing_prc: 0.0,
                    co2_emissions_per_therm: 5.37
                });

                app.backup.cost_mwh = backup_lcoe.total_lcoe;
                app.carbon_cost = backup_lcoe.carbon_cost_per_mwh;
            }
            app.backup_cost_per_mwh = app.backup.cost_mwh;

            // Capacity factor of overall demand
            let demand_capacity_factor = app.demand_GWh / (app.max_demand * 1.1 * 24 * 365);

            app.grid_cost_per_mwh = calculateLCOE({
                hurdle_rate: 0.075,
                pre_development_years: 2,
                construction_years: 4,
                operation_years: 45,
                net_power_output_mw: app.max_demand * 1.1,
                gross_load_factor: demand_capacity_factor,
                availability: 1.0,
                pre_development_costs_per_kw: 50,
                construction_capital_cost_per_kw: 2350,
                om_fixed_costs_per_kw_year: 24,
                om_variable_costs_per_mwh: 0.0,
                fuel_price_per_therm: 0.0,
                mwh_per_therm: 1.0,
                efficiency: 1.0,
                carbon_price_per_ton: 0.0,
                co2_scrubbing_prc: 0.0,
                co2_emissions_per_therm: 0.0
            }).total_lcoe;

            app.solar_cost = app.solar_GWh * app.solar_cost_per_mwh;
            app.wind_cost = app.wind_GWh * app.wind_cost_per_mwh;
            app.nuclear_cost = app.nuclear_GWh * app.nuclear_cost_per_mwh;
            app.backup_cost = app.backup.demand_GWh * app.backup.cost_mwh;
            app.store1_cost = app.store1_discharge_GWh * app.store1.cost_mwh;

            let total_energy_cost = app.solar_cost + app.wind_cost + app.nuclear_cost + app.backup_cost + app.store1_cost;

            // Energy cost per MWh not including grid costs
            app.energy_cost_per_mwh = total_energy_cost / app.demand_GWh;

            // Total cost per MWh including grid costs
            app.total_cost_per_mwh = app.energy_cost_per_mwh + app.grid_cost_per_mwh;

        },
        normalise: function () {
            // Normalise solar data to match solar_GWp
            input_solar_data_GWh = 0;
            input_wind_data_GWh = 0;
            input_demand_data_GWh = 0;
            input_heatpump_elec_data_GWh = 0;
            input_heatpump_heat_data_GWh = 0;

            let power_to_GWh = app.interval / 3600;

            for (var i = 0; i < series[0].data.length; i++) {
                let demand = series[0].data[i][1] * 0.001; // MW to GW
                let wind = series[1].data[i][1];
                let solar = series[2].data[i][1];
                let heatpump_elec = series[3].data[i][1] * 0.001;
                let heatpump_heat = series[4].data[i][1] * 0.001;

                input_demand_data_GWh += demand * power_to_GWh;
                input_wind_data_GWh += wind * power_to_GWh;
                input_solar_data_GWh += solar * power_to_GWh;
                input_heatpump_elec_data_GWh += heatpump_elec * power_to_GWh;
                input_heatpump_heat_data_GWh += heatpump_heat * power_to_GWh;
            }

            // app.standard_demand_TWh = (input_demand_data_GWh * 0.001).toFixed(1);
        },
        draw_power_view: function () {

            app.view = "power";

            var plot_series = [];

            if (app.store2.enabled) {
                plot_series.push({
                    data: timeseries(demand_plus_store_charge_data),
                    label: "Store 2 charge",
                    color: "#000",
                    lines: { show: true, fill: 0.8, lineWidth: 0 },
                    stack: false
                });
            }

            // Demand stack (stack: 1)
            plot_series.push({
                data: timeseries(trad_demand_data),
                label: "Trad demand",
                color: "#0699fa",
                lines: { show: true, fill: 1.0, lineWidth: 0 },
                stack: 1
            });

            plot_series.push({
                data: timeseries(ev_demand_data),
                label: "EV demand",
                color: "#8b008b",
                lines: { show: true, fill: 1.0, lineWidth: 0 },
                stack: 1
            });

            plot_series.push({
                data: timeseries(heatpump_demand_data),
                label: "Heat pump demand",
                color: "#ff4500",
                lines: { show: true, fill: 1.0, lineWidth: 0 },
                stack: 1
            });

            // Supply stack (stack: 2)
            plot_series.push({
                data: timeseries(nuclear_data),
                label: "Nuclear",
                color: "#ff69b4",
                lines: { show: true, fill: 0.8, lineWidth: 0 },
                stack: 2
            });
            
            plot_series.push({
                data: timeseries(wind_data),
                label: "Wind",
                color: "green",
                lines: { show: true, fill: 0.8, lineWidth: 0 },
                stack: 2
            });
            
            plot_series.push({
                data: timeseries(solar_data),
                label: "Solar",
                color: "#dccc1f",
                lines: { show: true, fill: 0.8, lineWidth: 0 },
                stack: 2
            });

            if (app.store2.enabled) {
                plot_series.push({
                    data: timeseries(store2_discharge_data),
                    label: "Store 2 discharge",
                    color: "#ff8c00",
                    lines: { show: true, fill: 0.3, lineWidth: 0 },
                    stack: 2,
                });
            }

            if (app.store1.capacity > 0) {
                plot_series.push({
                    data: timeseries(store1_soc_data),
                    label: "SOC",
                    color: "#000",
                    yaxis: 2,
                    lines: { show: true, fill: false, lineWidth: 1 }
                });
            }

            if (app.store2.capacity > 0 && app.store2.enabled) {
                plot_series.push({
                    data: timeseries(store2_soc_data),
                    label: "Store 2",
                    color: "#000",
                    yaxis: 2,
                    lines: { show: true, fill: false, lineWidth: 1 }
                });
            }

            var options = {
                xaxis: {
                    mode: "time",
                },
                yaxis: {
                    min: 0
                },
                selection: {
                    mode: "x"
                },
                grid: {
                    hoverable: true,
                    clickable: true
                }
            };

            $.plot("#graph", plot_series, options);

        },
        zoom_out: function () {
            view.zoomout();
            view.calc_interval(2400, 900);
            app.draw_power_view();
        },
        zoom_in: function () {
            view.zoomin();
            view.calc_interval(2400, 900);
            app.draw_power_view();
        },
        pan_left: function () {
            view.panleft();
            app.draw_power_view();
        },
        pan_right: function () {
            view.panright();
            app.draw_power_view();
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
    },
    mounted: function () {
        // feeds: demand, wind, solar, heatpump
        this.loading = true;
        feed.getdata("477241,480172,480862,476422,536709", "2024-06-01T00:00:00Z", "2025-06-01T00:00:00Z", this.interval, 1, function (result) {
            series = result;

            view.start = series[0].data[0][0];
            view.end = series[0].data[series[0].data.length - 1][0];
            view.calc_interval(2400, 900);

            app.normalise();
            app.update();
            app.loading = false;
        });
    }
});

// return subset of data for power view - keeps things snappy
function timeseries(data) {
    if (data == undefined) return [];
    var start_time = data[0][0];
    var len = data.length;
    var ts = [];

    for (var time = view.start; time < view.end; time += view.interval * 1000) {
        let pos = Math.floor((time - start_time) / (app.interval * 1000));
        if (pos >= 0 && pos < len) {
            ts.push(data[pos]);
        }
    }
    return ts;
}

$("#graph").bind("plotselected", function (event, ranges) {
    view.start = ranges.xaxis.from;
    view.end = ranges.xaxis.to;
    view.calc_interval(2400, 900);
    app.draw_power_view();
});

function wind_gas_comparison() {
    // 1. Set wind percentage of demand to 0%
    // 2. Set solar and nuclear to 0%
    // 3. Set heatpump households to 0
    // 4. Increase wind percentage of demand in 10% increments
    // 5. Record backup cost per MWh at each step
    console.log("---- Wind vs Gas Backup Cost Comparison ----");
    app.wind_prc_of_demand = 0;
    app.solar_prc_of_demand = 0;
    app.nuclear_prc_of_demand = 0;
    app.heatpump_households = 0;

    let results = [];

    for (let wind_perc = 0; wind_perc <= 150; wind_perc += 10) {
        app.wind_prc_of_demand = wind_perc;
        app.model();
        results.push({
            wind_perc: wind_perc*0.01,
            wind_curtailment: app.balance.surplus/app.supply_GWh,
            backup_demand_perc: (app.backup.demand_GWh/app.demand_GWh),
            backup_Cf: app.backup.CF*0.01,
            backup_cost_mwh: app.backup.cost_mwh,
            combined_cost_mwh: app.total_cost_per_mwh
        });
    }

    console.log("Results:", results);

    // Output CSV
    let csv_output = "Wind % of demand,Wind curtailment %,Backup demand %,Backup Capacity Factor %,Backup cost £/MWh,Combined cost £/MWh\n";
    results.forEach(result => {
        csv_output += result.wind_perc + "," + result.wind_curtailment.toFixed(2) + "," + result.backup_demand_perc.toFixed(2) + "," + (result.backup_Cf * 100).toFixed(2) + "," + result.backup_cost_mwh.toFixed(2) + "," + result.combined_cost_mwh.toFixed(2) + "\n";
    });
    app.csv_output = csv_output;
};
// ---- optimal store1 dispatch (dynamic programming) ----
// Adapted from tools/solarmatching/model.js optimiseBatteryDP. Same machinery:
// state-of-charge discretised into `soc_levels` steps, forward DP over the
// whole year, backtrack to recover the schedule. What differs is the per-slot
// cost. The solarmatching DP minimises a bill against half-hourly import /
// export prices; here there are no prices, so the DP minimises a system cost:
//
//   - each GWh of backup (gas) generation costs `backup_value` (£/MWh scale,
//     only relative magnitudes matter)
//   - backup POWER is additionally penalised quadratically (`peak_weight` per
//     GW^2 per hour). This is what makes the battery shave the highest
//     residual peaks — reducing the gas fleet capacity — instead of dumping
//     its charge into the first shallow deficit of the winter.
//   - store2 (LDES), when enabled, is modelled as a power-capped downstream
//     store with effectively unlimited energy: deficits within its discharge
//     cap cost little (so the battery holds its charge for deficits beyond
//     the cap, which is where gas actually runs), and surplus within its
//     charge cap has some value (energy absorbed displaces backup later at
//     the LDES round-trip efficiency).
//
// The DP may charge from the grid (i.e. from backup) ahead of a deep peak:
// that raises backup energy slightly but can cut the required backup capacity,
// which the quadratic peak term prices in.
//
// All powers are grid-side GW, matching model()'s `balance` convention:
// charge is drawn from balance (before charge losses), discharge is added to
// balance (after discharge losses). Returns { charge, discharge, soc } arrays
// with one entry per interval (soc is GWh at the end of each interval).
function optimiseStoreDP(residual, opts) {
    var N = residual.length;
    var cap = opts.capacity;                                   // GWh
    var K = Math.max(2, Math.round(opts.soc_levels || 100));   // SOC steps
    var nLev = K + 1;                                          // SOC levels (states)
    var step = cap / K;                                        // GWh per level
    var dt = opts.power_to_GWh;                                // h per interval
    var ceff = opts.charge_efficiency;
    var deff = opts.discharge_efficiency;

    // Cost model (relative units, £/MWh scale)
    var Ce = opts.backup_value;                  // per GWh of backup generation
    var lam = opts.peak_weight || 0;             // per GW^2 per h of backup power
    var s2_avail = opts.s2_avail || null;        // LDES discharge power available per slot (GW)
    var SOC_PEN = 1e-9;                          // tie-break: prefer holding less

    var pmaxCh = opts.charge_max;                // GW
    var pmaxDch = opts.discharge_max;            // GW

    // Reachable SOC-level change per slot, bounded by the power limits.
    // Also capped at 64 levels each way: DP cost scales with the number of
    // reachable transitions, and a store whose power rating can swing a large
    // fraction of its capacity in one slot would otherwise make the action
    // space (and runtime) explode. The cap only bites in that degenerate
    // corner (tiny capacity + huge power), where it acts as a rate limit.
    var upLevels = Math.floor((pmaxCh * ceff * dt) / step);
    var dnLevels = Math.floor((pmaxDch / deff * dt) / step);
    if (upLevels < 1) upLevels = 1; if (upLevels > K) upLevels = K;
    if (dnLevels < 1) dnLevels = 1; if (dnLevels > K) dnLevels = K;
    if (upLevels > 64) upLevels = 64;
    if (dnLevels > 64) dnLevels = 64;

    // Battery grid power (GW) per SOC-level delta; depends only on the delta.
    var dLo = -dnLevels, dHi = upLevels;
    var dN = dHi - dLo + 1;
    var batPower = new Float64Array(dN);   // >0 discharge (adds to balance), <0 charge
    for (var d = dLo; d <= dHi; d++) {
        var dsoc = d * step;               // cell-side GWh change
        if (dsoc >= 0) {                   // charging (d == 0 -> idle, zero power)
            batPower[d - dLo] = -(dsoc / ceff / dt);
        } else {                           // discharging
            batPower[d - dLo] = (-dsoc) * deff / dt;
        }
    }

    // System cost of a post-battery balance b (GW) for slot t. All deficit
    // energy is priced at Ce: when the LDES is net-draining (the usual regime)
    // a GWh it doesn't have to deliver now is a GWh of backup displaced later,
    // so deficit within its reach is worth about the same as backup energy.
    // The quadratic peak term applies only to deficit beyond what the LDES can
    // actually deliver in that slot (power cap AND remaining energy, via
    // s2_avail) — the part that really sets the gas fleet size. Surplus is
    // worth nothing to the optimiser (it is curtailed or absorbed downstream);
    // pricing it would open a buy-low / sell-high loop that makes the DP churn
    // the battery against the LDES instead of shaving real peaks.
    var slotCost = function (b, t) {
        if (b >= 0) return 0;
        var deficit = -b;
        var bp = s2_avail ? Math.max(0, deficit - s2_avail[t]) : deficit;
        return Ce * deficit * dt + lam * bp * bp * dt;
    };

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
        var net = residual[t];                                  // GW, before battery
        // Charge from renewable surplus only. Charging through a deficit
        // looks cheap to the DP (backup energy at Ce) but in reality much of
        // that energy is pulled out of the LDES at its poor discharge
        // efficiency, draining it early and increasing unmet demand later —
        // an interaction outside this state space. Surplus-only charging
        // avoids it and keeps the battery genuinely zero-carbon.
        var dHiT = net > 0 ? Math.floor((Math.min(pmaxCh, net) * ceff * dt) / step) : 0;
        if (dHiT > dHi) dHiT = dHi;
        for (var dd = dLo; dd <= dHiT; dd++) {
            var cost = slotCost(net + batPower[dd - dLo], t);
            // Valid start levels s such that sp = s + dd stays within [0, K].
            var sStart = dd > 0 ? 0 : -dd;
            var sEnd = dd > 0 ? K - dd : K;
            for (var ss = sStart; ss <= sEnd; ss++) {
                var from = dp[ss];
                if (from === INF) continue;
                var sp = ss + dd;
                var cand = from + cost + pen[sp];
                if (cand < newdp[sp]) { newdp[sp] = cand; choice[base + sp] = ss; }
            }
        }
        var tmp = dp; dp = newdp; newdp = tmp;   // swap rows
    }

    // Cheapest terminal SOC, then backtrack to recover the dispatch + trajectory.
    var sBest = 0, best = INF;
    for (var se = 0; se < nLev; se++) if (dp[se] < best) { best = dp[se]; sBest = se; }

    var charge = new Float64Array(N);
    var discharge = new Float64Array(N);
    var soc = new Float64Array(N);
    var cur = sBest;
    for (var tb = N - 1; tb >= 0; tb--) {
        var prev = choice[tb * nLev + cur];
        var bp2 = batPower[(cur - prev) - dLo];
        if (bp2 < 0) charge[tb] = -bp2; else discharge[tb] = bp2;
        soc[tb] = cur * step;     // SOC at end of slot tb
        cur = prev;
    }
    return { charge: charge, discharge: discharge, soc: soc };
}
