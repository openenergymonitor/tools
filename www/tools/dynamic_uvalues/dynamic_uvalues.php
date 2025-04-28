
<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>


<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/fontawesome.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/solid.min.css">
<script src="<?php echo $path_lib; ?>vis.helper.js?v=2"></script>

<div class="container" style="max-width:1200px" id="app">
    <div class="row">
        <div class="col">
            <br>
            <h3>Dynamic U-values</h3>
            
            <div class="btn-group" role="group" style="width: 250px; float:right">
                <button type="button" class="btn btn-outline-secondary" @click="zoom_in">+</button>
                <button type="button" class="btn btn-outline-secondary" @click="zoom_out">-</button>
                <button type="button" class="btn btn-outline-secondary" @click="pan_left"><</button>
                <button type="button" class="btn btn-outline-secondary" @click="pan_right">></button>
                <button type="button" class="btn btn-outline-secondary" @click="reset">RESET</button>
            </div>

            <p>Explore time-varying heat transfer through walls with thermal mass.</p>
        </div>
    </div>
    <div class="row">
        <div id="graph_bound" style="width:100%; height:400px; position:relative;">
            <div id="graph" style="width:100%; height:100%;"></div>
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255, 255, 255, 0.8); display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:bold; color:#333;" v-if="processing">
                Days processed: {{ days_processed }}
            </div>
        </div>
    </div>

    <!--
    <div class="row">
        <div id="graph_bound2" style="width:100%; height:400px; position:relative; ">
            <div id="graph2"></div>
        </div>
    </div>
    -->

    <br><br>

    <div class="row">
        <div class="col-lg-6 col-sm-12">
            <div class="card">
                <div class="card-body">
                    <h4>Wall properties</h4>

                    <!-- add entry for heat loss -->
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Thermal conductivity</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model="wall.thermal_conductivity" @change="simulate" />
                                <span class="input-group-text">W/m.K</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Thermal capacity</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model="wall.thermal_capacity" @change="simulate" />
                                <span class="input-group-text">kJ/K.m3</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Thickness</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model="wall.thickness" @change="simulate" />
                                <span class="input-group-text">m</span>
                            </div>
                        </div>     
                    </div>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Internal surface</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model="wall.u_int_surface" @change="simulate" />
                                <span class="input-group-text">W/K.m2</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">External surface</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model="wall.u_ext_surface" @change="simulate" />
                                <span class="input-group-text">W/K.m2</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">U-value</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="wall.uvalue | toFixed(2)" @change="simulate" disabled />
                                <span class="input-group-text">W/K.m2</span>
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Number of layers</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" v-model="wall.num_layers" @change="simulate" />
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col">
                            <label class="form-label">Steady-state kWh</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="steady_state_heat_kWh | toFixed(2)" disabled />
                                <span class="input-group-text">kWh</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Dynamic wall kWh</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="dynamic_heat_kWh | toFixed(2)" disabled />
                                <span class="input-group-text">kWh</span>
                            </div>
                        </div>                    
                    </div>

                    <div class="row">
                        <div class="col">
                            <label class="form-label">Max dynamic heat</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="max_dynamic_heat | toFixed(1)" disabled />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Max steady-state heat</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="max_steady_state_heat | toFixed(1)" disabled />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Peak reduction</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="peak_reduction_max*100 | toFixed(0)" disabled />
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                    </div>                    

                    <div class="row">
                        <div class="col-8">
                            <label class="form-label">Dynamic heat @ max steady-state heat</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="dynamic_at_max_steady_state_heat | toFixed(1)" disabled />
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <div class="col">
                            <label class="form-label">Peak reduction</label>
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" :value="peak_reduction_at_max_steady_state_heat*100 | toFixed(0)" disabled />
                                <span class="input-group-text">%</span>
                            </div>
                        </div>
                    </div>    

                </div>
            </div>
        </div>
        <div class="col">

            <h3>Description</h3>

            <p>In standard steady-state heat loss calculations, heat transfer through a wall is assumed to be instant. Changes in temperature on one side of the wall immediately affects the other side, essentially ignoring the wall's ability to store and release heat over time.</p>

            <p>However, real walls, especially solid stone ones, have <b>thermal mass</b>. This means they can <b>absorb, store, and slowly release heat</b>, which introduces a <b>time lag</b> between the temperature changes outside and the effect felt inside.</p>

            <p>This simulation uses a simplified <b>R-C (resistance-capacitance) model</b> to capture this dynamic behavior. It shows how the effective U-value varies over time, depending on the outside temperature and the wall's thermal properties.</p>

        </div>
    </div>
</div>
<script src="<?php echo $path; ?>dynamic_uvalues.js?v=19"></script>
