<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<div class="container" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <br>
            <h3>LCOE Calculator</h3>
            <p>Calculate levelised cost of energy.</p>
        </div>
    </div>
    <hr>

    <div class="row">
        <div class="col">
            <label class="form-label">Capex</label>
            <div class="input-group mb-3">
                <span class="input-group-text">£</span>
                <input type="text" class="form-control" v-model.number="capex" @change="update">
            </div>
        </div>
        <div class="col">
            <label class="form-label">Opex</label>
            <div class="input-group mb-3">
                <span class="input-group-text">£</span>
                <input type="text" class="form-control" v-model.number="opex" @change="update">
            </div>
        </div>
        <div class="col">
            <label class="form-label">Fuel cost</label>
            <div class="input-group mb-3">
                <span class="input-group-text">£/MWh</span>
                <input type="text" class="form-control" v-model.number="fuel" @change="update">
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Fuel efficiency</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="fuel_efficiency" @change="update">
                <span class="input-group-text">%</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Capacity factor</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="capacity_factor" @change="update">
                <span class="input-group-text">%</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Months to build</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="months_to_build" @change="update">
                <span class="input-group-text">months</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Lifespan</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="lifespan" @change="update">
                <span class="input-group-text">years</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Interest rate</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="interest_rate" @change="update">
                <span class="input-group-text">%</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-6">
            <label class="form-label">LCOE</label>
            <div class="input-group mb-3">
                <span class="input-group-text">£/MWh</span>
                <input type="text" class="form-control" :value="lcoe | toFixed(2)" disabled>
            </div>
        </div>
    </div>
</div>
<script src="<?php echo $path; ?>lcoe.js?v=3"></script>
