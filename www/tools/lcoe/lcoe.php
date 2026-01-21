<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<div class="container" style="max-width:1200px" id="app">
    <div class="row">
        <div class="col">
            <br>
            <h3>LCOE Calculator</h3>
            <p>Calculate levelised cost of energy using discounted cash flow analysis.</p>
        </div>
    </div>

    <!-- Preset Selector -->
    <div class="row mb-3">
        <div class="col-12 col-md-6 col-lg-4">
            <label class="form-label">Load Example</label>
            <select class="form-select" v-model="selectedPreset" @change="loadPreset">
                <option value="">-- Select a preset --</option>
                <option value="offshore_wind">Offshore Wind</option>
                <option value="gas_ccgt">Gas CCGT</option>
            </select>
        </div>
    </div>

    <!-- Results Section - Prominent at top -->
    <div class="card mb-4" v-if="lcoe_results">
        <div class="card-header bg-primary text-white">
            <h5 class="mb-0">Results</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-12 col-md-6 col-lg-4 mb-3">
                    <label class="form-label fw-bold">Total LCOE</label>
                    <div class="input-group input-group-lg">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.total_lcoe | toFixed(2)" disabled>
                    </div>
                </div>
            </div>
            <hr>
            <h6 class="text-muted mb-3">Cost Breakdown</h6>
            <div class="row">
                <div class="col-6 col-md-4 col-lg-2 mb-3">
                    <label class="form-label small">Pre-development</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.pre_development_cost_per_mwh | toFixed(2)" disabled>
                    </div>
                </div>
                <div class="col-6 col-md-4 col-lg-2 mb-3">
                    <label class="form-label small">Construction</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.construction_cost_per_mwh | toFixed(2)" disabled>
                    </div>
                </div>
                <div class="col-6 col-md-4 col-lg-2 mb-3">
                    <label class="form-label small">Fixed O&M</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.operational_fixed_cost_per_mwh | toFixed(2)" disabled>
                    </div>
                </div>
                <div class="col-6 col-md-4 col-lg-2 mb-3">
                    <label class="form-label small">Variable O&M</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.operational_variable_cost_per_mwh | toFixed(2)" disabled>
                    </div>
                </div>
                <div class="col-6 col-md-4 col-lg-2 mb-3">
                    <label class="form-label small">Fuel</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.fuel_cost_per_mwh | toFixed(2)" disabled>
                    </div>
                </div>
                <div class="col-6 col-md-4 col-lg-2 mb-3">
                    <label class="form-label small">Carbon</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">£/MWh</span>
                        <input type="text" class="form-control" :value="lcoe_results.carbon_cost_per_mwh | toFixed(2)" disabled>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Input Sections -->
    <div class="accordion" id="inputAccordion">
        
        <!-- Project Timeline -->
        <div class="card mb-2">
            <div class="card-header" id="headingTimeline">
                <h5 class="mb-0">
                    <button class="btn btn-link w-100 text-start text-decoration-none d-flex justify-content-between align-items-center collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTimeline" aria-expanded="false">
                        <span>Project Timeline</span>
                        <span class="accordion-icon">▼</span>
                    </button>
                </h5>
            </div>
            <div id="collapseTimeline" class="collapse" data-bs-parent="#inputAccordion">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">Pre-development years</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="pre_development_years" @change="update">
                                <span class="input-group-text">years</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">Construction years</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="construction_years" @change="update">
                                <span class="input-group-text">years</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">Operation years</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="operation_years" @change="update">
                                <span class="input-group-text">years</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Financial & Plant Parameters -->
        <div class="card mb-2">
            <div class="card-header" id="headingFinancial">
                <h5 class="mb-0">
                    <button class="btn btn-link w-100 text-start text-decoration-none d-flex justify-content-between align-items-center collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFinancial">
                        <span>Financial & Plant Parameters</span>
                        <span class="accordion-icon">▼</span>
                    </button>
                </h5>
            </div>
            <div id="collapseFinancial" class="collapse" data-bs-parent="#inputAccordion">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 col-sm-6 col-lg-3 mb-3">
                            <label class="form-label">Hurdle rate</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="hurdle_rate" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                        <div class="col-12 col-sm-6 col-lg-3 mb-3">
                            <label class="form-label">Net power output</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="net_power_output_mw" @change="update">
                                <span class="input-group-text">MW</span>
                            </div>
                        </div>
                        <div class="col-12 col-sm-6 col-lg-3 mb-3">
                            <label class="form-label">Gross load factor</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="gross_load_factor" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                        <div class="col-12 col-sm-6 col-lg-3 mb-3">
                            <label class="form-label">Availability</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="availability" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Capital Costs -->
        <div class="card mb-2">
            <div class="card-header" id="headingCapital">
                <h5 class="mb-0">
                    <button class="btn btn-link w-100 text-start text-decoration-none d-flex justify-content-between align-items-center collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCapital">
                        <span>Capital Costs</span>
                        <span class="accordion-icon">▼</span>
                    </button>
                </h5>
            </div>
            <div id="collapseCapital" class="collapse" data-bs-parent="#inputAccordion">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 col-md-6 mb-3">
                            <label class="form-label">Pre-development costs</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="pre_development_costs_per_kw" @change="update">
                                <span class="input-group-text">£/kW</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 mb-3">
                            <label class="form-label">Construction capital cost</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="construction_capital_cost_per_kw" @change="update">
                                <span class="input-group-text">£/kW</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Operating Costs -->
        <div class="card mb-2">
            <div class="card-header" id="headingOperating">
                <h5 class="mb-0">
                    <button class="btn btn-link w-100 text-start text-decoration-none d-flex justify-content-between align-items-center collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOperating">
                        <span>Operating Costs</span>
                        <span class="accordion-icon">▼</span>
                    </button>
                </h5>
            </div>
            <div id="collapseOperating" class="collapse" data-bs-parent="#inputAccordion">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 col-md-6 mb-3">
                            <label class="form-label">Fixed O&M costs</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="om_fixed_costs_per_kw_year" @change="update">
                                <span class="input-group-text">£/kW/year</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 mb-3">
                            <label class="form-label">Variable O&M costs</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="om_variable_costs_per_mwh" @change="update">
                                <span class="input-group-text">£/MWh</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Fuel & Efficiency -->
        <div class="card mb-2">
            <div class="card-header" id="headingFuel">
                <h5 class="mb-0">
                    <button class="btn btn-link w-100 text-start text-decoration-none d-flex justify-content-between align-items-center collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFuel">
                        <span>Fuel & Efficiency</span>
                        <span class="accordion-icon">▼</span>
                    </button>
                </h5>
            </div>
            <div id="collapseFuel" class="collapse" data-bs-parent="#inputAccordion">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">Fuel price</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="fuel_price_per_therm" @change="update">
                                <span class="input-group-text">£/therm</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">MWh per therm</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="mwh_per_therm" @change="update">
                                <span class="input-group-text">MWh/therm</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">Efficiency</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="efficiency" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Carbon Costs -->
        <div class="card mb-2">
            <div class="card-header" id="headingCarbon">
                <h5 class="mb-0">
                    <button class="btn btn-link w-100 text-start text-decoration-none d-flex justify-content-between align-items-center collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCarbon">
                        <span>Carbon Costs</span>
                        <span class="accordion-icon">▼</span>
                    </button>
                </h5>
            </div>
            <div id="collapseCarbon" class="collapse" data-bs-parent="#inputAccordion">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">Carbon price</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="carbon_price_per_ton" @change="update">
                                <span class="input-group-text">£/ton</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">CO2 scrubbing</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="co2_scrubbing_prc" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-4 mb-3">
                            <label class="form-label">CO2 emissions</label>
                            <div class="input-group">
                                <input type="text" class="form-control" v-model.number="co2_emissions_per_therm" @change="update">
                                <span class="input-group-text">kg/therm</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>
    <br>
</div>

<style>
.accordion-icon {
    transition: transform 0.3s ease;
}
.btn-link:not(.collapsed) .accordion-icon {
    transform: rotate(180deg);
}
</style>

<script src="<?php echo $path; ?>lcoe_lib.js?v=1"></script>
<script src="<?php echo $path; ?>lcoe.js?v=5"></script>
