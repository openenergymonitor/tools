<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="<?php echo $path_lib;?>vaillant5.js?v=10"></script>


<?php $title = "Vaillant COP model"; ?>

<div class="container mt-3" style="max-width:1000px" id="app">
    <div class="row">
        <div class="col">
            <h3>Vaillant Arotherm+ datasheet vs model</h3>
            <p>This tool compares the 5kW Vaillant Arotherm+ datasheet performance tables with a simple Carnot-based model to see how well the model fits real-world data.</p>
        </div>
    </div>

    <ul class="nav nav-tabs">
        <li class="nav-item" v-for="flow_temp_key in flow_temps">
            <a class="nav-link" :class="{ active: active_flow_temp == flow_temp_key }" href="#" @click.prevent="active_flow_temp = flow_temp_key">{{ flow_temp_key }}</a>
        </li>
    </ul>
    <div class="row mt-3">
        <div class="col">
            <table class="table table-bordered table-sm text-center">
                <thead>
                    <tr>
                        <th class="fs-6">Ambient °C</th>
                        <th class="fs-6" v-for="speed in data['5kW'].speed">{{ speed }} rps</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(ambient_temp, amb_index) in data['5kW'].ambient">
                        <td><b class="fs-6">{{ ambient_temp }}</b></td>
                        <td v-for="(speed, speed_index) in data['5kW'].speed" :style="{backgroundColor: getCopColor(data['5kW'][active_flow_temp].cop[amb_index][speed_index])}">
                            <div v-if="data['5kW'][active_flow_temp].cop[amb_index][speed_index] !== null">
                                <b class="fs-6">{{ data['5kW'][active_flow_temp].cop[amb_index][speed_index] }}</b> 
                                <small class="fs-7" v-if="data['5kW'][active_flow_temp].sim_cop">({{ data['5kW'][active_flow_temp].sim_cop[amb_index][speed_index] }})</small>
                                <small class="d-block fs-7">{{ data['5kW'][active_flow_temp].output[amb_index][speed_index] }} kW</small>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="row mt-3" v-if="mean_abs_error !== null">
        <div class="col">
            <p>Mean absolute error between model and datasheet: <b>{{ mean_abs_error.toFixed(3) }} COP</b> across all data points</p>
        </div>
    </div>

    <div class="row mt-3" v-if="cop_model.startsWith('carnot-')">
        <div class="col">
            <h4>Model Equations</h4>
            <div v-if="cop_model === 'carnot-fixed-offset'">
                <p>Fixed offset Carnot model:</p>
                <p>T<sub>condensing</sub> = T<sub>flow</sub> + {{ condensing_fixed_offset }}°C</p>
                <p>T<sub>evaporating</sub> = T<sub>ambient</sub> + {{ evaporating_fixed_offset }}°C</p>
                <p>COP = {{ practical_cop_factor }} × (T<sub>condensing</sub> + 273.15) / (T<sub>condensing</sub> - T<sub>evaporating</sub>)</p>
            </div>
            <div v-if="cop_model === 'carnot-variable-offset'">
                <p>Variable offset Carnot model (speed dependent):</p>
                <p>T<sub>condensing</sub> = T<sub>flow</sub> + (speed/120) × {{ condensing_scale }}°C</p>
                <p>T<sub>evaporating</sub> = T<sub>ambient</sub> + (speed/120) × {{ evaporating_scale }}°C</p>
                <p>COP = {{ practical_cop_factor }} × (T<sub>condensing</sub> + 273.15) / (T<sub>condensing</sub> - T<sub>evaporating</sub>)</p>
            </div>
            <div v-if="cop_model === 'carnot-variable-offset-output'">
                <p>Variable offset Carnot model (output dependent):</p>
                <p>T<sub>condensing</sub> = T<sub>flow</sub> + (output/{{ max_output }}) × {{ condensing_scale }}°C</p>
                <p>T<sub>evaporating</sub> = T<sub>ambient</sub> + (output/{{ max_output }}) × {{ evaporating_scale }}°C</p>
                <p>COP = {{ practical_cop_factor }} × (T<sub>condensing</sub> + 273.15) / (T<sub>condensing</sub> - T<sub>evaporating</sub>)</p>
            </div>
        </div>
    </div>


    <div class="row">
        <div class="col">
            <h3>Model parameters</h3>
            <p>The model uses the Carnot COP equation with some practical adjustments to better fit the real-world data. You can adjust these parameters to see how they affect the model fit.</p>

            
        </div>
    </div>
    <div class="row mt-3">

        <div class="col">
            <label class="form-label">COP model type</label>
            <select class="form-select" v-model="cop_model" @change="update()">
                <option value="carnot-fixed-offset">Carnot with fixed offsets</option>
                <option value="carnot-variable-offset">Carnot with variable offsets (scaled by speed)</option>
                <option value="carnot-variable-offset-output">Carnot with variable offsets (scaled by output)</option>
                <option value="coolprop-vapour-compression">CoolProp vapour compression model</option>
                <option value="vaillant-datasheet">Vaillant datasheet interpolation (validation only)</option>
            </select>
        </div>

        <div class="col" v-if="cop_model === 'carnot-variable-offset' || cop_model === 'carnot-fixed-offset' || cop_model === 'carnot-variable-offset-output'">
            <label class="form-label">Practical COP factor</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="practical_cop_factor" @change="update()">
                <span class="input-group-text">× Carnot COP</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'coolprop-vapour-compression'">
            <label class="form-label">Refrigerant</label>
            <select class="form-select" v-model="refrigerant" @change="update()">
                <option value="R290">R290</option>
                <option value="R32">R32</option>
                <option value="R410A">R410A</option>
            </select>
        </div>

        <div class="col" v-if="cop_model === 'coolprop-vapour-compression'">
            <label class="form-label">Compressor isentropic efficiency</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="eta_isentropic" @change="update()">
                <span class="input-group-text">η</span>
            </div>
        </div>


    </div>
    <div class="row mt-3">

        <div class="col" v-if="cop_model === 'carnot-variable-offset'">
            <label class="form-label">Condensing temp scale (°C at 120 rps)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="condensing_scale" @change="update()">
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'carnot-variable-offset'">
            <label class="form-label">Evaporating temp scale (°C at 120 rps)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="evaporating_scale" @change="update()">
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'carnot-variable-offset-output' || cop_model === 'coolprop-vapour-compression'">
            <label class="form-label">Condensing temp scale (°C at max output)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="condensing_scale" @change="update()">
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'carnot-variable-offset-output' || cop_model === 'coolprop-vapour-compression'">
            <label class="form-label">Evaporating temp scale (°C at max output)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="evaporating_scale" @change="update()">
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'carnot-variable-offset-output' || cop_model === 'coolprop-vapour-compression'">
            <label class="form-label">Max heat output for scaling</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="max_output" @change="update()">
                <span class="input-group-text">kW</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'carnot-fixed-offset'">
            <label class="form-label">Fixed condensing temp offset</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="condensing_fixed_offset" @change="update()">
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col" v-if="cop_model === 'carnot-fixed-offset'">
            <label class="form-label">Fixed evaporating temp offset</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="evaporating_fixed_offset" @change="update()">
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>
</div>

<script>
    var app = new Vue({
        el: '#app',
        data: {
            flow_temperature: 35,
            data: vaillant_data,
            active_flow_temp: '35C',
            mean_abs_error: null,
            // cop model
            cop_model: 'carnot-fixed-offset',
            // fixed offsets at all speeds
            condensing_fixed_offset: 2,
            evaporating_fixed_offset: -6,
            // variable offsets scaled by speed
            condensing_scale: 3,
            evaporating_scale: -7,
            // variable offsets scaled by output
            max_output: 8.5, // kW for 5kW model
            // multiplier to get practical COP from Carnot COP
            practical_cop_factor: 0.45,
            eta_isentropic: 0.51, // Compressor isentropic efficiency
            refrigerant: 'R290', // CoolProp refrigerant
        },
        computed: {
            flow_temps: function() {
                return Object.keys(this.data['5kW']).filter(k => k.endsWith('C'));
            }
        },
        methods: {
            update: function () {
                this.model();
            },
            carnot_fixed_offset: function(T_flow, T_ambient) {
                let condensing_offset = this.condensing_fixed_offset;
                let evaporating_offset = this.evaporating_fixed_offset;

                let T_condensing = T_flow + condensing_offset;
                let T_evaporating = T_ambient + evaporating_offset;

                let carnot_cop = (T_condensing + 273.15) / (T_condensing - T_evaporating);
                return practical_cop = carnot_cop * this.practical_cop_factor;
            },
            carnot_variable_offset: function(T_flow, T_ambient, speed) {
                let condensing_offset = (speed / 120) * this.condensing_scale;
                let evaporating_offset = (speed / 120) * this.evaporating_scale;

                let T_condensing = T_flow + condensing_offset;
                let T_evaporating = T_ambient + evaporating_offset;

                let carnot_cop = (T_condensing + 273.15) / (T_condensing - T_evaporating);
                return practical_cop = carnot_cop * this.practical_cop_factor;
            },
            carnot_variable_offset_output: function(T_flow, T_ambient, output) {
                let condensing_offset = (output / this.max_output) * this.condensing_scale;
                let evaporating_offset = (output / this.max_output) * this.evaporating_scale;

                let T_condensing = T_flow + condensing_offset;
                let T_evaporating = T_ambient + evaporating_offset;

                let carnot_cop = (T_condensing + 273.15) / (T_condensing - T_evaporating);
                return practical_cop = carnot_cop * this.practical_cop_factor;
            },
            coolprop_vapour_compression_cop: function(T_flow, T_ambient, output) {

                let condensing_offset = (output / this.max_output) * this.condensing_scale;
                let evaporating_offset = (output / this.max_output) * this.evaporating_scale;

                // T_flow: Desired outlet temperature (e.g., water temp) in °C
                // T_ambient: Heat source temperature (e.g., ambient air temp) in °C
                
                // Assumptions for saturation temperatures (°C)
                let T_condensing = T_flow + condensing_offset; 
                let T_evaporating = T_ambient + evaporating_offset;

                // Convert all temperatures to Kelvin for CoolProp
                const T_cond_K = T_condensing + 273.15;
                const T_evap_K = T_evaporating + 273.15;

                const CoolProp = Module;
                const fluid = this.refrigerant || 'R290'; // Propane

                // --- 1. Determine Pressures ---
                // P_condensing: Saturated liquid (Q=0) pressure at T_condensing
                let p_condensing = CoolProp.PropsSI('P', 'T', T_cond_K, 'Q', 0, fluid); 
                // P_evaporating: Saturated vapor (Q=1) pressure at T_evaporating
                let p_evaporating = CoolProp.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid); 

                // --- 2. Cycle Point Enthalpies (J/kg) ---
                // h1 (State 1: Compressor Inlet)
                // Saturated vapor at evaporating pressure
                let h1 = CoolProp.PropsSI('H', 'P', p_evaporating, 'Q', 1, fluid); 
                let s1 = CoolProp.PropsSI('S', 'P', p_evaporating, 'Q', 1, fluid); // Needed for isentropic process

                // h3 (State 3: Condenser Outlet)
                // Saturated liquid at condensing pressure (subcooling assumed zero)
                let h3 = CoolProp.PropsSI('H', 'P', p_condensing, 'Q', 0, fluid); 

                // h4 (State 4: Evaporator Inlet)
                // Isenthalpic expansion: h4 = h3
                let h4 = h3; 

                // --- 3. Isentropic and Actual Compression (h2) ---
                // h2s (Isentropic State 2)
                // Isentropic process: s2s = s1 at P_condensing
                let h2s = CoolProp.PropsSI('H', 'P', p_condensing, 'S', s1, fluid); 

                // h2 (Actual State 2)
                // Actual Work = Isentropic Work / Efficiency
                // h2 = h1 + (h2s - h1) / eta_isentropic
                let h2 = h1 + (h2s - h1) / this.eta_isentropic; 

                // --- 4. COP Calculation ---
                // COP (Heating) = Q_condenser / W_compressor
                // COP = (h2 - h3) / (h2 - h1)
                let cop = (h2 - h3) / (h2 - h1);

                return cop;
            },

            model: function() {
                // Generate modelled COP using carnot COP equation
                for (var model in this.data) {

                    var total_error = 0;
                    var count = 0;
                    
                    var model_data = this.data[model];

                    for (var flow_temp_str in model_data) {
                        if (flow_temp_str.endsWith('C')) {
                            var flow_temp_data = model_data[flow_temp_str];
                            var T_flow = parseFloat(flow_temp_str);

                            if (!flow_temp_data.sim_cop) {
                                this.$set(flow_temp_data, 'sim_cop', []);
                            }

                            for (var i = 0; i < model_data.ambient.length; i++) {
                                if (!flow_temp_data.sim_cop[i]) {
                                    this.$set(flow_temp_data.sim_cop, i, []);
                                }
                                var T_ambient = model_data.ambient[i];

                                for (var j = 0; j < model_data.speed.length; j++) {
                                    if (flow_temp_data.cop[i][j] !== null) {

                                        let practical_cop = null;

                                        // Calculate modelled COP based on selected model

                                        if (this.cop_model === 'carnot-fixed-offset') {
                                            practical_cop = this.carnot_fixed_offset(T_flow, T_ambient);
                                        } else if (this.cop_model === 'carnot-variable-offset') {
                                            let speed = model_data.speed[j];
                                            practical_cop = this.carnot_variable_offset(T_flow, T_ambient, speed);
                                        } else if (this.cop_model === 'carnot-variable-offset-output') {
                                            let output = flow_temp_data.output[i][j];
                                            practical_cop = this.carnot_variable_offset_output(T_flow, T_ambient, output);
                                        } else if (this.cop_model === 'vaillant-datasheet') {
                                            let output = flow_temp_data.output[i][j];
                                            practical_cop = getCOP(vaillant_data, T_flow, T_ambient, output);
                                        } else if (this.cop_model === 'coolprop-vapour-compression') {
                                            let output = flow_temp_data.output[i][j];
                                            practical_cop = this.coolprop_vapour_compression_cop(T_flow, T_ambient, output);
                                        }

                                        if (practical_cop !== null) {
                                            // Calculate error
                                            var error = Math.abs(practical_cop - flow_temp_data.cop[i][j]);
                                            total_error += error;
                                            count += 1;

                                            this.$set(flow_temp_data.sim_cop[i], j, practical_cop.toFixed(1));
                                        } else {
                                            this.$set(flow_temp_data.sim_cop[i], j, null);
                                        }
                                        

                                    } else {
                                        this.$set(flow_temp_data.sim_cop[i], j, null);
                                    }
                                }
                            }
                        }
                    }

                    this.mean_abs_error = total_error / count;
                }
            },
            getCopColor: function(cop) {
                if (cop === null) return '#f8f9fa';
                // HSL color interpolation: Red (0) -> Yellow (60) -> Green (120)
                // Mapping COP from 1 (red) to 6 (green)
                var hue = Math.min(Math.max(cop, 1), 6); // Clamp COP between 1 and 6
                hue = (hue - 1) * (120 / 5); // Scale to 0-120 hue range
                return 'hsl(' + hue + ', 100%, 80%)';
            }
        }
    });
    app.model();
</script>
<script src="<?php echo $path;?>coolprop/coolprop.js"></script>