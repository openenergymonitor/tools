<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/fontawesome.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/solid.min.css">
<script src="<?php echo $path_lib;?>ecodan.js?v=1"></script>
<script src="<?php echo $path_lib;?>vaillant.js?v=11"></script>
<style>
    #spinner-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    #spinner-overlay.active {
        display: flex;
    }
    .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
<div class="container" style="max-width:1200px" id="app">
    <div class="row">
        <div class="col">
            <br>
            <h3>Dynamic heat pump simulator</h3>
            <p>Explore continuous vs intermittent heating, temperature set-backs and schedules.</p>
            <div class="alert alert-warning"><i class="fa-solid fa-person-digging"></i> Please help improve this <b>open source</b> heat pump simulator, see source code below.</div>

            
            <div class="btn-group" role="group" style="width: 250px; float:right">
                <button type="button" class="btn btn-outline-secondary" @click="zoom_in">+</button>
                <button type="button" class="btn btn-outline-secondary" @click="zoom_out">-</button>
                <button type="button" class="btn btn-outline-secondary" @click="pan_left"><</button>
                <button type="button" class="btn btn-outline-secondary" @click="pan_right">></button>
                <button type="button" class="btn btn-outline-secondary" @click="reset">RESET</button>
            </div>
            
        </div>
    </div>


    
    <div class="row">
        <div id="graph_bound" style="width:100%; height:400px; position:relative; ">
            <div id="graph"></div>
            <div id="spinner-overlay">
                <div class="spinner"></div>
            </div>
        </div>
    </div>
    <br><br>


    <div class="row">
        <div class="col">
            <div class="card">
                <div class="card-body">

                    <table class="table">
                        <tr>
                            <th>Name</th>
                            <th>Mean temp</th>
                            <th>Max temp</th>
                            <th>Electric</th>
                            <th>Heat</th>
                            <th>COP</th>
                            <th>Cost</th>
                            <th v-if="mode=='year'">Agile (2024)</th>
                        </tr>
                        <tr v-if="baseline_enabled" style="background-color:#f0f0f0">
                            <td>Baseline</td>
                            <td>{{ baseline.mean_room_temp | toFixed(2) }} °C</td>
                            <td>{{ baseline.max_room_temp | toFixed(2) }} °C</td>
                            <td>{{ baseline.elec_kwh | toFixed(3) }} kWh</td>
                            <td>{{ baseline.heat_kwh | toFixed(3) }} kWh</td>
                            <td>{{ (baseline.heat_kwh/baseline.elec_kwh) | toFixed(2) }}</td>
                            <td>£{{ baseline.total_cost | toFixed(2) }}</td>
                            <td v-if="mode=='year'">£{{ baseline.agile_cost | toFixed(2) }}</td>
                        </tr>
                        <tr class="table-success">
                            <td>Current</td>
                            <td>{{ results.mean_room_temp | toFixed(2) }} °C</td>
                            <td>{{ results.max_room_temp | toFixed(2) }} °C</td>
                            <td>{{ results.elec_kwh | toFixed(3) }} kWh</td>
                            <td>{{ results.heat_kwh | toFixed(3) }} kWh</td>
                            <td>{{ (results.heat_kwh/results.elec_kwh) | toFixed(2) }}</td>
                            <td>£{{ results.total_cost | toFixed(2) }}</td>
                            <td v-if="mode=='year'">£{{ results.agile_cost | toFixed(2) }}</td>
                        </tr>
                        <tr v-if="baseline_enabled" class="table-info">
                            <td>Saving</td>
                            <td>{{ (results.mean_room_temp-baseline.mean_room_temp) | toFixed(2) }} °C</td>
                            <td>{{ (results.max_room_temp-baseline.max_room_temp) | toFixed(2) }} °C</td>
                            <td>{{ (results.elec_kwh-baseline.elec_kwh)*-1 | toFixed(3) }} kWh ({{ ((results.elec_kwh-baseline.elec_kwh)/baseline.elec_kwh*-100) | toFixed(1) }}%)</td>
                            <td>{{ (results.heat_kwh-baseline.heat_kwh)*-1 | toFixed(3) }} kWh ({{ ((results.heat_kwh-baseline.heat_kwh)/baseline.heat_kwh*-100) | toFixed(1) }}%)</td>
                            <td>{{ ((results.heat_kwh/results.elec_kwh)-(baseline.heat_kwh/baseline.elec_kwh)) | toFixed(2) }}</td>
                            <td>£{{ (results.total_cost-baseline.total_cost)*-1 | toFixed(2) }}</td>
                            <td v-if="mode=='year'">£{{ (results.agile_cost-baseline.agile_cost)*-1 | toFixed(2) }}</td>

                        </tr>
                    </table>
                    <button type="button" class="btn btn-warning" @click="simulate" style="float:right">Refine</button>
                    <button type="button" class="btn btn-info" @click="export_config" style="float:right; margin-right:10px;">Export Config</button>
                    <button type="button" class="btn btn-success" @click="import_config" style="float:right; margin-right:10px;">Import Config</button>
                    <button type="button" class="btn btn-warning" @click="save_baseline">Save as baseline</button>
                </div>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <table class="table">
                <tr>
                    <th></th>
                    <th>Weighted flow temperature</th>
                    <th>Weighted outside temperature</th>
                    <th>Weighted (flowT - outsideT)</th>
                    <th>Weighted average % carnot</th>
                </tr>
                <tr>
                    <td>Full simulation</td>
                    <td>{{ stats.flowT_weighted | toFixed(2) }} °C</td>
                    <td>{{ stats.outsideT_weighted | toFixed(2) }} °C</td>
                    <td>{{ stats.flowT_minus_outsideT_weighted | toFixed(2) }} °C</td>
                    <td>{{ stats.wa_prc_carnot*100 | toFixed(1) }} %</td>
                </tr>
                <tr>
                    <td>Selected window only</td>
                    <td>{{ stats.window_flowT_weighted | toFixed(2) }} °C</td>
                    <td>{{ stats.window_outsideT_weighted| toFixed(2) }} °C</td>
                    <td>{{ stats.window_flowT_minus_outsideT_weighted | toFixed(2) }} °C</td>
                    <td></td>
                </tr>
            </table>
        </div>
    </div>
    <br>
    <div class="row">
        <div class="col">
            <div class="card">
                <div class="card-body">
                    <h4>Schedule</h4>
                    <table class="table">
                        <tr>
                            <th>Time</th>
                            <th>Set point</th>
                            <th>Price</th>

                            <!--<th>Max FlowT</th>-->
                            <th><button class="btn" @click="add_space"><i class="fas fa-plus"></i></button></th>
                        </tr>
                        <tr v-for="(item,index) in schedule">
                            <td><input type="text" class="form-control" v-model="item.start" @change="simulate"
                                    style="width:75px" /></td>
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" v-model.number="item.set_point"
                                        @change="simulate" style="width:30px" />
                                    <span class="input-group-text">°C</span>
                                </div>
                            </td>
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" v-model.number="item.price"
                                        @change="simulate" style="width:30px" />
                                </div>
                            </td>
                            <td><button class="btn" @click="delete_space(index)"><i
                                        class="fas fa-trash"></i></button></td>
                        </tr>
                    </table>

                    <div class="alert alert-info"><b>Room temp reached maximum of: {{ max_room_temp | toFixed(2) }} °C.</b></div>

                    <!-- button to load Octopus Cosy schedule example -->
                    <button type="button" class="btn btn-warning" @click="load_octopus_cosy">Load Octopus Cosy schedule example</button>
                </div>
            </div>
            <br>
            <div class="card">
                <div class="card-body">
                    <h4>DHW Schedule</h4>
                    <p>DHW not implemented yet, this just blocks out hot water period to see impact on room temperatures. Increase duration to enable.</p>
                    <table class="table">
                        <tr>
                            <th>Time</th>
                            <th>Set point</th>
                            <th>Duration</th>
                        </tr>
                        <tr v-for="(item,index) in dhw_schedule">
                            <td><input type="text" class="form-control" v-model="item.start" @change="simulate"
                                    style="width:75px" /></td>
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" v-model.number="item.set_point"
                                        @change="simulate" style="width:30px" />
                                    <span class="input-group-text">°C</span>
                                </div>
                            </td>
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" v-model.number="item.duration"
                                        @change="simulate" style="width:30px" />
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
            <br>


            <div class="card">
                <div class="card-body">
                    <h4>Building fabric</h4>

                    <!-- add entry for heat loss -->
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Heat loss</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="building.heat_loss" @change="simulate" />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Heat loss coefficient</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="building.fabric_WK | toFixed(0)" disabled />
                                <span class="input-group-text">W/K</span>
                            </div>
                        </div>
                    </div>

                    <table class="table">
                        <tr>
                            <th>Proportion</th>
                            <th>W/K</th>
                            <th>kWh/K</th>
                        </tr>
                        <tr v-for="(layer,index) in building.fabric">
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" v-model="layer.proportion" @change="simulate" :disabled="index==0" />
                                    <span class="input-group-text">%</span>
                                </div>
                            </td>
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" :value="layer.WK | toFixed(0)" disabled />
                                    <span class="input-group-text">W/K</span>
                                </div>
                            </td>
                            <td>
                                <div class="input-group mb-3">
                                    <input type="text" class="form-control" v-model.number="layer.kWhK" @change="simulate" />
                                    <span class="input-group-text">kWh/K</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>
        <div class="col">
          
            <div class="card" style="background-color: #f8f9fa;">
                <div class="card-body">
                    <label class="form-label">Simulate:</label>
                    <select class="form-control" v-model="mode" @change="change_mode">
                        <option value="day">Single day</option>
                        <option value="year">Full year</option>
                    </select>
                </div>
            </div>
            <br>

            <div class="card">
                <div class="card-body">

                    <label class="form-label">Control mode:</label>
                    
                    <select class="form-control" v-model="control.mode" @change="simulate">
                        <option value=0>Auto adapt 3 term PID controller</option>
                        <option value=1>Weather compensation with parallel shift</option>
                        <option value=3>Fixed speed compressor (on/off thermostat)</option>
                    </select>

                </div>
            </div>
            <br>          
            <div class="card" v-if="control.mode==0">
                <div class="card-body">

                    <label class="form-label">Auto adapt 3 term PID controller:</label>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Proportional</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Kp</span>
                                <input type="text" class="form-control" v-model.number="control.Kp"
                                    @change="simulate" />
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Integral</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Ki</span>
                                <input type="text" class="form-control" v-model.number="control.Ki"
                                    @change="simulate" />
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Derivative</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Kd</span>
                                <input type="text" class="form-control" v-model.number="control.Kd"
                                    @change="simulate" />
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            <div class="card" v-if="control.mode==1">
                <div class="card-body">

                    <label class="form-label">Weather compensation curve:</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" v-model.number="control.curve" @change="simulate" />
                    </div>


                
                    <label class="form-label">Flow temperature 3 term PID controller:</label>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Proportional</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Kp</span>
                                <input type="text" class="form-control" v-model.number="control.wc_Kp"
                                    @change="simulate" />
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Integral</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Ki</span>
                                <input type="text" class="form-control" v-model.number="control.wc_Ki"
                                    @change="simulate" />
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Derivative</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Kd</span>
                                <input type="text" class="form-control" v-model.number="control.wc_Kd"
                                    @change="simulate" />
                            </div>
                        </div>
                    </div>

                    <label class="form-label">Weather compensation outside temperature response:</label>
                    
                    <select class="form-control" v-model.number="control.wc_use_outside_mean" @change="simulate">
                        <option value=0>Instantaneous</option>
                        <option value=1>Average temperature for the day</option>
                    </select>
                    <br>
                    <p><i>Curve automatically selected based on building heat loss, internal gains and heat emitter spec.</i></p>


                    <div class="row">
                        <div class="col">
                            <div class="input-group mb-3">
                                <span class="input-group-text">Limit by room set point</span>
                                <span class="input-group-text"><input type="checkbox" v-model="control.limit_by_roomT" @change="simulate" /></span>
                                
                            </div>
                        </div>
                        <!-- roomT_hysteresis -->
                        <div class="col">
                            <label class="form-label">Room temperature hysteresis</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="control.roomT_hysteresis"
                                    @change="simulate" />
                                <span class="input-group-text">°C</span>
                            </div>
                        </div>
                    </div>


                </div>
            </div>
            
            <div class="card" v-if="control.mode==3">
                <div class="card-body">
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Compressor speed</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="control.fixed_compressor_speed" @change="simulate" />
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Limit</label>
                            <div class="input-group mb-3">
                                <span class="input-group-text">Limit by room set point</span>
                                <span class="input-group-text"><input type="checkbox" v-model="control.limit_by_roomT" @change="simulate" /></span>
                                
                            </div>
                        </div>
                        <!-- roomT_hysteresis -->
                        <div class="col">
                            <label class="form-label">Room temperature hysteresis</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="control.roomT_hysteresis"
                                    @change="simulate" />
                                <span class="input-group-text">°C</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div> 
            

            <br>

            <div class="card">
                <div class="card-body">

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Heat pump capacity</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump.capacity" :disabled="heatpump.cop_model=='vaillant5' || heatpump.cop_model == 'vaillant12'"
                                    @change="simulate" />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">System DT</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump.system_DT"
                                    @change="simulate" />
                                <span class="input-group-text">K</span>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Minimum modulation</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump.minimum_modulation"
                                    @change="simulate" />
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Minimum output</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="heatpump.minimum_modulation*heatpump.capacity/100 | toFixed(0)" disabled />
                                <span class="input-group-text">kW</span>
                            </div>
                        </div>
                    </div>


                    <div class="row">
                        <div class="col">
                            <label class="form-label">Heat emitter rated output</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control"
                                    v-model.number="heatpump.radiatorRatedOutput" @change="simulate"
                                    />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>

                        <div class="col">
                            <label class="form-label">Sytem volume</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control"
                                    v-model.number="heatpump.system_water_volume" @change="simulate"
                                    />
                                <span class="input-group-text">L</span>
                            </div>
                        </div>

                    </div>

                    <div class="row">
                        <dic class="col">
                            <label class="form-label">COP Model</label>
                            <div class="input-group mb-3">
                                <select class="form-control" v-model="heatpump.cop_model" @change="simulate">
                                    <option value="carnot_fixed">Carnot (fixed offsets flow+2, outside-6)</option>
                                    <option value="carnot_variable">Carnot (variable offsets proportional to heat)</option>
                                    <option value="ecodan">Ecodan datasheet</option>
                                    <option value="vaillant5">Vaillant datasheet 5kW</option>
                                    <option value="vaillant12">Vaillant datasheet 12kW</option>
                                </select>
                            </div>
                        </dic>

                        <div class="col" v-if="heatpump.cop_model!='ecodan' && heatpump.cop_model!='vaillant5' && heatpump.cop_model!='vaillant12'">
                            <label class="form-label">Practical COP factor</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump.prc_carnot"
                                    @change="simulate" />
                                <span class="input-group-text">%</span>
                            </div>
                        </div>

                    </div>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Standby/controls</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump.standby" @change="simulate" />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Pump power</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="heatpump.pumps" @change="simulate" />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                    </div>


                </div>
            </div>
            <br>
            <div class="card" v-if="mode=='day'">
                <div class="card-body">
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Outside temperature</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="external.mid"
                                    @change="simulate" />
                                <span class="input-group-text">°C</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Outside temperature swing</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model.number="external.swing"
                                    @change="simulate" />
                                <span class="input-group-text">°C</span>
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Minimum</label>
                            <input type="text" class="form-control" v-model="external.min_time" @change="simulate" />
                        </div>
                        <div class="col">
                            <label class="form-label">Maximum</label>
                            <input type="text" class="form-control" v-model="external.max_time" @change="simulate" />
                        </div>
                    </div>
                </div>
            </div>
            <br>
            <!-- card to show 99.6% and 99.0% outside temperature -->
            <div class="card" v-if="mode!='day'">
                <div class="card-body">
                    <h4>Outside temperature percentiles</h4>
                    <p>Use the following design temperatures when choosing design flow temperature for heat emitters.</p>
                    <table class="table">
                        <tr>
                            <th>Percentile</th>
                            <th>Outside Temperature (°C)</th>
                        </tr>
                        <tr>
                            <td>99.6%</td>
                            <td>{{ outsideT_996.toFixed(1) }} °C</td>
                        </tr>
                        <tr>
                            <td>99.0%</td>
                            <td>{{ outsideT_990.toFixed(1) }} °C</td>
                        </tr>
                    </table>
                </div>
            </div>
            <br>

            <div class="card">
                <div class="card-body">
                    <p><b>Internal gains:</b></p>
                    <p>Body heat (approx 60W per person), Electric consumption for lights, appliances and cooking ~210W (5 kWh/d), solar gains could be added here too.</p>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" v-model.number="building.internal_gains" @change="simulate" />
                        <span class="input-group-text">W</span>
                    </div>

                    <div v-if="mode=='year'">
                        <p><b>Solar gains:</b></p>
                        <p>Scale PV output</p>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" v-model.number="building.solar_scale" @change="simulate" />
                            <span class="input-group-text">x</span>
                        </div>
                    </div>
                </div>
            </div>
            <!--
            <label class="form-label">Minimum modulation</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="heatpump.min_modulation" @change="simulate"/>
                <span class="input-group-text">W</span>
            </div>
            -->
        </div>
    </div>
</div>
<script src="<?php echo $path; ?>dynamic_heatpump_v1.js?v=<?php echo time(); ?>"></script>
