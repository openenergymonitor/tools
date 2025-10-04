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
</div>

<script>
    var app = new Vue({
        el: '#app',
        data: {

        },
        methods: {
            update: function () {
                this.model();
            },
            model: function() {

            }
        }
    });
    app.model();
</script>
