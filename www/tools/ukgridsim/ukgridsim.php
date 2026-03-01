<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.stack.min.js"></script>
<script src="<?php echo $path_lib; ?>feed.js?v=1"></script>
<script src="<?php echo $path_lib; ?>vis.helper.js?v=1"></script>

<style>
.graph-container { position: relative; }
.loading-overlay {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    background-color: rgba(255,255,255,0.8);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
}
.spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 40px; height: 40px;
    animation: spin 1s linear infinite;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.nav-tabs .nav-link { font-size: 0.9rem; padding: 0.4rem 0.7rem; }
@media (max-width: 576px) {
    .nav-tabs .nav-link { font-size: 0.78rem; padding: 0.35rem 0.45rem; }
}
.summary-table td { padding: 0.3rem 0.5rem; }
.section-card {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
}
.input-group .form-control { min-width: 0; }
.cost-highlight {
    background: #e8f4fd;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    margin-bottom: 0.5rem;
}
.cost-table td { vertical-align: middle; }
.cost-table .input-cell { text-align: right; width: 120px; }
.cost-table .input-cell input { text-align: right; }
.stats-bar {
    background: #e9ecef;
    color: #212529;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    margin: 0.75rem 0 0 0;
    padding: 0.5rem 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.5rem;
    align-items: center;
}
.stats-bar .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
}
.stats-bar .stat-value {
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.2;
}
.stats-bar .stat-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.6;
    color: #212529;
}
.stat-good { color: #198754; }
.stat-warn { color: #cc8800; }
.stat-bad  { color: #dc3545; }
@media (max-width: 576px) {
    .stats-bar { gap: 0.25rem 1rem; padding: 0.4rem 0.75rem; }
    .stats-bar .stat-value { font-size: 0.95rem; }
    .stats-bar .stat-item { min-width: 65px; }
}
.sim-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    background: #f0f0f0;
    border-radius: 10px;
    padding: 0.4rem;
    margin-top: 0.75rem;
    align-items: center;
}
.sim-nav .nav-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.85rem;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #495057;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
}
.sim-nav .nav-btn:hover {
    background: #fff;
    color: #212529;
}
.sim-nav .nav-btn.active {
    background: #fff;
    color: #0d6efd;
    box-shadow: 0 1px 4px rgba(0,0,0,0.10);
    font-weight: 600;
}
.sim-nav .nav-btn .nav-icon {
    font-size: 1rem;
    line-height: 1;
}
.sim-nav .nav-spacer { flex: 1; }
.sim-nav .nav-btn.chart-btn {
    color: #6c757d;
    font-size: 0.82rem;
}
.sim-nav .nav-btn.chart-btn.active {
    background: #fff;
    color: #198754;
    box-shadow: 0 1px 4px rgba(0,0,0,0.10);
}
@media (max-width: 576px) {
    .sim-nav .nav-btn { padding: 0.35rem 0.6rem; font-size: 0.8rem; }
    .sim-nav .nav-btn .nav-icon { font-size: 0.9rem; }
}
</style>

<div class="container-fluid" id="app">

    <!-- Header -->
    <div class="row py-2" style="background-color:#f0f0f0">
        <div class="col">
            <p class="mb-0"><b>UK Grid Sim</b> &mdash; Can you match supply and demand on the UK grid?
            <small class="text-muted">Real demand and generation data June 2024 to June 2025</small></p>
        </div>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar">
        <div class="stat-item">
            <span class="stat-value stat-good">{{ supply_GWh*0.001 | toFixed(1) }} TWh</span>
            <span class="stat-label">Supply</span>
        </div>
        <div class="stat-item">
            <span class="stat-value stat-good">{{ demand_GWh*0.001 | toFixed(1) }} TWh</span>
            <span class="stat-label">Demand</span>
        </div>
        <div class="stat-item">
            <span class="stat-value"
                :class="balance.unmet*0.001 < 1 ? 'stat-good' : balance.unmet*0.001 < 10 ? 'stat-warn' : 'stat-bad'">
                {{ balance.unmet*0.001 | toFixed(1) }} TWh
            </span>
            <span class="stat-label">Unmet demand</span>
        </div>

        <div class="stat-item">
            <span class="stat-value"
                :class="balance.after_store1 >= 0.99 ? 'stat-good' : balance.after_store1 >= 0.95 ? 'stat-warn' : 'stat-bad'">
                {{ balance.after_store1*100 | toFixed(1) }}%
            </span>
            <span class="stat-label">Demand met</span>
        </div>

        <div class="stat-item">
            <span class="stat-value"
                :class="supply_GWh > 0 && 100*balance.surplus/supply_GWh < 10 ? 'stat-good' : 100*balance.surplus/supply_GWh < 25 ? 'stat-warn' : 'stat-bad'">
                <span v-if="supply_GWh">{{ balance.surplus*0.001 | toFixed(1) }} TWh ({{ 100*balance.surplus/supply_GWh | toFixed(1) }}%)</span><span v-else>—</span>
            </span>
            <span class="stat-label">Curtailment</span>
        </div>
        <div class="stat-item">
            <span class="stat-value"
                :class="demand_GWh && supply_GWh/demand_GWh <= 1.2 ? 'stat-good' : demand_GWh && supply_GWh/demand_GWh <= 1.5 ? 'stat-warn' : 'stat-bad'">
                <span v-if="demand_GWh">{{ supply_GWh/demand_GWh | toFixed(2) }}×</span><span v-else>—</span>
            </span>
            <span class="stat-label">Oversupply</span>
        </div>
        <div class="stat-item">
            <span class="stat-value stat-good">£{{ total_cost_per_mwh | toFixed(1) }}</span>
            <span class="stat-label">Total £/MWh</span>
        </div>
        <div class="stat-item" v-if="store2.enabled">
            <span class="stat-value"
                :class="balance.after_store2 >= 0.999 ? 'stat-good' : 'stat-warn'">
                {{ balance.after_store2*100 | toFixed(2) }}%
            </span>
            <span class="stat-label">Met (w/ LDES)</span>
        </div>
    </div>

    <!-- Sim nav -->
    <div class="sim-nav">
        <button class="nav-btn" :class="{active: activeTab==='supply'}" @click="activeTab='supply'">
            <span class="nav-icon">🌱</span> Supply
        </button>
        <button class="nav-btn" :class="{active: activeTab==='demand'}" @click="activeTab='demand'">
            <span class="nav-icon">⚡</span> Demand
        </button>
        <button class="nav-btn" :class="{active: activeTab==='storage'}" @click="activeTab='storage'">
            <span class="nav-icon">🔋</span> Storage
        </button>
        <button class="nav-btn" :class="{active: activeTab==='costs'}" @click="activeTab='costs'">
            <span class="nav-icon">💷</span> Costs
        </button>
        <div class="nav-spacer"></div>
        <button class="nav-btn chart-btn" :class="{active: show_chart}" @click="show_chart = !show_chart">
            <span class="nav-icon">📈</span>
            <span v-if="show_chart">Hide chart</span><span v-else>Show chart</span>
        </button>
    </div>

    <!-- Collapsible chart -->
    <div v-show="show_chart" class="section-card mt-2">
        <div class="d-flex justify-content-between align-items-center mb-2">
            <b>Power view (GW)</b>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-secondary" @click="zoom_in">+</button>
                <button class="btn btn-secondary" @click="zoom_out">−</button>
                <button class="btn btn-secondary" @click="pan_left">&lt;</button>
                <button class="btn btn-secondary" @click="pan_right">&gt;</button>
            </div>
        </div>
        <div class="graph-container">
            <div id="graph" style="width:100%;height:300px;"></div>
            <div class="loading-overlay" v-show="loading">
                <div class="spinner"></div>
            </div>
        </div>
    </div>

    <div class="tab-content mt-3">

        <!-- ── DEMAND TAB ── -->
        <div v-show="activeTab==='demand'" id="pane-demand" role="tabpanel">
            <div class="row justify-content-center">
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="section-card">
                        <b>Demand settings</b>
                        <div class="mt-3">
                            <label class="form-label">Present day grid demand</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="standard_demand_TWh" @change="update">
                                <span class="input-group-text">TWh/yr</span>
                            </div>
                            <label class="form-label">Heat pump households</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump_households" @change="update">
                                <span class="input-group-text">million</span>
                            </div>
                            <label class="form-label">Heat pump kWh per household</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump_kwh_per_household" @change="update">
                                <span class="input-group-text">kWh</span>
                            </div>
                            <label class="form-label">Heat pump SPF</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump_spf" @change="update">
                                <span class="input-group-text">SPF</span>
                            </div>
                            <label class="form-label">EV households</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="ev_households" @change="update">
                                <span class="input-group-text">million</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── SUPPLY TAB ── -->
        <div v-show="activeTab==='supply'" id="pane-supply" role="tabpanel">
            <div class="row g-3">

                <!-- Solar -->
                <div class="col-12 col-md-6 col-xl-3">
                    <div class="section-card h-100">
                        <b>☀️ Solar</b>
                        <div class="mt-3">
                            <label class="form-label">Capacity factor (GWh/GWp)</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="solar_GWh_per_GWp" @change="update">
                                <span class="input-group-text">GWh/GWp</span>
                            </div>
                            <label class="form-label">Capacity</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="solar_GWp | toFixed(1)" disabled>
                                <span class="input-group-text">GWp</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Wind -->
                <div class="col-12 col-md-6 col-xl-3">
                    <div class="section-card h-100">
                        <b>💨 Wind</b>
                        <div class="mt-3">
                            <label class="form-label">Capacity factor</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="wind_cap_factor" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                            <label class="form-label">Capacity</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="wind_GWp | toFixed(1)" disabled>
                                <span class="input-group-text">GWp</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Nuclear -->
                <div class="col-12 col-md-6 col-xl-3">
                    <div class="section-card h-100">
                        <b>⚛️ Nuclear</b>
                        <div class="mt-3">
                            <label class="form-label">Capacity factor</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="nuclear_cap_factor" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                            <label class="form-label">Capacity</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="nuclear_GWp | toFixed(1)" disabled>
                                <span class="input-group-text">GWp</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Backup -->
                <div class="col-12 col-md-6 col-xl-3">
                    <div class="section-card h-100">
                        <b>🔥 Backup (gas)</b>
                        <div class="mt-3">
                            <label class="form-label">Margin</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="backup.margin" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                            <label class="form-label">Annual demand</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="backup.demand_GWh*0.001 | toFixed(1)" disabled>
                                <span class="input-group-text">TWh</span>
                            </div>
                            <label class="form-label">Capacity factor</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="backup.CF*100 | toFixed(2)" disabled>
                                <span class="input-group-text">%</span>
                            </div>
                            <label class="form-label">Capacity</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="backup.capacity | toFixed(1)" disabled>
                                <span class="input-group-text">GW</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- ── STORAGE TAB ── -->
        <div v-show="activeTab==='storage'" id="pane-storage" role="tabpanel">
            <div class="row g-3">

                <!-- Battery -->
                <div class="col-12 col-md-6">
                    <div class="section-card h-100">
                        <b>🔋 Battery storage</b>
                        <div class="mt-3">
                            <label class="form-label">Capacity</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="store1.capacity" @change="update">
                                <span class="input-group-text">GWh</span>
                            </div>
                            <label class="form-label">Round trip efficiency</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="store1.round_trip_efficiency" @change="update">
                                <span class="input-group-text">%</span>
                            </div>
                            <label class="form-label">Max charge &amp; discharge rate</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" v-model.number="store1.charge_max" @change="update">
                                <span class="input-group-text">GW</span>
                            </div>
                            <label class="form-label">Cycles/year</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="store1.cycles | toFixed(1)" disabled>
                            </div>
                            <label class="form-label">LCOS</label>
                            <div class="input-group mb-2">
                                <input type="text" class="form-control" :value="store1.cost_mwh | toFixed(0)" disabled>
                                <span class="input-group-text">£/MWh</span>
                            </div>
                            <p class="text-muted small mt-2"><i>Not yet included in cost model</i></p>
                        </div>
                    </div>
                </div>

                <!-- LDES -->
                <div class="col-12 col-md-6">
                    <div class="section-card h-100">
                        <div class="d-flex align-items-center gap-2 mb-3">
                            <b>🌊 Long duration energy store (LDES)</b>
                            <input type="checkbox" v-model="store2.enabled" @change="update">
                        </div>
                        <label class="form-label">Capacity</label>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" v-model.number="store2.capacity" @change="update" :disabled="!store2.enabled">
                            <span class="input-group-text">GWh</span>
                        </div>
                        <label class="form-label">Charge efficiency</label>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" v-model.number="store2.charge_efficiency" @change="update" :disabled="!store2.enabled">
                            <span class="input-group-text">%</span>
                        </div>
                        <label class="form-label">Discharge efficiency</label>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" v-model.number="store2.discharge_efficiency" @change="update" :disabled="!store2.enabled">
                            <span class="input-group-text">%</span>
                        </div>
                        <label class="form-label">Max charge rate</label>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" v-model.number="store2.charge_max" @change="update" :disabled="!store2.enabled">
                            <span class="input-group-text">GW</span>
                        </div>
                        <label class="form-label">Max discharge rate</label>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" v-model.number="store2.discharge_max" @change="update" :disabled="!store2.enabled">
                            <span class="input-group-text">GW</span>
                        </div>
                        <label class="form-label">Cycles/year</label>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" :value="store2.cycles | toFixed(1)" disabled>
                        </div>
                        <p class="text-muted small mt-2"><i>E.g. Hydrogen, e-Methanol, e-Methane. This technology does not yet exist at scale.</i></p>
                    </div>
                </div>

            </div>
        </div>

        <!-- ── COSTS TAB ── -->
        <div v-show="activeTab==='costs'" id="pane-costs" role="tabpanel">
            <div class="row justify-content-center">
                <div class="col-12 col-md-8 col-lg-6">
                    <div class="section-card">
                        <b>Supply and Cost breakdown</b>
                        <table class="table table-sm mt-3 cost-table">
                            <thead>
                                <tr>
                                    <th>Source</th>
                                    <th>% of demand</th>
                                    <th>TWh/yr</th>
                                    <th>LCOE £/MWh</th>
                                    <th class="text-end">Contribution</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>☀️ Solar</td>
                                    <td class="input-cell"><div class="input-group input-group-sm"><input type="text" class="form-control form-control-sm" v-model.number="solar_prc_of_demand" @change="update"><span class="input-group-text">%</span></div></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="solar_GWh*0.001 | toFixed(1)" disabled></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" v-model.number="solar_cost_per_mwh" @change="model_costs"></td>
                                    <td class="text-end">+{{ solar_cost / demand_GWh | toFixed(0) }}</td>
                                </tr>
                                <tr>
                                    <td>💨 Wind</td>
                                    <td class="input-cell"><div class="input-group input-group-sm"><input type="text" class="form-control form-control-sm" v-model.number="wind_prc_of_demand" @change="update"><span class="input-group-text">%</span></div></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="wind_GWh*0.001 | toFixed(1)" disabled></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" v-model.number="wind_cost_per_mwh" @change="model_costs"></td>
                                    <td class="text-end">+{{ wind_cost / demand_GWh | toFixed(0) }}</td>
                                </tr>
                                <tr>
                                    <td>⚛️ Nuclear</td>
                                    <td class="input-cell"><div class="input-group input-group-sm"><input type="text" class="form-control form-control-sm" v-model.number="nuclear_prc_of_demand" @change="update"><span class="input-group-text">%</span></div></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="nuclear_GWh*0.001 | toFixed(1)" disabled></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" v-model.number="nuclear_cost_per_mwh" @change="model_costs"></td>
                                    <td class="text-end">+{{ nuclear_cost / demand_GWh | toFixed(0) }}</td>
                                </tr>
                                <tr v-if="store1.capacity > 0">
                                    <td>🔋 Storage</td>
                                    <td class="input-cell"><div class="input-group input-group-sm"><input type="text" class="form-control form-control-sm" :value="store1_discharge_GWh / demand_GWh * 100 | toFixed(1)" disabled><span class="input-group-text">%</span></div></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="store1_discharge_GWh*0.001 | toFixed(1)" disabled></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="store1.cost_mwh | toFixed(0)" disabled></td>
                                    <td class="text-end">+{{ store1_cost / demand_GWh | toFixed(0) }}</td>
                                </tr>
                                <tr>
                                    <td>🔥 Gas Backup</td>
                                    <td class="input-cell"><div class="input-group input-group-sm"><input type="text" class="form-control form-control-sm" :value="backup.demand_GWh /demand_GWh*100 | toFixed(1)" disabled><span class="input-group-text">%</span></div></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="backup.demand_GWh*0.001 | toFixed(1)" disabled></td>
                                    <td class="input-cell"><input type="text" class="form-control form-control-sm" :value="backup_cost_per_mwh | toFixed(0)" disabled></td>
                                    <td class="text-end">+{{ backup_cost / demand_GWh | toFixed(0) }}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="cost-highlight">
                            <div class="d-flex justify-content-between mb-1"><span class="text-muted">Energy cost</span><b>£{{ energy_cost_per_mwh | toFixed(1) }}/MWh</b></div>
                            <div class="d-flex justify-content-between mb-1"><span class="text-muted">Grid cost</span><b>£{{ grid_cost_per_mwh | toFixed(1) }}/MWh</b></div>
                            <hr class="my-2">
                            <div class="d-flex justify-content-between"><span><b>Total cost</b></span><b class="text-primary fs-5">£{{ total_cost_per_mwh | toFixed(1) }}/MWh</b></div>
                        </div>

                        <div class="form-check mt-3">
                            <input class="form-check-input" type="checkbox" v-model="include_carbon_cost" @change="model_costs" id="carbonCostCheck">
                            <label class="form-check-label" for="carbonCostCheck">
                                Include carbon cost (£{{ carbon_cost | toFixed(0) }} per MWh of gas generation)
                            </label>
                        </div>

                        <pre v-if="csv_output" class="mt-3">{{ csv_output }}</pre>
                    </div>
                </div>
            </div>
        </div>

    </div><!-- /tab-content -->
</div><!-- /app -->

<script src="<?php echo $path; ?>lcoe_lib.js?v=1"></script>
<script src="<?php echo $path; ?>ukgridsim.js?v=27"></script>