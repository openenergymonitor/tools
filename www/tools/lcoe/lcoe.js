// Vue application for LCOE (Levelized Cost of Energy) calculator
const app = new Vue({
    el: '#app',
    data: {
        selectedPreset: '',
        
        // Presets
        presets: {
            offshore_wind: {
                hurdle_rate: 8.9,
                pre_development_years: 7,
                construction_years: 3,
                operation_years: 30,
                net_power_output_mw: 1297,
                gross_load_factor: 48,
                availability: 100,
                pre_development_costs_per_kw: 170,
                construction_capital_cost_per_kw: 2500,
                om_fixed_costs_per_kw_year: 138.7,
                om_variable_costs_per_mwh: 0.0,
                fuel_price_per_therm: 0.0,
                mwh_per_therm: 1.0,
                efficiency: 100,
                carbon_price_per_ton: 0.0,
                co2_scrubbing_prc: 0.0,
                co2_emissions_per_therm: 0.0
            },
            gas_ccgt: {
                hurdle_rate: 8.9,
                pre_development_years: 2,
                construction_years: 3,
                operation_years: 25,
                net_power_output_mw: 1666,
                gross_load_factor: 30,
                availability: 93,
                pre_development_costs_per_kw: 20,
                construction_capital_cost_per_kw: 1000,
                om_fixed_costs_per_kw_year: 22,
                om_variable_costs_per_mwh: 5,
                fuel_price_per_therm: 0.73,
                mwh_per_therm: 0.0293,
                efficiency: 54,
                carbon_price_per_ton: 120,
                co2_scrubbing_prc: 0.0,
                co2_emissions_per_therm: 5.37
            }
        },
        
        hurdle_rate: 7.6,                           // Hurdle rate (%)
        pre_development_years: 8,                   // Pre-development phase (years)
        construction_years: 2,                      // Construction phase (years)
        operation_years: 35,                        // Operation phase (years)
        net_power_output_mw: 51.6,                  // Net power output (MW)
        gross_load_factor: 36.4,                    // Gross load factor (%)
        availability: 100,                          // Availability (%)
        pre_development_costs_per_kw: 84.88,        // Pre-development costs (£/kW)
        construction_capital_cost_per_kw: 1570.4,   // Construction capital cost (£/kW) - 1255 + 315.4
        om_fixed_costs_per_kw_year: 39.97,          // Fixed O&M costs (£/kW/year) - sum of fixed + insurance + connection
        om_variable_costs_per_mwh: 0.0,             // Variable O&M costs (£/MWh)
        fuel_price_per_therm: 0.0,                  // Fuel price (£/therm)
        mwh_per_therm: 1.0,                         // MWh per therm conversion
        efficiency: 100,                            // Efficiency (%)
        carbon_price_per_ton: 0.0,                  // Carbon price (£/ton)
        co2_scrubbing_prc: 0.0,                     // CO2 scrubbing percentage (%)
        co2_emissions_per_therm: 0.0,               // CO2 emissions (kg/therm)
        
        // Results
        lcoe_results: null,
    },
    methods: {
        // Load preset values
        loadPreset: function() {
            if (this.selectedPreset && this.presets[this.selectedPreset]) {
                const preset = this.presets[this.selectedPreset];
                this.hurdle_rate = preset.hurdle_rate;
                this.pre_development_years = preset.pre_development_years;
                this.construction_years = preset.construction_years;
                this.operation_years = preset.operation_years;
                this.net_power_output_mw = preset.net_power_output_mw;
                this.gross_load_factor = preset.gross_load_factor;
                this.availability = preset.availability;
                this.pre_development_costs_per_kw = preset.pre_development_costs_per_kw;
                this.construction_capital_cost_per_kw = preset.construction_capital_cost_per_kw;
                this.om_fixed_costs_per_kw_year = preset.om_fixed_costs_per_kw_year;
                this.om_variable_costs_per_mwh = preset.om_variable_costs_per_mwh;
                this.fuel_price_per_therm = preset.fuel_price_per_therm;
                this.mwh_per_therm = preset.mwh_per_therm;
                this.efficiency = preset.efficiency;
                this.carbon_price_per_ton = preset.carbon_price_per_ton;
                this.co2_scrubbing_prc = preset.co2_scrubbing_prc;
                this.co2_emissions_per_therm = preset.co2_emissions_per_therm;
                
                this.update();
            }
        },
        
        // Recalculate LCOE when inputs change
        update: function () {
            this.lcoe_results = calculateLCOE({
                hurdle_rate: this.hurdle_rate * 0.01,
                pre_development_years: this.pre_development_years,
                construction_years: this.construction_years,
                operation_years: this.operation_years,
                net_power_output_mw: this.net_power_output_mw,
                gross_load_factor: this.gross_load_factor * 0.01,
                availability: this.availability * 0.01,
                pre_development_costs_per_kw: this.pre_development_costs_per_kw,
                construction_capital_cost_per_kw: this.construction_capital_cost_per_kw,
                om_fixed_costs_per_kw_year: this.om_fixed_costs_per_kw_year,
                om_variable_costs_per_mwh: this.om_variable_costs_per_mwh,
                fuel_price_per_therm: this.fuel_price_per_therm,
                mwh_per_therm: this.mwh_per_therm,
                efficiency: this.efficiency * 0.01,
                carbon_price_per_ton: this.carbon_price_per_ton,
                co2_scrubbing_prc: this.co2_scrubbing_prc * 0.01,
                co2_emissions_per_therm: this.co2_emissions_per_therm
            });
        },
    },
    filters: {
        // Format number to fixed decimal places
        toFixed: function (val, dp) {
            if (isNaN(val)) {
                return val;
            } else {
                return val.toFixed(dp)
            }
        }
    }
});

// Calculate LCOE on initial load
app.selectedPreset = 'offshore_wind';
app.loadPreset();
app.update();