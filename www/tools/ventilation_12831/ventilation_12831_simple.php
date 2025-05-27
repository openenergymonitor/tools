<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<?php $title = "Template"; ?>

<div class="container mt-3" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <h3>EN12831 Ventilation Calculation</h3>
        </div>
    </div>
    <hr>

    <div class="row">
        <div class="col">
            <label class="form-label">Outside temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="outside" @change="update">
                <span class="input-group-text">°C</span>
            </div>  
        </div>
        <div class="col">
            <label class="form-label">qenv50</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="qenv50" @change="update">
                <span class="input-group-text">m<sup>3</sup>/h/m<sup>2</sup></span>
            </div>
        </div>

    </div>

    <div class="row">
        <div class="col">

        <!-- input table for rooms -->
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Room</th>
                    <th>Volume (m<sup>3</sup>)</th>
                    <th>Envelope Area (m<sup>2</sup>)</th>
                    <th>Temperature (°C)</th>
                    <td>N<sub>min</sub> (h<sup>-1</sup>)</td>
                    <th>Ventilation Heat Loss (W)</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(room, index) in rooms" :key="index">
                    <td><input type="text" class="form-control form-control-sm" v-model="room.name" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.volume" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.envelope_area" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.temperature" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.n_min" @change="update"></td>
                    <td>{{ room.ventilationHeatLoss | number(0) }} W</td>
                </tr>
            </tbody>
        </table>

        <p>Zone Ventilation Heat Loss: {{ zone.ventilationHeatLoss | number(0) }} W</p>
        </div>
    </div>
</div>

<script>
    var app = new Vue({
        el: '#app',

        data: {
            outside: -1.4,
            qenv50: 12.4, // m3/h/m2

            rooms: [
                { name: "Livingroom", volume: 56.93, envelope_area: 36.72, temperature: 21, n_min: 1.5, ventilationHeatLoss: 0 },
                { name: "Hall", volume: 15.84, envelope_area: 9.6, temperature: 18, n_min: 2.0 },
                { name: "Kitchen", volume: 17.28, envelope_area: 20.16, temperature: 18, n_min: 2.0 },
                { name: "Bed 1", volume: 23.52, envelope_area: 13.88, temperature: 18, n_min: 1.0 },
                { name: "Bed 2", volume: 20.74, envelope_area: 14.88, temperature: 18, n_min: 1.0 },
                { name: "Bed 3", volume: 9.5, envelope_area: 8.28, temperature: 18, n_min: 1.0 },
                { name: "Landing", volume: 19.01, envelope_area: 7.92, temperature: 18, n_min: 2.0 },
                { name: "Bathroom", volume: 19.01, envelope_area: 21.6, temperature: 22, n_min: 3.0 }
            ],

            zone: {
                ventilationHeatLoss: 0
            }
        },
        methods: {
            update: function () {
                this.model();
            },
            model: function() {

                // Envelope of the ventilation zone (z)
                let Aenvz = 0;
                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];
                    Aenvz += room.envelope_area;
                }
            
                // Specific air permeability of the envelope at 50pa
                let qenv50 = this.qenv50; // m3/h/m2

                // Exhaust air volume flow from the ventilation zone (z) (Sum of rooms, I)
                let qv_exh_z = 0; // m3/h

                // Volume flow factor
                let fqv_z = 0.05;

                // Orientation factor (default: 2, B.2.14)
                let fdir_z = 2;
                
                // Adjustment factor for the number of exposed facades
                let ffac_z = 8;

                // Formula 29 (fe,z) (page 38)
                let fe_z_part = qv_exh_z / (qenv50 * Aenvz);
                let fe_z = 1 / (1+(ffac_z/fqv_z)*Math.pow(fe_z_part,2));

                // 6.3.3.3.5 Air volume flow through additional infiltration into the zone (z) (page 37)
                let qv_inf_add_z = (qenv50*Aenvz)*fqv_z*fe_z;

                // 6.3.3.3.4 External air volume flow into the ventilation zone (z) through the building envelope (page 37)
                let qv_env_z = qv_exh_z + qv_inf_add_z;

                // Formula 20 (page 36)
                let qv_leak_z = qv_env_z;

                console.log("fe,z: " + fe_z);
                console.log("qv_inf_add_z: " + qv_inf_add_z);
                console.log("qv_env_z: " + qv_env_z);
                console.log("qv_leak_z: " + qv_leak_z);

                let totalVentilationHeatloss_zone = 0;

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];
                    console.log("Room: " + room.name);

                    // Formula 19 (page 35)
                    let qv_leak_plus_ATD_i = qv_leak_z * (room.envelope_area / Aenvz);

                    // 6.3.3.3.2 External air volume flow into the room (I) through the building envelope
                    let qv_env_i = (qv_inf_add_z/qv_env_z)*Math.min(qv_env_z,qv_leak_plus_ATD_i*fdir_z)+((qv_env_z-qv_inf_add_z)/qv_env_z)*qv_leak_plus_ATD_i

                    let qv_min_i = room.n_min * room.volume; // m3/h

                    // 6.3.3.3.1 Heated space (17)
                    let ventilationHeatloss_room = 0.33 * (
                        (Math.max(qv_env_i, qv_min_i) * (room.temperature - this.outside))
                    );

                    // 6.3.3.3.1 Zone (16)
                    let fi_z = 0.5;

                    let ventilationHeatloss_zone = 0.33 * (
                        (Math.max(qv_leak_plus_ATD_i, fi_z*qv_min_i) * (room.temperature - this.outside))
                    );

                    // Print the results
                    console.log("- qv_leak_plus_ATD_i: " + qv_leak_plus_ATD_i);
                    console.log("- qv_env_i: " + qv_env_i);
                    console.log("- heat loss room: " + ventilationHeatloss_room);
                    console.log("- heat loss zone: " + ventilationHeatloss_zone);

                    room.ventilationHeatLoss = ventilationHeatloss_room;

                    totalVentilationHeatloss_zone += ventilationHeatloss_zone;
                }

                console.log("Total Ventilation Heatloss: " + totalVentilationHeatloss_zone);
                this.zone.ventilationHeatLoss = totalVentilationHeatloss_zone;
            }
        },
        filters: {
            number: function (value, decimals) {
                if (!value) return '';
                return parseFloat(value).toFixed(decimals);
            }
        }
    });
    app.model();
</script>
