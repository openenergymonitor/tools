// Vue application for LCOE (Levelized Cost of Energy) calculator
const app = new Vue({
    el: '#app',
    data: {
        capex: 1500,              // Capital expenditure (£)
        opex: 43,                 // Annual operational expenditure (£)
        fuel: 0,                  // Fuel cost (£/MWh thermal)
        fuel_efficiency: 50,      // Thermal to electrical efficiency (%)
        months_to_build: 48,      // Construction period (months)
        lifespan: 30,             // Plant operational lifespan (years)
        interest_rate: 6.3,       // Annual interest rate (%)
        capacity_factor: 62,      // Plant capacity factor (%)
        lcoe: 0,                  // Calculated LCOE (£/MWh)

        project_year_start: 2018, // Project start year (unused)
    },
    methods: {
        // Recalculate LCOE when inputs change
        update: function () {
            this.lcoe = calculateLCOE({
                capex: this.capex,
                opex: this.opex,
                fuelCost: this.fuel,
                fuelEfficiency: this.fuel_efficiency,
                monthsToBuild: this.months_to_build,
                lifespan: this.lifespan,
                interestRate: this.interest_rate * 0.01,  // Convert percentage to decimal
                capacityFactor: this.capacity_factor
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
app.update();

/**
 * Calculate Levelized Cost of Energy (LCOE)
 * @param {Object} params - Calculation parameters
 * @param {number} params.capex - Capital expenditure (£)
 * @param {number} params.opex - Annual operational expenditure (£)
 * @param {number} params.fuelCost - Fuel cost (£/MWh thermal energy)
 * @param {number} params.fuelEfficiency - Thermal to electrical efficiency (%)
 * @param {number} params.monthsToBuild - Construction period (months)
 * @param {number} params.lifespan - Plant operational lifespan (years)
 * @param {number} params.interestRate - Annual interest rate (decimal, e.g., 0.063 for 6.3%)
 * @param {number} params.capacityFactor - Plant capacity factor (%)
 * @returns {number} LCOE in £/MWh
 */
function calculateLCOE({ capex, opex, fuelCost, fuelEfficiency, monthsToBuild, lifespan, interestRate, capacityFactor }) 
{
    // Calculate principal at commissioning with compound interest during construction
    const principalAtCommissioning = capex * Math.pow((1 + interestRate / 12), monthsToBuild);

    // Convert lifespan to months for loan calculation
    const lifespanMonths = lifespan * 12;
    const monthlyRate = interestRate / 12;

    // Calculate monthly loan payment using annuity formula: P * r / (1 - (1 + r)^-n)
    const monthlyPayment = monthlyRate * principalAtCommissioning / (1 - Math.pow(1 + monthlyRate, -lifespanMonths));
    const annualLoanPayment = monthlyPayment * 12;

    // Calculate annual electricity generation (MWh)
    const annualGeneration = capacityFactor * 0.01 * 24 * 365;
    
    // Calculate annual fuel consumption and cost
    const annualFuelConsumption = annualGeneration / (fuelEfficiency * 0.01); // MWh thermal energy required
    const annualFuelCost = annualFuelConsumption * fuelCost * 0.001;

    // Total annual cost
    const annualCost = annualLoanPayment + opex + annualFuelCost;
    
    // Return LCOE in £/MWh
    return 1000 * annualCost / annualGeneration;
}