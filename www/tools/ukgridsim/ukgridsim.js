// Start by loading hourly average outside temperature data from emoncms.org API
// Create basic Vue outline

var series = [];

// Used for input data normalisation
var input_solar_data_GWh = 0;
var input_wind_data_GWh = 0;
var input_demand_data_GWh = 0;
var input_heatpump_data_GWh = 0;

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

        // demand
        standard_demand_TWh: 0,
        heatpump_households: 0.5,

        // electric vehicles
        ev_households: 1.0, // million
        ev_miles_per_household: 12000,
        ev_summer_efficiency: 4.5, // miles per kWh
        ev_winter_efficiency: 3.5, // miles per kWh
        ev_charging_efficiency: 85, // %

        // solar generation
        solar_prc_of_demand: 6,
        solar_GWh_per_GWp: 870,
        solar_GWp: 0,
        solar_GWh: 0,
        solar_cost_per_mwh: 75, // Latest AR7 auction results

        // wind generation
        wind_prc_of_demand: 42,
        wind_cap_factor: 35,
        wind_GWp: 0,
        wind_GWh: 0,
        wind_cost_per_mwh: 91, // Latest AR7 auction results

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
            round_trip_efficiency: 80
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

            // Demand
            app.demand_GWh = (input_demand_data_GWh * standard_demand_scaler) + (input_heatpump_data_GWh * app.heatpump_households);

            // Calculate EV demand
            // Annual miles per household converted to kWh using average efficiency
            let avg_efficiency = (app.ev_summer_efficiency + app.ev_winter_efficiency) / 2;
            let annual_kwh_per_household = (app.ev_miles_per_household / avg_efficiency) / (app.ev_charging_efficiency / 100);
            let ev_demand_GWh_annual = (annual_kwh_per_household * app.ev_households * 1000000) / 1000000;
            
            // Daily flat demand in GW
            let ev_daily_demand_GW = ev_demand_GWh_annual / (365 * 24);
            
            // Add EV demand to total
            app.demand_GWh += ev_demand_GWh_annual;

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
            let store1_charge_efficiency = 1 - ((1 - app.store1.round_trip_efficiency * 0.01) / 2);
            let store1_discharge_efficiency = 1 - ((1 - app.store1.round_trip_efficiency * 0.01) / 2);
            app.store1.discharge_max = app.store1.charge_max;

            // Setup store2
            let store2_soc = app.store2.starting_soc;
            let store2_charge_efficiency = app.store2.charge_efficiency * 0.01;
            let store2_discharge_efficiency = app.store2.discharge_efficiency * 0.01;

            let power_to_GWh = app.interval / 3600;

            // Normalisation factors
            let wind_normalisation_factor = app.wind_GWh / input_wind_data_GWh;
            let solar_normalisation_factor = app.solar_GWh_per_GWp / input_solar_data_GWh;

            // Max backup demand
            let max_backup_demand = 0;

            for (var i = 0; i < series[0].data.length; i++) {

                // Solar generation
                let solarpv = series[2].data[i][1] * solar_normalisation_factor * app.solar_GWp;
                let wind = series[1].data[i][1] * wind_normalisation_factor;
                let nuclear = app.nuclear_GWp * app.nuclear_cap_factor / 100;

                // Demand
                let trad_demand = series[0].data[i][1] * 0.001 * standard_demand_scaler; // MW to GW
                let heatpump = series[3].data[i][1] * 0.001 * app.heatpump_households;

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
                let seasonal_efficiency = app.ev_winter_efficiency + 
                    (app.ev_summer_efficiency - app.ev_winter_efficiency) * (efficiency_variation + 1) / 2;
                
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
                if (app.store1.capacity > 0) {
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
                        if (discharge > app.store1.discharge_max * 1000) {
                            discharge = app.store1.discharge_max * 1000;
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
            app.store2.cycles = 0.5 * (store2_charge_GWh + store2_discharge_GWh) / app.store2.capacity;

            // Copy over to vue (faster than using vue reactive data during model run)
            app.solar_GWh = solar_GWh;
            app.wind_GWh = wind_GWh;
            app.nuclear_GWh = nuclear_GWh;
            app.supply_GWh = supply_GWh;
            app.demand_GWh = demand_GWh;

            // Costs
            // cost of backup
            // app.backup.cost_mwh = 1000 * Math.pow(app.backup.CF*100,-0.65);
            // app.backup.cost_mwh = 852 * Math.pow(app.backup.CF*100,-0.476);

            app.backup.cost_mwh = 0;
            if (app.backup.CF > 0) {

                let carbon_price = 0;
                if (app.include_carbon_cost) {
                    // higher than gov LCOE spreadsheet?
                    // and higher than combined ETS + UK carbon tax? ~£50-£60/tonne?
                    carbon_price = 130;
                }

                let backup_lcoe = calculateLCOE({
                    hurdle_rate: 8.9 * 0.01,
                    pre_development_years: 2,
                    construction_years: 3,
                    operation_years: 25,
                    net_power_output_mw: 1666,
                    gross_load_factor: app.backup.CF,
                    availability: 1.0,
                    pre_development_costs_per_kw: 17.11,
                    // increased capital cost (review)
                    construction_capital_cost_per_kw: 989*1.2,
                    om_fixed_costs_per_kw_year: 22.9,
                    om_variable_costs_per_mwh: 4.5,
                    fuel_price_per_therm: 0.73,
                    mwh_per_therm: 0.0293,
                    efficiency: 0.60,
                    carbon_price_per_ton: carbon_price,
                    co2_scrubbing_prc: 0.0,
                    co2_emissions_per_therm: 5.37
                });

                app.backup.cost_mwh = backup_lcoe.total_lcoe;
                app.carbon_cost = backup_lcoe.carbon_cost_per_mwh;
            }

            app.backup_cost_per_mwh = app.backup.cost_mwh;
            console.log(app.backup.cost_mwh);

            let backup_additional = (1.0 - app.balance.after_store1) * app.backup.cost_mwh;
            console.log("Backup additional cost: " + backup_additional.toFixed(2) + " £/MWh");

            let solar_cost = (app.solar_prc_of_demand/100) * app.solar_cost_per_mwh;
            console.log("Solar cost: " + solar_cost.toFixed(2) + " £/MWh");

            let wind_cost = (app.wind_prc_of_demand/100) * app.wind_cost_per_mwh;
            console.log("Wind cost: " + wind_cost.toFixed(2) + " £/MWh");

            let nuclear_cost = (app.nuclear_prc_of_demand/100) * app.nuclear_cost_per_mwh;
            console.log("Nuclear cost: " + nuclear_cost.toFixed(2) + " £/MWh");

            // Capacity factor of overall demand
            let demand_capacity_factor = app.demand_GWh / (max_demand * 1.1 * 24 * 365);
            console.log("Demand capacity factor: " + (demand_capacity_factor*100).toFixed(2) + " %");

            app.grid_cost_per_mwh = calculateLCOE({
                hurdle_rate: 0.075,
                pre_development_years: 2,
                construction_years: 4,
                operation_years: 45,
                net_power_output_mw: max_demand * 1.1,
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

            console.log("Grid cost: " + app.grid_cost_per_mwh.toFixed(2) + " £/MWh");

            app.energy_cost_per_mwh = solar_cost + wind_cost + nuclear_cost + backup_additional;
            let combined_cost = app.energy_cost_per_mwh + app.grid_cost_per_mwh;
            console.log("Combined cost: " + combined_cost.toFixed(2) + " £/MWh");

            let total_cost = 0;
            total_cost += app.solar_GWh * app.solar_cost_per_mwh;
            total_cost += app.wind_GWh * app.wind_cost_per_mwh;
            total_cost += app.nuclear_GWh * app.nuclear_cost_per_mwh;
            total_cost += backup_demand_GWh * app.backup.cost_mwh;

            let combined_cost_2 = total_cost / app.demand_GWh;
            combined_cost_2 += app.grid_cost_per_mwh;

            console.log("Combined cost (method 2): " + combined_cost_2.toFixed(2) + " £/MWh");
            app.total_cost_per_mwh = combined_cost_2;


            console.log("Run count: " + app.run_count);
            console.log("Annual wind: " + wind_GWh.toFixed(0) + " GWh");
            console.log("Annual solar: " + solar_GWh.toFixed(0) + " GWh");
            console.log("Annual nuclear: " + nuclear_GWh.toFixed(0) + " GWh");

            app.store1.soc_start = store1_soc;
            if (store1_soc > 10 && app.run_count < 3) {
                console.log("Re-running model with store1 SOC start: " + app.store1.soc_start.toFixed(2) + " GWh");
                app.model();
            }

            app.store2.starting_soc = store2_soc;
            if (store2_soc > 10 && app.run_count < 3) {
                console.log("Re-running model with store2 SOC start: " + app.store2.starting_soc.toFixed(2) + " GWh");
                app.model();
            }

            app.draw_power_view();
        },
        normalise: function () {
            // Normalise solar data to match solar_GWp
            input_solar_data_GWh = 0;
            input_wind_data_GWh = 0;
            input_demand_data_GWh = 0;
            input_heatpump_data_GWh = 0;

            let power_to_GWh = app.interval / 3600;

            for (var i = 0; i < series[0].data.length; i++) {
                let demand = series[0].data[i][1] * 0.001; // MW to GW
                let wind = series[1].data[i][1];
                let solar = series[2].data[i][1];
                let heatpump = series[3].data[i][1] * 0.001;

                input_demand_data_GWh += demand * power_to_GWh;
                input_wind_data_GWh += wind * power_to_GWh;
                input_solar_data_GWh += solar * power_to_GWh;
                input_heatpump_data_GWh += heatpump * power_to_GWh;

            }

            app.standard_demand_TWh = (input_demand_data_GWh * 0.001).toFixed(1);
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
        feed.getdata("477241,480172,480862,476422", "2024-06-01T00:00:00Z", "2025-06-01T00:00:00Z", this.interval, 1, function (result) {
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