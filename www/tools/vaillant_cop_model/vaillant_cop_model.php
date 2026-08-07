<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="<?php echo $path_lib;?>vaillant.js?v=10"></script>
<script src="<?php echo $path_lib;?>vaillant_cop_fit.js?v=2"></script>


<?php $title = "Vaillant COP model"; ?>

<div class="container mt-3" style="max-width:1000px" id="app">
    <div class="row">
        <div class="col">
            <h3>Vaillant Arotherm+ datasheet vs model</h3>
            <p>This tool compares Vaillant Arotherm+ datasheet performance tables with a range of COP models to see how well each one fits real-world data. The models start with the Carnot equation using fixed temperature offsets, then offsets that scale with compressor speed or heat output, then full vapour compression cycle calculations using CoolProp refrigerant properties. The last three replace the fixed practical COP factor with an efficiency curve fitted to the datasheet tables: fitted to each unit, as a single generic set that works from the nominal capacity, or a generic set written in inferred compressor speed rather than load fraction.</p>
        </div>
    </div>

    <div class="row mt-4">
        <div class="col">
            <div class="p-4 rounded" style="background-color:whitesmoke">
                <h4>Model parameters</h4>
                <p>Most of the models use the Carnot COP equation with some practical adjustments to better fit the real-world data. You can select a model and adjust its parameters to see how they affect the model fit.</p>
                <div class="row mt-3">

                    <div class="col">
                        <label class="form-label">COP model type</label>
                        <select class="form-select" v-model="cop_model" @change="update()">
                            <option value="carnot-fixed-offset">Carnot with fixed offsets</option>
                            <option value="carnot-variable-offset">Carnot with variable offsets (scaled by speed)</option>
                            <option value="carnot-variable-offset-output">Carnot with variable offsets (scaled by output)</option>
                            <option value="coolprop-vapour-compression-v1">CoolProp vapour compression model v1</option>
                            <option value="coolprop-vapour-compression-v2">CoolProp vapour compression model v2</option>
                            <option value="carnot-fitted">Carnot with fitted efficiency curve (unit specific)</option>
                            <option value="carnot-fitted-generic">Carnot with fitted efficiency curve (generic, capacity normalised)</option>
                            <option value="carnot-fitted-generic-v2">Carnot with fitted efficiency curve (generic v2, speed based)</option>
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

                    <div class="col" v-if="cop_model === 'coolprop-vapour-compression-v1' || cop_model === 'coolprop-vapour-compression-v2'">
                        <label class="form-label">Refrigerant</label>
                        <select class="form-select" v-model="refrigerant" @change="update()">
                            <option value="R290">R290</option>
                            <option value="R32">R32</option>
                            <option value="R410A">R410A</option>
                        </select>
                    </div>

                    <div class="col" v-if="cop_model === 'coolprop-vapour-compression-v1'">
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

                    <div class="col" v-if="cop_model === 'carnot-variable-offset-output' || cop_model === 'coolprop-vapour-compression-v1' || cop_model === 'coolprop-vapour-compression-v2'">
                        <label class="form-label">Condensing temp scale (°C at max output)</label>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" v-model.number="condensing_scale" @change="update()">
                            <span class="input-group-text">°C</span>
                        </div>
                    </div>

                    <div class="col" v-if="cop_model === 'carnot-variable-offset-output' || cop_model === 'coolprop-vapour-compression-v1' || cop_model === 'coolprop-vapour-compression-v2'">
                        <label class="form-label">Evaporating temp scale (°C at max output)</label>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" v-model.number="evaporating_scale" @change="update()">
                            <span class="input-group-text">°C</span>
                        </div>
                    </div>

                    <div class="col" v-if="cop_model === 'carnot-variable-offset-output' || cop_model === 'coolprop-vapour-compression-v1' || cop_model === 'coolprop-vapour-compression-v2'">
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

                    <div class="col" v-if="cop_model === 'carnot-fitted-generic' || cop_model === 'carnot-fitted-generic-v2'">
                        <label class="form-label">Nominal capacity Q<sub>nom</sub></label>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" v-model.number="fit_qnom" @change="update()">
                            <span class="input-group-text">kW</span>
                        </div>
                    </div>

                    <div class="col" v-if="cop_model === 'carnot-fitted-generic' || cop_model === 'carnot-fitted-generic-v2'">
                        <label class="form-label">Efficiency scale</label>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" v-model.number="fit_eta_scale" @change="update()">
                            <span class="input-group-text">× η</span>
                        </div>
                    </div>

                    <div class="col" v-if="cop_model === 'carnot-fitted' || cop_model === 'carnot-fitted-generic'">
                        <label class="form-label">Defrost penalty</label>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="fit_include_frost" v-model="fit_include_frost" @change="update()">
                            <label class="form-check-label" for="fit_include_frost">Include frost factor</label>
                        </div>
                        <small class="text-muted">On for comparison here, since the datasheet tables embed defrost. Turn off if your simulator applies its own defrost model.</small>
                    </div>
                </div>
            </div>
        </div>
    </div>


    <div class="row mt-4">
        <div class="col">
            <h4>Datasheet comparison</h4>
            <p>The table below shows the datasheet COP at each ambient temperature and compressor speed, with the modelled COP in brackets. Colouring the cells by model error shows the error in brackets instead. Use the tabs to switch flow temperature.</p>
        </div>
    </div>

    <div class="row mb-3">
        <div class="col-md-3">
            <select class="form-select" v-model="selected_model" @change="change_model()">
                <option value="5kW">5kW Model</option>
                <option value="12kW">12kW Model</option>
            </select>
        </div>
        <div class="col-md-4">
            <select class="form-select" v-model="cell_colour">
                <option value="cop">Colour cells by COP</option>
                <option value="error">Colour cells by model error</option>
            </select>
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
                        <th class="fs-6" v-for="speed in data[selected_model].speed">{{ speed }} rps</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(ambient_temp, amb_index) in data[selected_model].ambient">
                        <td><b class="fs-6">{{ ambient_temp }}</b></td>
                        <td v-for="(speed, speed_index) in data[selected_model].speed" :style="{backgroundColor: cellColour(amb_index, speed_index)}">
                            <div v-if="data[selected_model][active_flow_temp].cop[amb_index][speed_index] !== null">
                                <b class="fs-6">{{ data[selected_model][active_flow_temp].cop[amb_index][speed_index] }}</b>
                                <small class="d-block fs-7" v-if="cell_colour === 'error'">{{ cellErrorLabel(amb_index, speed_index) }}</small>
                                <small class="fs-7" v-else-if="data[selected_model][active_flow_temp].sim_cop">({{ data[selected_model][active_flow_temp].sim_cop[amb_index][speed_index] }})</small>
                                <small class="d-block fs-7">{{ data[selected_model][active_flow_temp].output[amb_index][speed_index] }} kW</small>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="row" v-if="cell_colour === 'error' && error_stats !== null">
        <div class="col">
            <div class="d-flex flex-wrap align-items-center gap-1 mb-2">
                <small class="text-muted me-2">Model vs datasheet:</small>
                <small class="text-muted">under</small>
                <span v-for="band in legend_bands" :key="band.label"
                      class="px-2 py-1 border rounded"
                      style="font-size:0.75rem; line-height:1"
                      :style="{backgroundColor: band.colour}">{{ band.label }}</span>
                <small class="text-muted">over</small>
            </div>
        </div>
    </div>

    <div class="row mt-3" v-if="error_stats !== null">
        <div class="col">
            <h4 class="mb-3">Error distribution</h4>

            <div class="row row-cols-2 row-cols-md-5 g-2 mb-3">
                <div class="col" v-for="tile in stat_tiles" :key="tile.label">
                    <div class="border rounded p-2 h-100">
                        <div class="text-muted" style="font-size:0.75rem">{{ tile.label }}</div>
                        <div class="fs-5">{{ tile.value }}</div>
                        <div class="text-muted" style="font-size:0.7rem">{{ tile.note }}</div>
                    </div>
                </div>
            </div>

            <svg :viewBox="'0 0 ' + hist_w + ' ' + hist_h" width="100%" :height="hist_h"
                 role="img" aria-label="Histogram of model error relative to the datasheet"
                 style="max-width:100%; font-family:system-ui,-apple-system,'Segoe UI',sans-serif"
                 @mouseleave="hover_bin = null">

                <!-- y gridlines -->
                <g>
                    <line v-for="tick in hist_yticks" :key="'g'+tick.v"
                          :x1="hist_pad_l" :x2="hist_w - hist_pad_r" :y1="tick.y" :y2="tick.y"
                          stroke="#e1e0d9" stroke-width="1"></line>
                    <text v-for="tick in hist_yticks" :key="'t'+tick.v"
                          :x="hist_pad_l - 6" :y="tick.y + 4" text-anchor="end"
                          fill="#898781" font-size="11">{{ tick.v }}</text>
                </g>

                <!-- bars -->
                <g>
                    <path v-for="bar in hist_bars" :key="'b'+bar.i" :d="bar.d" :fill="bar.colour"
                          @mouseenter="hover_bin = bar.i">
                        <title>{{ bar.tip }}</title>
                    </path>
                    <!-- generous hit targets -->
                    <rect v-for="bar in hist_bars" :key="'h'+bar.i"
                          :x="bar.x" :y="hist_pad_t" :width="bar.w" :height="hist_plot_h"
                          fill="transparent" @mouseenter="hover_bin = bar.i"></rect>
                </g>

                <!-- zero reference and baseline -->
                <line :x1="hist_zero_x" :x2="hist_zero_x" :y1="hist_pad_t" :y2="hist_base_y"
                      stroke="#898781" stroke-width="1" stroke-dasharray="3 3"></line>
                <line :x1="hist_pad_l" :x2="hist_w - hist_pad_r" :y1="hist_base_y" :y2="hist_base_y"
                      stroke="#c3c2b7" stroke-width="1"></line>

                <!-- x axis -->
                <text v-for="tick in hist_xticks" :key="'x'+tick.v" :x="tick.x" :y="hist_base_y + 16"
                      text-anchor="middle" fill="#898781" font-size="11">{{ tick.label }}</text>
                <text :x="(hist_pad_l + hist_w - hist_pad_r) / 2" :y="hist_h - 6" text-anchor="middle"
                      fill="#52514e" font-size="12">Model error relative to datasheet COP (%), negative = model under-predicts</text>

                <!-- hover readout -->
                <g v-if="hover_bin !== null && hist_bars[hover_bin]">
                    <rect :x="hist_tip.x" :y="hist_tip.y" :width="hist_tip.w" height="34" rx="4"
                          fill="#fcfcfb" stroke="#c3c2b7"></rect>
                    <text :x="hist_tip.x + 8" :y="hist_tip.y + 14" fill="#0b0b0b" font-size="11">{{ hist_bars[hover_bin].range }}</text>
                    <text :x="hist_tip.x + 8" :y="hist_tip.y + 28" fill="#52514e" font-size="11">{{ hist_bars[hover_bin].count }} points ({{ hist_bars[hover_bin].pct }})</text>
                </g>
            </svg>

            <p class="text-muted mt-2" style="font-size:0.85rem">
                Counted over all {{ error_stats.n }} datasheet points for the {{ selected_model }} unit,
                across every flow temperature, not just the tab shown above.
            </p>
        </div>
    </div>

    <div class="row mt-5 mb-4" v-if="cop_model.startsWith('carnot-')">
        <div class="col">
            <div class="p-4 rounded" style="background-color:whitesmoke">
                <h4>Appendix: model equations</h4>
                <p>The equations behind the model selected above, with the current parameter values substituted in.</p>
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
                <div v-if="cop_model === 'carnot-fitted'">
                    <p>Carnot with a fitted second-law efficiency curve, from <code>vaillant_cop_fit.js</code>. Unlike the other Carnot models it has no adjustable inputs: its 12 coefficients per unit were least-squares fitted to these same datasheet tables, so this is a measure of how well the structure can fit, not an independent validation.</p>
                    <p>q&#770; = output / Q<sub>nom</sub> &nbsp; (Q<sub>nom</sub> = {{ vaillant_cop_fit_params[selected_model][11] }} kW)</p>
                    <p>T<sub>condensing</sub> = T<sub>flow</sub> + 4 q&#770; &nbsp;&nbsp; T<sub>evaporating</sub> = T<sub>ambient</sub> − 7 q&#770; &nbsp;&nbsp; L = T<sub>c</sub> − T<sub>e</sub></p>
                    <p>η = (e<sub>0</sub> + e<sub>1</sub>q&#770; + e<sub>2</sub>q&#770;² + e<sub>xz</sub>q&#770;z) × (1 + a<sub>1</sub>z + a<sub>2</sub>z² + a<sub>3</sub>z³) × (1 + b<sub>1</sub>w), &nbsp; z = (L−45)/45, &nbsp; w = (T<sub>flow</sub>−50)/15</p>
                    <p>frost = 1 − f<sub>A</sub> exp(−½((T<sub>ambient</sub> − f<sub>μ</sub>)/f<sub>σ</sub>)²)</p>
                    <p>COP = η × frost × (T<sub>condensing</sub> + 273.15) / L</p>
                </div>
                <div v-if="cop_model === 'carnot-fitted-generic'">
                    <p>Same structure as the unit-specific fit, but with a <b>single pooled parameter set</b> fitted jointly to both units in normalised load space, so the only unit dependent inputs are the nominal capacity and an optional efficiency scale. It reproduces both tables at about 7% MAPE, compared with 5.6 to 6.5% for the unit-specific fits. That is the price of generalising, though it is still better than applying one unit's own parameters to the other, which gives 8.7 to 10.2%.</p>
                    <p>q&#770; = output / Q<sub>nom</sub></p>
                    <p>T<sub>condensing</sub> = T<sub>flow</sub> + 4 q&#770; &nbsp;&nbsp; T<sub>evaporating</sub> = T<sub>ambient</sub> − 7 q&#770; &nbsp;&nbsp; L = T<sub>c</sub> − T<sub>e</sub></p>
                    <p>η = scale × (e<sub>0</sub> + e<sub>1</sub>q&#770; + e<sub>2</sub>q&#770;² + e<sub>xz</sub>q&#770;z) × (1 + a<sub>1</sub>z + a<sub>2</sub>z² + a<sub>3</sub>z³) × (1 + b<sub>1</sub>w)</p>
                    <p>COP = η × frost × (T<sub>condensing</sub> + 273.15) / L</p>
                    <p>For a different unit, set Q<sub>nom</sub> to its nominal capacity and leave the scale at 1.0 for other Arotherm+ sizes; for other inverter-driven air-source monoblocs, derive the scale from a few datasheet rating points using <code>calibrateEtaScale()</code>.</p>
                </div>
                <div v-if="cop_model === 'carnot-fitted-generic-v2'">
                    <p>Same pooled approach as the generic fit, but the efficiency polynomial is written in <b>inferred compressor speed</b> rather than load fraction. Normalised volumetric capacity c = Q/(rps·Q<sub>nom</sub>) collapses onto one curve for both units, so speed can be back-calculated from the operating point and nominal capacity alone. This fixes most of the cold high-speed corner error of the load-fraction version. Fitted with the frost amplitude free, the pooled fit chose f<sub>A</sub> = 0, so v2 is a pre-defrost surface by construction and has no defrost option here; the remaining error against these tables is therefore partly the datasheet's embedded defrost penalty. Its other known weakness is underprediction at mild ambient (+10 to +20°C) for the 5 kW unit, the flip side of fitting across the EN 14511 wet/dry coil boundary at about +7°C.</p>
                    <p>c = (c<sub>0</sub> + c<sub>1</sub>T<sub>ambient</sub> + c<sub>2</sub>T<sub>ambient</sub>²) × (1 + c<sub>3</sub>(T<sub>flow</sub> − 50)) &nbsp;&nbsp; rps = output / (Q<sub>nom</sub> c), clamped to 30–120</p>
                    <p>q&#770; = output / Q<sub>nom</sub> &nbsp;&nbsp; s = rps / 100</p>
                    <p>T<sub>condensing</sub> = T<sub>flow</sub> + 4 q&#770; &nbsp;&nbsp; T<sub>evaporating</sub> = T<sub>ambient</sub> − 7 q&#770; &nbsp;&nbsp; L = T<sub>c</sub> − T<sub>e</sub></p>
                    <p>η = scale × (e<sub>0</sub> + e<sub>1</sub>s + e<sub>2</sub>s² + e<sub>xz</sub>sz) × (1 + a<sub>1</sub>z + a<sub>2</sub>z² + a<sub>3</sub>z³) × (1 + b<sub>1</sub>w), &nbsp; z = (L−45)/45, &nbsp; w = (T<sub>flow</sub>−50)/15</p>
                    <p>COP = η × (T<sub>condensing</sub> + 273.15) / L</p>
                    <p>The same capacity model gives the modulation envelope at a condition via <code>outputRange()</code>, and raw (unclamped) speed via <code>estimateSpeed()</code> to detect demand below the minimum modulation, i.e. on/off cycling.</p>
                </div>
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
            vaillant_cop_fit_params: vaillant_cop_fit_params,
            selected_model: '5kW',
            active_flow_temp: '35C',
            mean_abs_error: null,
            // error visualisation
            cell_colour: 'error',       // 'cop' | 'error'
            error_stats: null,
            hover_bin: null,
            // diverging ramp for signed error: blue (model under) - grey - red (model over).
            // Steps interpolated in OKLab from the neutral to each pole; every step
            // clears 4.7:1 against the cell text, so the numbers stay readable.
            err_neutral: '#f0efec',
            err_ramp_under: ['#c6d6ea', '#a0bee6', '#7aa7e2', '#528fdc', '#2a78d6'],
            err_ramp_over:  ['#f3cdc7', '#f2aea6', '#ef8e86', '#ea6c66', '#e34948'],
            err_bands: [2.5, 5, 10, 15, 20],   // % thresholds between ramp steps
            // histogram geometry
            hist_w: 720, hist_h: 240,
            hist_pad_l: 42, hist_pad_r: 12, hist_pad_t: 12, hist_pad_b: 44,
            hist_bin_w: 2.5,   // % per bin
            hist_range: 20,    // % covered before the overflow bins
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
            // fitted efficiency curve models (vaillant_cop_fit.js)
            fit_include_frost: true,  // datasheet tables embed the defrost penalty
            fit_qnom: 5.0,            // generic model: nominal capacity, kW
            fit_eta_scale: 1.0,       // generic model: efficiency scale for other units
        },
        computed: {
            flow_temps: function() {
                return Object.keys(this.data[this.selected_model]).filter(k => k.endsWith('C'));
            },
            hist_plot_h: function() {
                return this.hist_h - this.hist_pad_t - this.hist_pad_b;
            },
            hist_base_y: function() {
                return this.hist_pad_t + this.hist_plot_h;
            },
            hist_plot_w: function() {
                return this.hist_w - this.hist_pad_l - this.hist_pad_r;
            },
            // Scale runs from -(range + one overflow bin) to +(range + one overflow bin)
            hist_span: function() {
                return this.hist_range + this.hist_bin_w;
            },
            hist_zero_x: function() {
                return this.hist_pad_l + this.hist_plot_w / 2;
            },
            // "Nice" gridline step: 1, 2 or 5 x a power of ten, aiming for ~4 gridlines
            hist_ystep: function() {
                if (!this.error_stats) return 1;
                var peak = Math.max(Math.max.apply(null, this.error_stats.hist), 1);
                var mag = Math.pow(10, Math.floor(Math.log10(peak / 4)));
                var norm = (peak / 4) / mag;
                return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
            },
            hist_ymax: function() {
                if (!this.error_stats) return 1;
                var peak = Math.max(Math.max.apply(null, this.error_stats.hist), 1);
                return this.hist_ystep * Math.ceil(peak / this.hist_ystep);
            },
            hist_yticks: function() {
                var ticks = [];
                for (var v = 0; v <= this.hist_ymax; v += this.hist_ystep) {
                    ticks.push({ v: v, y: this.hist_base_y - (v / this.hist_ymax) * this.hist_plot_h });
                }
                return ticks;
            },
            hist_xticks: function() {
                var ticks = [], self = this;
                [-20, -10, 0, 10, 20].forEach(function(v) {
                    ticks.push({
                        v: v,
                        x: self.hist_zero_x + (v / self.hist_span) * (self.hist_plot_w / 2),
                        label: (v > 0 ? '+' : '') + v + '%'
                    });
                });
                return ticks;
            },
            hist_bars: function() {
                if (!this.error_stats) return [];
                var counts = this.error_stats.hist;
                var n = counts.length;
                var slot = this.hist_plot_w / n;
                var w = Math.max(slot - 2, 1);       // 2px surface gap between bars
                var bars = [], self = this;
                for (var i = 0; i < n; i++) {
                    var lo = -this.hist_range - this.hist_bin_w + i * this.hist_bin_w;
                    var hi = lo + this.hist_bin_w;
                    var first = (i === 0), last = (i === n - 1);
                    var range = first ? 'below -' + this.hist_range + '%'
                              : last  ? 'above +' + this.hist_range + '%'
                              : (lo > 0 ? '+' : '') + lo + '% to ' + (hi > 0 ? '+' : '') + hi + '%';
                    var h = (counts[i] / this.hist_ymax) * this.hist_plot_h;
                    var x = this.hist_pad_l + i * slot + 1;
                    var mid = first ? -(this.hist_range + 5) : last ? (this.hist_range + 5) : (lo + hi) / 2;
                    var pct = this.error_stats.n ? (100 * counts[i] / this.error_stats.n).toFixed(1) + '%' : '0%';
                    bars.push({
                        i: i, x: x, w: w, count: counts[i], range: range, pct: pct,
                        colour: counts[i] === 0 ? '#e1e0d9' : this.getErrorColour(mid),
                        d: this.barPath(x, this.hist_base_y, w, h, 4),
                        tip: range + ': ' + counts[i] + ' points'
                    });
                }
                return bars;
            },
            hist_tip: function() {
                var bar = this.hist_bars[this.hover_bin];
                if (!bar) return { x: 0, y: 0, w: 0 };
                var w = 150;
                var x = Math.min(Math.max(bar.x + bar.w / 2 - w / 2, this.hist_pad_l),
                                 this.hist_w - this.hist_pad_r - w);
                return { x: x, y: this.hist_pad_t + 2, w: w };
            },
            legend_bands: function() {
                var bands = [], self = this;
                // most-negative first, through the neutral, out to most-positive
                for (var i = this.err_bands.length - 1; i >= 0; i--) {
                    bands.push({
                        colour: this.err_ramp_under[i],
                        label: i === this.err_bands.length - 1 ? '<-' + this.err_bands[i] + '%'
                             : '-' + this.err_bands[i + 1] + '..-' + this.err_bands[i]
                    });
                }
                bands.push({ colour: this.err_neutral, label: '±' + this.err_bands[0] + '%' });
                for (var j = 0; j < this.err_bands.length; j++) {
                    bands.push({
                        colour: this.err_ramp_over[j],
                        label: j === this.err_bands.length - 1 ? '>+' + this.err_bands[j] + '%'
                             : '+' + this.err_bands[j] + '..+' + this.err_bands[j + 1]
                    });
                }
                return bands;
            },
            stat_tiles: function() {
                var s = this.error_stats;
                if (!s) return [];
                return [
                    { label: 'Mean abs error', value: s.mae.toFixed(3), note: 'COP' },
                    { label: 'Mean rel error', value: s.mape.toFixed(1) + '%', note: 'MAPE' },
                    { label: 'Bias', value: (s.bias >= 0 ? '+' : '') + s.bias.toFixed(1) + '%', note: s.bias >= 0 ? 'model over-predicts' : 'model under-predicts' },
                    { label: 'Within ±10%', value: s.within10.toFixed(0) + '%', note: 'of ' + s.n + ' points' },
                    { label: 'Worst error', value: (s.worst > 0 ? '+' : '') + s.worst.toFixed(1) + '%', note: s.worst_at }
                ];
            }
        },
        methods: {
            update: function () {
                this.model();
            },
            change_model: function() {
                this.mean_abs_error = null;
                this.error_stats = null;
                if (this.selected_model === '5kW') {
                    this.max_output = 8.5;
                    this.fit_qnom = 5.0;
                } else if (this.selected_model === '12kW') {
                    this.max_output = 17.9;
                    this.fit_qnom = 12.0;
                }
                this.update();
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

            coolprop_vapour_compression_cop_v1: function(T_flow, T_ambient, output) {

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
            
            /**
             * Calculates the COP of a vapour compression cycle with superheating and subcooling.
             * @param {object} inputs - The operating conditions.
             * @param {number} inputs.T_flow - Desired outlet water temperature (°C).
             * @param {number} inputs.T_ambient - Heat source ambient air temperature (°C).
             * @param {number} inputs.output - Current thermal output of the heat pump (W).
             * @param {object} params - The parameters defining the heat pump.
             * @param {string} params.refrigerant - Refrigerant name (e.g., 'R290').
             * @param {number} params.max_output - Maximum thermal output (W).
             * @param {number} params.condensing_scale - Temperature offset scale for condenser (°C).
             * @param {number} params.evaporating_scale - Temperature offset scale for evaporator (°C).
             * @param {number} params.superheat_K - Superheat at compressor inlet (K).
             * @param {number} params.subcooling_K - Subcooling at condenser outlet (K).
             * @returns {object} An object containing the thermodynamic COP and other cycle data.
             */
            coolprop_vapour_compression_cop_v2: function(inputs, params) {
                const { T_flow, T_ambient, output } = inputs;
                const { refrigerant, max_output, condensing_scale, evaporating_scale, superheat_K, subcooling_K } = params;

                // The following model has been generated via a number of cross-checking AI prompts across a number 
                // of different services Gemini, Claude, GROK. Expert review is recommended to ensure accuracy.
                // Especially: isentropic efficiency model, pressure drops, HX effectiveness assumptions.
                // Overall accuracy seems reasonable when compared against the Vaillant datasheet.
                // However performance is not significantly better than a simpler Carnot-based model.

                const load_fraction = output / max_output;
                // increase sub-linearly due to HX pinch points, though 0.9 is perhaps too high
                let condensing_offset = condensing_scale * Math.pow(load_fraction, 0.9);
                let evaporating_offset = evaporating_scale * Math.pow(load_fraction, 0.9);

                // --- 1. Define Cycle Temperatures (K) ---
                const T_cond_sat_K = (T_flow + condensing_offset) + 273.15;
                const T_evap_sat_K = (T_ambient + evaporating_offset) + 273.15;

                const CoolProp = Module;

                // --- 2. Determine Pressures ---
                let p_condensing = CoolProp.PropsSI('P', 'T', T_cond_sat_K, 'Q', 0, refrigerant);
                let p_evaporating = CoolProp.PropsSI('P', 'T', T_evap_sat_K, 'Q', 1, refrigerant);

                // --- 3. Cycle Point Enthalpies (J/kg) ---

                // State 1 (Compressor Inlet) - Saturated Vapor + Superheat
                const T1_K = T_evap_sat_K + superheat_K;
                let h1 = CoolProp.PropsSI('H', 'P', p_evaporating, 'T', T1_K, refrigerant);
                let s1 = CoolProp.PropsSI('S', 'P', p_evaporating, 'T', T1_K, refrigerant);

                // Pressure drop across the condenser
                const delta_P_cond = 20000 * Math.pow(load_fraction, 2); // Pa, quadratic with flow
                const p_cond_exit = p_condensing - delta_P_cond;

                // Estimate actual condenser outlet temperature with effectiveness
                let condenser_effectiveness = 0.85; // doesnt seem to make a huge difference 0.8-0.9
                const T_water_out = T_flow + 273.15;
                const T3_actual_K = T_cond_sat_K - condenser_effectiveness * (T_cond_sat_K - T_water_out);

                // State 3 (Condenser Outlet) - Saturated Liquid + Subcooling
                const T3_K = T_cond_sat_K - subcooling_K;
                let h3 = CoolProp.PropsSI('H', 'P', p_cond_exit, 'T', T3_actual_K, refrigerant);

                // State 4 (Evaporator Inlet) - Isenthalpic Expansion
                let h4 = h3;

                // --- 4. Isentropic and Actual Compression (h2) ---
                // Calculate pressure ratio for variable efficiency model
                const pressure_ratio = p_condensing / p_evaporating;
                
                // Example: A simple quadratic model for isentropic efficiency
                // These coefficients (a, b, c) would be determined from manufacturer data
                // let eta_isentropic = -0.01 * Math.pow(pressure_ratio, 2) + 0.05 * pressure_ratio + 0.50; // Placeholder function
                // let eta_isentropic = -0.02 * Math.pow(pressure_ratio, 2) + 0.1 * pressure_ratio + 0.45; // Fitted quadratic


                // Model isentropic efficiency degradation with pressure ratio and part load
                // Typical range: 0.60-0.75 for scroll compressors
                let eta_isentropic_base = 0.51; // Base efficiency at nominal conditions
                let eta_isentropic = eta_isentropic_base;

                // Optional: Add pressure ratio penalty (efficiency drops at high PR)
                const pr_penalty = Math.max(0, 1 - 0.02 * (pressure_ratio - 3));

                // Optional: Add part-load penalty (efficiency drops at low load)
                const load_penalty = 0.75 + 0.25 * load_fraction;

                eta_isentropic = eta_isentropic * pr_penalty * load_penalty;

                // Clamp to realistic range
                eta_isentropic = Math.max(0.45, Math.min(0.80, eta_isentropic));

                // eta_isentropic = this.eta_isentropic;

                // h2s (Isentropic State 2)
                let h2s = CoolProp.PropsSI('H', 'P', p_condensing, 'S', s1, refrigerant);

                // h2 (Actual State 2)
                let h2 = h1 + (h2s - h1) / eta_isentropic;

                // --- 5. COP Calculation ---
                const heat_rejected = h2 - h3;    // Heat released in condenser
                const work_done = h2 - h1;        // Work input to compressor
                
                if (work_done <= 0) {
                    return { cop: Infinity, pressure_ratio: pressure_ratio }; // Avoid division by zero
                }
                
                const cop_thermo = heat_rejected / work_done;

                return { 
                    cop: cop_thermo, 
                    pressure_ratio: pressure_ratio, 
                    eta_isentropic: eta_isentropic 
                };
            },


            model: function() {
                // Generate modelled COP using carnot COP equation

                var total_error = 0;
                var count = 0;

                // Error distribution accumulators. Relative error is the primary
                // measure since COP spans roughly 1.5-6 across these tables, so a
                // fixed COP tolerance means very different things at either end.
                var total_rel = 0;          // signed, for bias
                var total_abs_rel = 0;      // for MAPE
                var within10 = 0;
                var worst = 0, worst_at = '';
                var n_bins = 2 + 2 * this.hist_range / this.hist_bin_w;
                var hist = new Array(n_bins).fill(0);

                var model_data = this.data[this.selected_model];

                for (var flow_temp_str in model_data) {
                    if (flow_temp_str.endsWith('C')) {
                        var flow_temp_data = model_data[flow_temp_str];
                        var T_flow = parseFloat(flow_temp_str);

                        if (!flow_temp_data.sim_cop) {
                            this.$set(flow_temp_data, 'sim_cop', []);
                        }
                        if (!flow_temp_data.sim_err) {
                            this.$set(flow_temp_data, 'sim_err', []);
                        }

                        for (var i = 0; i < model_data.ambient.length; i++) {
                            if (!flow_temp_data.sim_cop[i]) {
                                this.$set(flow_temp_data.sim_cop, i, []);
                            }
                            if (!flow_temp_data.sim_err[i]) {
                                this.$set(flow_temp_data.sim_err, i, []);
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
                                    } else if (this.cop_model === 'carnot-fitted') {
                                        let output = flow_temp_data.output[i][j];
                                        practical_cop = copFit(this.selected_model, T_flow, T_ambient, output, this.fit_include_frost);
                                    } else if (this.cop_model === 'carnot-fitted-generic') {
                                        let output = flow_temp_data.output[i][j];
                                        practical_cop = copFitGeneric(this.fit_qnom, T_flow, T_ambient, output, {
                                            etaScale: this.fit_eta_scale,
                                            includeFrost: this.fit_include_frost
                                        });
                                    } else if (this.cop_model === 'carnot-fitted-generic-v2') {
                                        let output = flow_temp_data.output[i][j];
                                        practical_cop = copFitGenericV2(this.fit_qnom, T_flow, T_ambient, output, {
                                            etaScale: this.fit_eta_scale
                                        });
                                    } else if (this.cop_model === 'vaillant-datasheet') {
                                        let output = flow_temp_data.output[i][j];
                                        practical_cop = getCOP(vaillant_data[this.selected_model], T_flow, T_ambient, output);
                                    } else if (this.cop_model === 'coolprop-vapour-compression-v1') {
                                        let output = flow_temp_data.output[i][j];
                                        practical_cop = this.coolprop_vapour_compression_cop_v1(T_flow, T_ambient, output);
                                    } else if (this.cop_model === 'coolprop-vapour-compression-v2') {
                                        let output = flow_temp_data.output[i][j];
                                        practical_cop = this.coolprop_vapour_compression_cop_v2(
                                            { T_flow: T_flow, T_ambient: T_ambient, output: output * 1000 }, // Convert kW to W
                                            { 
                                                refrigerant: this.refrigerant, 
                                                max_output: this.max_output * 1000, // Convert kW to W
                                                condensing_scale: this.condensing_scale, 
                                                evaporating_scale: this.evaporating_scale, 
                                                superheat_K: 5, // Fixed superheat
                                                subcooling_K: 3, // Fixed subcooling
                                            }
                                        ).cop;
                                    }

                                    if (practical_cop !== null) {

                                        // Calculate electric input from output and COP
                                        // let output = flow_temp_data.output[i][j];
                                        // let electric_input = output / practical_cop;

                                        // Add fan power
                                        // let base_fan_power = 20;
                                        // let var_fan_power = 40;
                                        // let fan_power_exponent = 0.65;
                                        // let load_fraction = output / this.max_output;
                                        // let ambient_factor = 1;
                                        // let fan_power = base_fan_power + var_fan_power * Math.pow(load_fraction, fan_power_exponent) * ambient_factor;

                                        // practical_cop = output / (electric_input + (fan_power * 0.001));

                                        if (practical_cop>=0 && practical_cop<20) {

                                            // Calculate error
                                            var datasheet_cop = flow_temp_data.cop[i][j];
                                            var error = Math.abs(practical_cop - datasheet_cop);
                                            total_error += error;
                                            count += 1;
                                            this.$set(flow_temp_data.sim_cop[i], j, practical_cop.toFixed(1));

                                            // Signed relative error, %
                                            var rel = 100 * (practical_cop - datasheet_cop) / datasheet_cop;
                                            this.$set(flow_temp_data.sim_err[i], j, rel);

                                            total_rel += rel;
                                            total_abs_rel += Math.abs(rel);
                                            if (Math.abs(rel) <= 10) within10 += 1;
                                            if (Math.abs(rel) > Math.abs(worst)) {
                                                worst = rel;
                                                worst_at = 'at ' + T_ambient + '°C / ' + flow_temp_str + ' flow';
                                            }

                                            // Bin index: one overflow bin at each end
                                            var b = Math.floor((rel + this.hist_range) / this.hist_bin_w) + 1;
                                            hist[Math.max(0, Math.min(n_bins - 1, b))] += 1;
                                        } else {
                                            this.$set(flow_temp_data.sim_cop[i], j, '');
                                            this.$set(flow_temp_data.sim_err[i], j, null);
                                        }


                                    } else {
                                        this.$set(flow_temp_data.sim_cop[i], j, null);
                                        this.$set(flow_temp_data.sim_err[i], j, null);
                                    }


                                } else {
                                    this.$set(flow_temp_data.sim_cop[i], j, null);
                                    this.$set(flow_temp_data.sim_err[i], j, null);
                                }
                            }
                        }
                    }
                }

                this.mean_abs_error = count ? total_error / count : null;
                this.hover_bin = null;
                this.error_stats = count ? {
                    n: count,
                    mae: total_error / count,
                    mape: total_abs_rel / count,
                    bias: total_rel / count,
                    within10: 100 * within10 / count,
                    worst: worst,
                    worst_at: worst_at,
                    hist: hist
                } : null;
            },
            /**
             * Diverging colour for a signed relative error, in percent.
             * Blue = model under-predicts, grey = on the money, red = over-predicts.
             */
            getErrorColour: function(rel_pct) {
                var mag = Math.abs(rel_pct);
                if (mag < this.err_bands[0]) return this.err_neutral;
                var ramp = rel_pct > 0 ? this.err_ramp_over : this.err_ramp_under;
                for (var i = this.err_bands.length - 1; i >= 0; i--) {
                    if (mag >= this.err_bands[i]) return ramp[i];
                }
                return this.err_neutral;
            },
            cellColour: function(i, j) {
                var flow_temp_data = this.data[this.selected_model][this.active_flow_temp];
                var cop = flow_temp_data.cop[i][j];
                if (cop === null) return '#f8f9fa';
                if (this.cell_colour === 'error') {
                    var rel = flow_temp_data.sim_err && flow_temp_data.sim_err[i]
                            ? flow_temp_data.sim_err[i][j] : null;
                    if (rel === null || rel === undefined) return '#f8f9fa';
                    return this.getErrorColour(rel);
                }
                return this.getCopColor(cop);
            },
            cellErrorLabel: function(i, j) {
                var flow_temp_data = this.data[this.selected_model][this.active_flow_temp];
                var rel = flow_temp_data.sim_err && flow_temp_data.sim_err[i]
                        ? flow_temp_data.sim_err[i][j] : null;
                if (rel === null || rel === undefined) return '';
                return '(' + (rel > 0 ? '+' : '') + rel.toFixed(1) + '%)';
            },
            // Bar with 4px rounded top corners, anchored square to the baseline
            barPath: function(x, base_y, w, h, r) {
                if (h <= 0) return '';
                r = Math.min(r, w / 2, h);
                var top = base_y - h;
                return 'M' + x + ' ' + base_y +
                       'V' + (top + r) +
                       'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) +
                       'h' + (w - 2 * r) +
                       'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
                       'V' + base_y + 'Z';
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
