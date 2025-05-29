<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<?php $title = "EN12831 Ventilation Calculation"; ?>

<div class="container mt-3" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <h3>EN12831 Ventilation Calculation (No ATDs etc)</h3>
            <p>This is a minimal version of the standard calculation in order to evaluate when the simplified method can be used. It does not include any ATDs or other factors. Notice how the minimum air change rates are used as you reduce the air permeability value below around 4 m3/h.m2.</p>
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
            <label class="form-label">Air permeability test result (or copy from above)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="qenv50" @change="update">
                <span class="input-group-text">m<sup>3</sup>/h.m<sup>2</sup> @ 50 Pa</span>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Air changes @ 50 Pa</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="n50 | number(2)" disabled>
                <span class="input-group-text">ACH @ 50 Pa</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Air changes (Divide by 20)</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="ACH | number(2)" disabled>
                <span class="input-group-text">ACH</span>
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
                    <th>Room Temp (°C)</th>
                    <th>Minimum air change rates<br>N<sub>min</sub> (h<sup>-1</sup>)</th>
                    <th style="width:130px">Ventilation<br>Heat Loss *Room*</th>
                    <th style="width:130px">Ventilation<br>Heat Loss *Zone*</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(room, index) in rooms" :key="index">
                    <td><input type="text" class="form-control form-control-sm" v-model="room.name" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.volume" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.envelope_area" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.temperature" @change="update"></td>
                    <td><input type="number" class="form-control form-control-sm" v-model="room.n_min" @change="update"></td>
                    <td>
                        {{ room.ventilationHeatLoss | number(0) }} W 
                        <span v-if="!room.used_min_room" style="color:#333; font-size:12px; font-weight:bold">
                            ({{room.effective_ach_room | number(2)}})
                        </span>
                        <span v-if="room.used_min_room" style="color:#888; font-size:12px">
                            ({{room.effective_ach_room | number(2)}})
                        </span>
                    </td>
                    <td>
                        {{ room.ventilationHeatLoss_zone | number(0) }} W
                        <span v-if="!room.used_min_zone" style="color:#333; font-size:12px; font-weight:bold">
                            ({{room.effective_ach_zone | number(2)}})
                        </span>
                        <span v-if="room.used_min_zone" style="color:#888; font-size:12px">
                            ({{room.effective_ach_zone | number(2)}})
                        </span>

                    </tr>

                <tr style="background-color: #f8f9fa;">
                    <td>Total</td>
                    <td>{{ zone.volume | number(1) }} m<sup>3</sup></td>
                    <td>{{ zone.envelope_area | number(1) }} m<sup>2</sup></td>
                    <td></td>
                    <td></td>
                    <td>{{ zone.ventilationHeatLoss_sum_rooms | number(0) }} W <span style="color:#666; font-size:12px">({{zone.effective_ach_rooms | number(2)}})</span></td>
                    <td>{{ zone.ventilationHeatLoss | number(0) }} W <span style="color:#666; font-size:12px">({{zone.effective_ach_zone | number(2)}})</span></td>
                </tr>
            </tbody>
        </table>

        <p><b>Minimum air change rates:</b> The MCS heat load calculator, is in the absence of an updated national annex, using the minimum air change rates from CIBSE DHDG Table 3.8. These are different from the default values provided in the EN 12831-1:2017 standard in Table B.7 of 0.5 ACH for all rooms apart from secondary/internal rooms which should be 0.0 ACH. It could be argued that the default values from the EN 12831 standard are better suited to be used here.</p>

        <p><b>External envelope areas:</b> The example calculation given here is a mid-terrace house, the external envelope areas do not include the party wall areas with the neighboring properties. This is consistent with how party walls are treated in the MCS heat load calculator and EN 12831 definition 6.3.3.6 but is inconsistent with the CIBSE TM23 and ISO 9972 definition of envelope area. How this is treated may change in future.</p>

        <p><b>Building vs room heat loss</b>: Note that EN 12831-1:2017 calculates a different heat loss for rooms individually as compared to the zone as a whole. Rooms facing the wind will have cold air pushed into them. This air would then move, pre-warmed, to adjoining rooms on the other side of the building, resulting in higher heating requirements for wind-facing rooms than those on the leeward side. The latter halving reflects an averaging out of these effects across the entire building.</p>

        </div>
    </div>
</div>

<script>
    var app = new Vue({
        el: '#app',

        data: {

            qenv50: 12.4, // m3/h/m2
            n50: 0, // Air change rate at 50 Pa in h-1

            outside: -4.5,
            fqv_z: 0.05, // Table B.8

            rooms: [
                { name: "Livingroom", volume: 56.93, envelope_area: 36.72, temperature: 21, n_min: 0.5, ventilationHeatLoss: 0, ventilationHeatLoss_zone: 0, effective_ach_room:0, effective_ach_zone:0, used_min_room: false, used_min_zone: false },
                { name: "Hall", volume: 15.84, envelope_area: 9.6, temperature: 18, n_min: 0.0 },
                { name: "Kitchen", volume: 17.28, envelope_area: 20.16, temperature: 18, n_min: 0.5  },
                { name: "Bed 1", volume: 23.52, envelope_area: 13.88, temperature: 18, n_min: 0.5  },
                { name: "Bed 2", volume: 20.74, envelope_area: 14.88, temperature: 18, n_min: 0.5  },
                { name: "Bed 3", volume: 9.5, envelope_area: 8.28, temperature: 18, n_min: 0.5  },
                { name: "Landing", volume: 19.01, envelope_area: 7.92, temperature: 18, n_min: 0  },
                { name: "Bathroom", volume: 19.01, envelope_area: 21.6, temperature: 22, n_min: 0.5  }
            ],

            zone: {
                volume: 0,          // Total volume of the zone (sum of room volumes)
                envelope_area: 0,   // Total envelope area of the zone (sum of room envelope areas)
                ventilationHeatLoss: 0,
                ventilationHeatLoss_sum_rooms:  0,
                effective_ach_rooms: 0,
                effective_ach_zone: 0
            }
        },
        methods: {
            update: function () {
                this.model();
            },

            calculate_air_permeability: function() {
                // ------------------------------------------------------------------------------------
                // This calculator is not in EN12831-1:2017 but is used in the MCS heat load calculator
                // Calculate air permeability from minimum ventilation rates table 1.7 CIBSE DHDG

                // Table 1.7 Whole-building ventilation rates
                // Number of bedrooms        1, 2, 3, 4, 5
                let min_ventilation_rates = [13, 17 ,21, 25, 29]; // l/s
                let min_ventilation_rate_ls_beds = min_ventilation_rates[this.number_of_bedrooms - 1]; // l/s

                // Note: In addition, the minimum ventilation rate would not be less than 0.3 l/s per m2 of internal floor area (this includes each floor).
                let min_ventilation_rate_ls_alt = this.TFA * 0.3; // l/s

                let min_ventilation_rate_ls = Math.max(min_ventilation_rate_ls_beds, min_ventilation_rate_ls_alt); // l/s

                // Convert to an air change rate
                let ach = (min_ventilation_rate_ls * 3.6) / this.zone.volume; // Convert to h-1

                // Convert to an air change rate at 50 Pa
                let n50 = ach * 20;

                // Calculate the air permeability at 50 Pa
                let p50 = n50 * this.zone.volume / this.zone.envelope_area; // m3/h/m2

                this.estimated_qenv50 = p50; // m3/h/m2 @ 50 Pa
                this.estimated_ach = ach; // h-1
            },

            model: function() {

                this.zone.volume = 0;
                this.zone.envelope_area = 0;
                
                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];

                    room.volume = parseFloat(room.volume) || 0; // Ensure volume is a number
                    room.envelope_area = parseFloat(room.envelope_area) || 0; // Ensure envelope area is a number
                    room.temperature = parseFloat(room.temperature) || 18; // Default temperature to 18 if not set
                    room.n_min = parseFloat(room.n_min) || 0;

                    this.zone.volume += room.volume; // Sum of all room volumes
                    this.zone.envelope_area += room.envelope_area; // Sum of all room envelope areas
                    room.ventilationHeatLoss = 0; // Reset heat loss for each room
                    room.ventilationHeatLoss_zone = 0; // Reset zone heat loss for each room
                    room.used_min_room = false; // Reset used minimum room value
                    room.used_min_zone = false; // Reset used minimum zone value

                }

                this.n50 = (this.qenv50 * this.zone.envelope_area) / this.zone.volume; // Air change rate at 50 Pa in h-1
                this.ACH = this.n50 / 20; // Air change rate in h-1

                // ------------------------------------------------------------------------------------
                // EN12831-1:2017 calculation section

                // Envelope of the ventilation zone (z)
                let Aenvz = this.zone.envelope_area;

                // Orientation factor (default: 2, B.2.14)
                let fdir_z = 2;

                // 6.3.3.3.5 Air volume flow through additional infiltration into the zone (z) (page 37)
                let qv_inf_add_z = (this.qenv50*Aenvz)*this.fqv_z;

                // 6.3.3.3.4 External air volume flow into the ventilation zone (z) through the building envelope (page 37)
                let qv_env_z = qv_inf_add_z;

                // Formula 20 (page 36)
                let qv_leak_z = qv_env_z;


                let totalVentilationHeatloss_zone = 0;

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];
                    console.log("Room: " + room.name);

                    // Formula 19 (page 35)
                    // external air volume flow into the room (i) through leakages and ATDs in accordance with 6.3.3.3.2
                    // Calculate leak rate
                    let qv_leak_i = qv_leak_z * (room.envelope_area / Aenvz)

                    // 6.3.3.3.2 External air volume flow into the room (I) through the building envelope
                    // Double leakage or whole zone which ever is smaller
                    let qv_env_i = Math.min(qv_env_z,qv_leak_i*fdir_z)

                    let qv_min_i = room.n_min * room.volume; // m3/h

                    // 6.3.3.3.1 Heated space (17)
                    let ventilationHeatloss_room = 0.33 * Math.max(qv_env_i, qv_min_i) * (room.temperature - this.outside);
                    if (qv_env_i>qv_min_i) {
                        console.log("  - using qv_env_i = "+qv_env_i+" for room HL");
                        room.used_min_room = false; // Mark that this room did not use the minimum room value
                    } else {
                        console.log("  - using qv_min_i = "+qv_min_i+" for room HL");
                        room.used_min_room = true; // Mark that this room used the minimum room value
                    }

                    // 6.3.3.3.1 Zone (16)
                    // ratio between the minimum air volume flows of single rooms (i) that are part of the considered zone (z) and the resulting air volume flow of the zone (z)
                    // 1 room = 1
                    // >1 rooms = 0.5
                    let fi_z = 0.5;

                    let ventilationHeatloss_zone = 0.33 * Math.max(qv_leak_i, fi_z*qv_min_i) * (room.temperature - this.outside);
                    if (qv_leak_i>fi_z*qv_min_i) {
                        console.log("  - using qv_leak_i = "+qv_leak_i+" for zone HL");
                        room.used_min_zone = false; // Mark that this room did not use the minimum zone value
                    } else {
                        console.log("  - using fi_z*qv_min_i = "+fi_z*qv_min_i+" for zone HL");
                        room.used_min_zone = true; // Mark that this room used the minimum zone value
                    }

                   
                    room.ventilationHeatLoss = ventilationHeatloss_room;
                    room.ventilationHeatLoss_zone = ventilationHeatloss_zone;
                    totalVentilationHeatloss_zone += ventilationHeatloss_zone;

                    // Calculate effective air change rates
                    // This is not part of the standard, just a helper for ease of reference
                    room.effective_ach_room = (ventilationHeatloss_room / (0.33 * (room.temperature - this.outside))) / room.volume;
                    room.effective_ach_zone = (ventilationHeatloss_zone / (0.33 * (room.temperature - this.outside))) / room.volume;
                    room.effective_qv_room = room.volume * room.effective_ach_room; // m3/h
                    room.effective_qv_zone = room.volume * room.effective_ach_zone; // m3/h
                }

                console.log("Total Ventilation Heatloss: " + totalVentilationHeatloss_zone);
                this.zone.ventilationHeatLoss = totalVentilationHeatloss_zone;
                this.zone.ventilationHeatLoss_sum_rooms = this.rooms.reduce((sum, room) => sum + room.ventilationHeatLoss, 0);

                // Calculate effective air change rates
                // This is not part of the standard, just a helper for ease of reference
                let effective_qv_rooms = this.rooms.reduce((sum, room) => sum + room.effective_qv_room, 0);
                let effective_qv_zone = this.rooms.reduce((sum, room) => sum + room.effective_qv_zone, 0);
                this.zone.effective_ach_rooms = effective_qv_rooms / this.zone.volume; // h-1
                this.zone.effective_ach_zone = effective_qv_zone / this.zone.volume; // h-1
                
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
