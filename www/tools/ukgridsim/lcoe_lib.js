// Simplifications:
// - even phasing of pre-licensing and construction costs
// - fuel price constant over project lifetime
// - carbon price constant over project lifetime
// - regulatory costs included in pre-licensing costs
// - infrastructure costs included in construction costs

function calculateLCOE(params) {
    let {
        hurdle_rate,
        pre_development_years,
        construction_years,
        operation_years,
        net_power_output_mw,
        gross_load_factor,
        availability,
        pre_development_costs_per_kw,
        construction_capital_cost_per_kw,
        om_fixed_costs_per_kw_year,
        om_variable_costs_per_mwh,
        fuel_price_per_therm,
        mwh_per_therm,
        efficiency,
        carbon_price_per_ton,
        co2_scrubbing_prc,
        co2_emissions_per_therm
    } = params;

    // ----------------------------------------------------------------------

    let project_start = 0;
    let construction_start = pre_development_years;
    let operation_start = pre_development_years + construction_years;
    let decommission_year = pre_development_years + construction_years + operation_years;

    let hours_per_year = 8760;

    let pre_development_cost = pre_development_costs_per_kw * net_power_output_mw * 1000; // in GBP
    let construction_capital_cost = construction_capital_cost_per_kw * net_power_output_mw * 1000; // in GBP

    let pre_development_phasing_factor = 1.0 / (construction_start - project_start); // even phasing
    let construction_phasing_factor = 1.0 / (operation_start - construction_start); // even phasing

    let sum_discounted_generation = 0;
    let sum_discounted_pre_development_costs = 0;
    let sum_discounted_construction_costs = 0;
    let sum_discounted_operational_fixed_costs = 0;
    let sum_discounted_operational_variable_costs = 0;
    let sum_discounted_fuel_costs = 0;
    let sum_discounted_carbon_costs = 0;


    for (let year = project_start; year < decommission_year; year++) {

        let discountFactor = 1 / Math.pow(1 + hurdle_rate, year - project_start);

        let generation = 0;
        let discountedGeneration = 0;
        
        if (year >= operation_start && year < decommission_year) {
            generation = net_power_output_mw * hours_per_year * gross_load_factor * availability;
            discountedGeneration = generation * discountFactor;
            sum_discounted_generation += discountedGeneration;
        }

        // Pre-licensing Phase
        if (year >= project_start && year < construction_start) {
            let pre_development_phase_cost = pre_development_cost * pre_development_phasing_factor;
            let discounted_pre_development_phase_cost = pre_development_phase_cost * discountFactor;
            sum_discounted_pre_development_costs += discounted_pre_development_phase_cost;
        }

        // Construction Phase
        if (year >= construction_start && year < operation_start) {
            let construction_phase_cost = construction_capital_cost * construction_phasing_factor;
            let discounted_construction_phase_cost = construction_phase_cost * discountFactor;
            sum_discounted_construction_costs += discounted_construction_phase_cost;
        }

        // Operational Phase
        if (year >= operation_start && year < decommission_year) {
            let fixed_om_costs = om_fixed_costs_per_kw_year * 1000 * net_power_output_mw; // in GBP
            let discounted_fixed_om_costs = fixed_om_costs * discountFactor;
            sum_discounted_operational_fixed_costs += discounted_fixed_om_costs;

            let variable_om_costs = om_variable_costs_per_mwh * generation; // in GBP
            let discounted_variable_om_costs = variable_om_costs * discountFactor;
            sum_discounted_operational_variable_costs += discounted_variable_om_costs;

            let fuel_required_mwh = generation / efficiency;

            let fuel_price_per_mwh = fuel_price_per_therm / mwh_per_therm; // GBP per MWh
            let fuel_costs = fuel_price_per_mwh * fuel_required_mwh; // in GBP
            let discounted_fuel_costs = fuel_costs * discountFactor;
            sum_discounted_fuel_costs += discounted_fuel_costs;

            let emissions_tons = (fuel_required_mwh * co2_emissions_per_therm * (1 - co2_scrubbing_prc)) / (mwh_per_therm * 1000); // in tons
            let carbon_costs = emissions_tons * carbon_price_per_ton; // in GBP
            let discounted_carbon_costs = carbon_costs * discountFactor;
            sum_discounted_carbon_costs += discounted_carbon_costs;
        }
    }

    let pre_development_cost_per_mwh = sum_discounted_pre_development_costs / sum_discounted_generation; // GBP per MWh
    let construction_cost_per_mwh = sum_discounted_construction_costs / sum_discounted_generation; // GBP per MWh
    let operational_fixed_cost_per_mwh = sum_discounted_operational_fixed_costs / sum_discounted_generation; // GBP per MWh
    let operational_variable_cost_per_mwh = sum_discounted_operational_variable_costs / sum_discounted_generation; // GBP per MWh
    let fuel_cost_per_mwh = sum_discounted_fuel_costs / sum_discounted_generation; // GBP per MWh
    let carbon_cost_per_mwh = sum_discounted_carbon_costs / sum_discounted_generation; // GBP per MWh

    let total_lcoe = pre_development_cost_per_mwh + construction_cost_per_mwh + operational_fixed_cost_per_mwh + operational_variable_cost_per_mwh + fuel_cost_per_mwh + carbon_cost_per_mwh;

    return {
        total_discounted_generation: sum_discounted_generation,
        pre_development_cost_per_mwh,
        construction_cost_per_mwh,
        operational_fixed_cost_per_mwh,
        operational_variable_cost_per_mwh,
        fuel_cost_per_mwh,
        carbon_cost_per_mwh,
        total_lcoe
    };
}