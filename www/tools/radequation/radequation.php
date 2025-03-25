<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<?php $title = "Radiator equation"; ?>

<div class="container mt-3" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <h3>Radiator equation</h3>
        </div>
    </div>
    <hr>
    <p><b>1. Calculate heat output from a radiator system at a given flow temperature and DT:</b></p>
    <div class="row">
        <div class="col">
            <label class="form-label">Radiator rated heat output</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="rated_heat_output" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Radiator rated DT</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="rated_DT" @change="update">
                <span class="input-group-text">°K</span>
            </div>
        </div>
    </div>
    <div class="row">
        <div class="col">
            <label class="form-label">Flow temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="flow_temperature" @change="update">
                <span class="input-group-text">°C</span>
            </div>  
        </div>
        <div class="col">
            <label class="form-label">System DT</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="DT" @change="update">
                <span class="input-group-text">°K</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Room temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="room_temperature" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>
    <div class="row">
        <div class="col">
            <label class="form-label">Heat output</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="heat_output | toFixed(2)" disabled>
                <span class="input-group-text">kW</span>
            </div>
        </div>
    </div>
    <hr>
    <p><b>2. Calculate the rated DT50 capacity of a radiator system from the heat output at a different flow temperature and system DT:</b></p>
    <div class="row">
        <div class="col">
            <label class="form-label">Heat output</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="heat_output2" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Flow temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="flow_temperature2" @change="update">
                <span class="input-group-text">°C</span>
            </div>  
        </div>
        <div class="col">
            <label class="form-label">System DT</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="DT2" @change="update">
                <span class="input-group-text">°K</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Room temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="room_temperature2" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Radiator rated heat output</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="rated_heat_output2 | toFixed(1)" disabled>
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Radiator rated DT</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="rated_DT2" @change="update">
                <span class="input-group-text">°K</span>
            </div>
        </div>
    </div>

</div>

<script>
    var app = new Vue({
        el: '#app',
        data: {
            flow_temperature: 45,
            DT: 5,
            room_temperature: 20,
            rated_heat_output: 15,
            rated_DT: 50,
            heat_output: 0,

            flow_temperature2: 40,
            DT2: 5,
            room_temperature2: 20,
            heat_output2: 3.3,
            rated_heat_output2: 0,
            rated_DT2: 50
        },
        methods: {
            update: function () {
                this.model();
            },
            model: function() {
                var MWT = this.flow_temperature - (this.DT / 2);
                var radiator_DT = MWT - this.room_temperature;
                this.heat_output = this.rated_heat_output * Math.pow((radiator_DT / this.rated_DT), 1.3);

                var MWT2 = this.flow_temperature2 - (this.DT2 / 2);
                var radiator_DT2 = MWT2 - this.room_temperature2;
                this.rated_heat_output2 = this.heat_output2 / Math.pow((radiator_DT2 / this.rated_DT2), 1.3);
            }
        },
        filters: {
            toFixed: function (val, dp) {
                if (isNaN(val)) {
                    return val;
                } else {
                    return val.toFixed(dp)
                }
            }
        }
    });
    app.model();
</script>
