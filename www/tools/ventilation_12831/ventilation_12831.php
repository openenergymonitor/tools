<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<?php $title = "Template"; ?>

<div class="container mt-3" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <h3>EN12831 Ventilation Calculation</h3>
            <p>See source code for a reference implementation of the EN12831 ventilation calculation. Example given below has also been validated to give the same result as the MCS heat load calculator (without extract ventilation).</p>

            <p><i>Note: Party walls to neighboring properties are not included in the example external envelope areas below.</i></p>

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
            <label class="form-label">Air permeability test result</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="qenv50" @change="update">
                <span class="input-group-text">m<sup>3</sup>/h/m<sup>2</sup> @ 50 Pa</span>
            </div>
        </div>
    </div>
    <div class="row">
        <div class="col">
            <label class="form-label">Volume flow ratio (Table B.8)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="fqv_z" @change="update">
            </div>
        </div>
        <div class="col">
            <label class="form-label">Number of exposed facades</label>
            <div class="input-group mb-3">
                <select class="form-select" v-model.number="ffac_z" @change="update">
                    <option value="12">1</option>
                    <option value="8">> 1</option>
                </select>
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
                    <th>External<br>Envelope<br>Area (m<sup>2</sup>)</th>
                    <th>Room Temperatures (°C)</th>
                    <th>Minimum air change rates<br>N<sub>min</sub> (h<sup>-1</sup>)</th>
                    <th>Exhaust air m3/hr</th>
                    <th>Ventilation<br>Heat Loss *Room*</th>
                    <th>Ventilation<br>Heat Loss *Zone*</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(room, index) in rooms" :key="index">
                    <td><input type="text" class="form-control form-control-sm" v-model="room.name" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.volume" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.envelope_area" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.temperature" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.n_min" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.qv_exh_i" @change="update"></td>
                    <td>{{ room.ventilationHeatLoss | number(0) }} W</td>
                    <td>{{ room.ventilationHeatLoss_zone | number(0) }} W</td>
                </tr>

                <tr style="background-color: #f8f9fa;">
                    <td>Total</td>
                    <td>{{ rooms.reduce((sum, room) => sum + room.volume, 0) | number(1) }} m<sup>3</sup></td>
                    <td>{{ rooms.reduce((sum, room) => sum + room.envelope_area, 0) | number(1) }} m<sup>2</sup></td>
                    <td></td>
                    <td></td>
                    <td>{{ zone.qv_exh_z | number(0) }} m<sup>3</sup>/h</td>
                    <td>{{ rooms.reduce((sum, room) => sum + room.ventilationHeatLoss, 0) | number(0) }} W</td>
                    <td>{{ zone.ventilationHeatLoss | number(0) }} W*</td>
                </tr>
            </tbody>
        </table>

        <p>*Note: Note that EN 12831-1:2017 calculates a different heat loss for rooms individually as compared to the zone as a whole. Rooms facing the wind will have cold air pushed into them. This air would then move, pre-warmed, to adjoining rooms on the other side of the building, resulting in higher heating requirements for wind-facing rooms than those on the leeward side. The latter halving reflects an averaging out of these effects across the entire building.</p>

        </div>
    </div>
</div>

<script>
    var app = new Vue({
        el: '#app',

        data: {
            outside: -4.5,
            qenv50: 12.4, // m3/h/m2
            fqv_z: 0.05, // Table B.8
            ffac_z: 8, // > 1 exposed facades

            rooms: [
                { name: "Livingroom", volume: 56.93, envelope_area: 36.72, temperature: 21, n_min: 1.5, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0, ventilationHeatLoss: 0, ventilationHeatLoss_zone: 0 },
                { name: "Hall", volume: 15.84, envelope_area: 9.6, temperature: 18, n_min: 2.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 },
                { name: "Kitchen", volume: 17.28, envelope_area: 20.16, temperature: 18, n_min: 2.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 },
                { name: "Bed 1", volume: 23.52, envelope_area: 13.88, temperature: 18, n_min: 1.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 },
                { name: "Bed 2", volume: 20.74, envelope_area: 14.88, temperature: 18, n_min: 1.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 },
                { name: "Bed 3", volume: 9.5, envelope_area: 8.28, temperature: 18, n_min: 1.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 },
                { name: "Landing", volume: 19.01, envelope_area: 7.92, temperature: 18, n_min: 2.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 },
                { name: "Bathroom", volume: 19.01, envelope_area: 21.6, temperature: 22, n_min: 3.0, qv_exh_i: 0, qv_comb_i:0, qv_sup_i:0 }
            ],

            zone: {
                ventilationHeatLoss: 0,
                qv_exh_z: 0,
                qv_comb_z: 0,
                qv_sup_z: 0
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

                // Combustion air volume flow from the ventilation zone (z) (Sum of rooms, I)
                let qv_comb_z = 0; // m3/h

                // Supply air volume flow from the ventilation zone (z) (Sum of rooms, I)
                let qv_sup_z = 0; // m3/h

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];
                    //  
                    room.qv_exh_i = 1 * room.qv_exh_i;
                    room.qv_comb_i = 1 * room.qv_comb_i;
                    room.qv_sup_i = 1 * room.qv_sup_i;
                    
                    // Formula 25
                    qv_exh_z += room.qv_exh_i;      // m3/h
                    // Formula 26
                    qv_comb_z += room.qv_comb_i;    // m3/h
                    // Formula 27
                    qv_sup_z += room.qv_sup_i;      // m3/h
                    
                }
                this.zone.qv_exh_z = qv_exh_z;      // Update zone exhaust air volume flow
                this.zone.qv_comb_z = qv_comb_z;    // Update zone combustion air volume flow
                this.zone.qv_sup_z = qv_sup_z;      // Update zone supply air volume flow

                // Air volume flow into the ventilation zone (z) through ATDs at a pressure difference of 50 Pa in accordance with Formula (29)
                let qv_ATD_50_z = 0; // m3/h

                // Design air volume flow of the ATDs in the ventilation zone (z)
                let qv_ATD_design_z = 0;

                // External air volume flow into the zone (z) through ATDs in accordance with Formula (21)
                let qv_ATD_z = 0;

                // ATD authority of the ATDs in zone (z) in accordance with Formula (22)
                let a_ATD_z = qv_ATD_50_z / (qv_ATD_50_z + (qenv50 * Aenvz));

                // Volume flow factor
                let fqv_z = this.fqv_z;

                // Orientation factor (default: 2, B.2.14)
                let fdir_z = 2;
                
                // Adjustment factor for the number of exposed facades
                let ffac_z = this.ffac_z;

                // Formula 29 (fe,z) (page 38)
                // Adjustment factor taking into account the additional pressure difference due to unbalanced ventilation in accordance with Formula 29
                let fe_z_part = (qv_exh_z + qv_comb_z - qv_sup_z) / ((qenv50 * Aenvz) + qv_ATD_50_z);
                let fe_z = 1 / (1+(ffac_z/fqv_z)*Math.pow(fe_z_part,2));

                // 6.3.3.3.5 Air volume flow through additional infiltration into the zone (z) (page 37)
                let qv_inf_add_z = ((qenv50*Aenvz)+qv_ATD_50_z)*fqv_z*fe_z;

                // 6.3.3.3.4 External air volume flow into the ventilation zone (z) through the building envelope (page 37)
                let qv_env_z = Math.max(qv_exh_z + qv_comb_z - qv_sup_z, 0) + qv_inf_add_z;

                // Formula 20 (page 36)
                let qv_leak_z = (1 - a_ATD_z) * qv_env_z;

                console.log("fe,z: " + fe_z);
                console.log("qv_inf_add_z: " + qv_inf_add_z);
                console.log("qv_env_z: " + qv_env_z);
                console.log("qv_leak_z: " + qv_leak_z);

                let totalVentilationHeatloss_zone = 0;

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];
                    console.log("Room: " + room.name);

                    // Design air volume flow of the ATDs in the ventilation room (I)
                    let qv_ATD_design_i = 0;
                    let plus_ATD = (qv_ATD_design_z > 0 ? (qv_ATD_z * (qv_ATD_design_i / qv_ATD_design_z)) : 0);

                    // Formula 19 (page 35)
                    // external air volume flow into the room (i) through leakages and ATDs in accordance with 6.3.3.3.2
                    let qv_leak_plus_ATD_i = (qv_leak_z * (room.envelope_area / Aenvz)) + plus_ATD;

                    // 6.3.3.3.2 External air volume flow into the room (I) through the building envelope
                    let qv_env_i = (qv_inf_add_z/qv_env_z)*Math.min(qv_env_z,qv_leak_plus_ATD_i*fdir_z)+((qv_env_z-qv_inf_add_z)/qv_env_z)*qv_leak_plus_ATD_i


                    let qv_min_i = room.n_min * room.volume; // m3/h

                    // 6.3.3.3.1 Heated space (17)
                    let qv_exh_i = room.qv_exh_i; // m3/h
                    let qv_comb_i = room.qv_comb_i; // m3/h
                    let qv_sup_i = room.qv_sup_i; // m3/h

                    let qv_open_i = 0;      // m3/h (not used in this example)
                    let qv_transfer_ij = 0; // m3/h (not used in this example)
                    let O_rec_z = 0;        // °C 
                    let O_transfer_ij = 0;  // °C

                    // 6.3.3.3.3 Technical air volume flow into the room (i)
                    let qv_techn_i = Math.max(qv_sup_i + qv_transfer_ij, qv_exh_i + qv_comb_i);

                    let ventilationHeatloss_room = 0.33 * (
                        (Math.max(qv_env_i + qv_open_i, qv_min_i - qv_techn_i) * (room.temperature - this.outside)) +
                        (qv_sup_i * (room.temperature - O_rec_z)) +
                        (qv_transfer_ij * (room.temperature - O_rec_z))
                    );

                    // 6.3.3.3.1 Zone (16)
                    // ratio between the minimum air volume flows of single rooms (i) that are part of the considered zone (z) and the resulting air volume flow of the zone (z)
                    // 1 room = 1
                    // >1 rooms = 0.5
                    let fi_z = 0.5;

                    let ventilationHeatloss_zone = 0.33 * (
                        (Math.max(qv_leak_plus_ATD_i + qv_open_i, (fi_z*qv_min_i) - qv_techn_i) * (room.temperature - this.outside)) +
                        (qv_sup_i * (room.temperature - O_rec_z)) +
                        (qv_transfer_ij * (room.temperature - O_rec_z))
                    );

                    // Print the results
                    console.log("- qv_leak_plus_ATD_i: " + qv_leak_plus_ATD_i);
                    console.log("- qv_env_i: " + qv_env_i);
                    console.log("- heat loss room: " + ventilationHeatloss_room);
                    console.log("- heat loss zone: " + ventilationHeatloss_zone);

                    room.ventilationHeatLoss = ventilationHeatloss_room;
                    room.ventilationHeatLoss_zone = ventilationHeatloss_zone;
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
