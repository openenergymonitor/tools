<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="<?php echo $path_lib;?>vaillant5.js?v=1"></script>

<?php $title = "Vaillant COP model"; ?>

<div class="container mt-3" style="max-width:1000px" id="app">
    <div class="row">
        <div class="col">
            <h3>Vaillant COP model</h3>
        </div>
    </div>
    <hr>
    <div class="row">
        <div class="col">
            <label class="form-label">Flow temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="flow_temperature" @change="update">
                <span class="input-group-text">°C</span>
            </div>  
        </div>
    </div>
    <hr>
    <div class="row">
        <div class="col">
            <h4>5kW 35C</h4>
            <table class="table table-bordered table-sm text-center">
                <thead>
                    <tr>
                        <th>Ambient °C</th>
                        <th v-for="speed in data['5kW'].speed">{{ speed }} rps</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(ambient_temp, amb_index) in data['5kW'].ambient">
                        <td><b>{{ ambient_temp }}</b></td>
                        <td v-for="(speed, speed_index) in data['5kW'].speed" :style="{backgroundColor: getCopColor(data['5kW']['35C'].cop[amb_index][speed_index])}">
                            <div v-if="data['5kW']['35C'].cop[amb_index][speed_index] !== null">
                                <b>{{ data['5kW']['35C'].cop[amb_index][speed_index] }}</b> 
                                <small>({{ data['5kW']['35C'].sim_cop[amb_index][speed_index] }})</small><br>
                                <small>{{ data['5kW']['35C'].output[amb_index][speed_index] }} kW</small>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>

<script>
    var app = new Vue({
        el: '#app',
        data: {
            flow_temperature: 35,
            data: vaillant_data
        },
        methods: {
            update: function () {
                this.model();
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

                                        let speed = model_data.speed[j];
                                        let condensing_offset = 4 * (speed / 120);
                                        let evaporating_offset = -10 * (speed / 120);

                                        var T_condensing = T_flow + condensing_offset;
                                        var T_evaporating = T_ambient + evaporating_offset;

                                        var carnot_cop = (T_condensing + 273.15) / (T_condensing - T_evaporating);
                                        var practical_cop = carnot_cop * 0.52;

                                        this.$set(flow_temp_data.sim_cop[i], j, practical_cop.toFixed(1));
                                    } else {
                                        this.$set(flow_temp_data.sim_cop[i], j, null);
                                    }
                                }
                            }
                        }
                    }
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
