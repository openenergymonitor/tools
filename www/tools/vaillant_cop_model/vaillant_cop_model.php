<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="<?php echo $path_lib;?>vaillant5.js?v=1"></script>

<?php $title = "Vaillant COP model"; ?>

<div class="container mt-3" style="max-width:800px" id="app">
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
                                <br>
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
