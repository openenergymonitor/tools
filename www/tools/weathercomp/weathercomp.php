<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>

<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>

<script src="<?php echo $path_lib; ?>ecodan.js?v=1"></script>
<script src="<?php echo $path_lib; ?>feed.js?v=1"></script>

<div class="container" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <br>
            <h3>Weather Compensation</h3>
            <p>Calculate optimum weather compensation settings for a heat pump</p>
        </div>
    </div>
    <hr>
    <div class="row">

        <div class="col">
            <label class="form-label">Rated emitter output (ΔT50)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="rated_emitter_output_dt50" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Room temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="room_temperature" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">System ΔT</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="systemDT" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Heat loss @ design conditions</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="heat_loss" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Design flow temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="design_flowT | toFixed(1)" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>

    <div class="row">

        <div class="col">
            <label class="form-label">Heat pump capacity</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="heat_pump_capacity" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Minimum modulation</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minimum_modulation" @change="update">
                <span class="input-group-text">%</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Minimum flow temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="minimum_flowT | toFixed(1)" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Outside temperature cutoff</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="outsideT_cutoff | toFixed(1)" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>


    </div>

    <div class="row">
        <div class="col">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" v-model="limit_curve" @change="update">
                <label class="form-check-label">Limit curve flow temperatures</label>
            </div>
        </div>
        <div class="col">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" v-model="show_curve_to_zero" @change="update">
                <label class="form-check-label">Show full curve range to room temperature</label>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <div id="graph" style="width:100%;height:350px;"></div>
        </div>
    </div>

</div>
<script src="<?php echo $path; ?>weathercomp.js?v=3"></script>
