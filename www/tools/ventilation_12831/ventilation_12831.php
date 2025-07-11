<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<?php $title = "EN12831 Ventilation Calculation"; ?>

<div class="container mt-3" style="max-width:1100px" id="app">
    <div class="row">
        <div class="col">
            <h3>EN12831 Ventilation Calculation</h3>
            <p>See source code for a reference implementation of the EN12831 ventilation calculation.</p>
        </div>
    </div>
    <hr>

    <div style="background-color:#f4f4f4; padding:10px; border-radius:5px;">
        <!-- Air permeability entry or estimation method selection -->
        <div class="row">
            <div class="col">
                <label class="form-label"><b>Air permeability entry or estimation method</b></label>
                <select class="form-select" v-model="air_permeability_calc_method" @change="update">

                    <option value="Test">Manual entry e.g from test result with envelope area entry and correction</option>
                    <option value="MCS">MCS based on minimum ventilation rates table 1.7 CIBSE DHDG</option>
                    <!--
                    <option value="SAP">SAP based air permeability estimator</option>
                    <option value="TableB6">EN 12831 Table B.6</option>
                    -->
                </select>
            </div>
        </div>

        <!-- Manual entry with envelope area entry and correction -->
        <div v-if="air_permeability_calc_method=='Test'">
            <div class="row mt-3">
                <div class="col">
                    <label class="form-label">Air permeability test result</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" v-model.number="air_permeability_test_result" @change="update">
                        <span class="input-group-text">m<sup>3</sup>/h.m<sup>2</sup> @ 50 Pa</span>
                    </div>
                </div>
                <div class="col">
                    <label class="form-label">Envelope area from test</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" v-model.number="air_permeability_test_envelope_area" @change="update">
                        <span class="input-group-text">m<sup>2</sup></span>
                    </div>
                </div>
                <div class="col">
                    <label class="form-label">Envelope area from assessment</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" :value="zone.envelope_area | number(0)" disabled>
                        <span class="input-group-text">m<sup>2</sup></span>
                    </div>
                </div>                


                <div class="col">
                    <label class="form-label">Envelope area correction</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" :value="air_permeability_test_corrected | number(1)" disabled>
                        <span class="input-group-text">m<sup>3</sup>/h.m<sup>2</sup> @ 50 Pa</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- MCS based on minimum ventilation rates table 1.7 CIBSE DHDG -->
        <div v-if="air_permeability_calc_method=='MCS'">
            <div class="row mt-3">
                <div class="col">
                    <label class="form-label">Number of bedrooms</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" v-model.number="number_of_bedrooms" @change="update">
                    </div>
                </div>
                <div class="col">
                    <label class="form-label">Total floor area</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" v-model.number="TFA" @change="update">
                        <span class="input-group-text">m<sup>2</sup></span>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col">
                    <label class="form-label">Air permeability</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" :value="estimated_qenv50 | number(2)" disabled>
                        <span class="input-group-text">m<sup>3</sup>/h.m<sup>2</sup> @ 50 Pa</span>
                    </div>
                </div>

                <div class="col">
                    <label class="form-label">Air change rate</label>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" :value="estimated_ach | number(2)" disabled>
                        <span class="input-group-text">ACH</span>
                    </div>
                </div>
            </div>
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
                        <th>Room Temp (°C)</th>
                        <th>Minimum air change rates<br>N<sub>min</sub> (h<sup>-1</sup>)</th>
                        <th>Air Terminal Device (ATD)<br>m3/hr</th>
                        <th style="width:130px">Ventilation<br>Heat Loss *Room*</th>
                        <th style="width:130px">Ventilation<br>Heat Loss *Zone*</th>
                        <th v-if="show_no_limits_comparison" style="width:130px">Ventilation<br>Heat Loss *Room*<br>No
                            Min</th>
                        <th v-if="show_no_limits_comparison" style="width:130px">Ventilation<br>Heat Loss *Zone*<br>No
                            Min</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(room, index) in rooms" :key="index">
                        <td>{{ room.name }} </td>
                        <td><input type="number" class="form-control form-control-sm" v-model.number="room.volume"
                                @change="update"></td>
                        <td><input type="number" class="form-control form-control-sm"
                                v-model.number="room.envelope_area" @change="update"></td>
                        <td><input type="number" class="form-control form-control-sm" v-model.number="room.temperature"
                                @change="update"></td>
                        <td><input type="number" class="form-control form-control-sm" v-model.number="room.n_min"
                                @change="update"></td>
                        <td><input type="number" class="form-control form-control-sm"
                                v-model.number="room.qv_ATD_design_i" @change="update"></td>
                        <td>{{ room.vent_heat_loss | number(0) }} W <span style="color:#666; font-size:12px">({{
                                room.qv_room / room.volume | number(2)}})</span></td>
                        <td>{{ room.vent_heat_loss_zone | number(0) }} W <span
                                style="color:#666; font-size:12px">({{room.qv_zone / room.volume | number(2)}})</span>
                        </td>

                        <!-- Show comparison with no limits -->
                        <td v-if="show_no_limits_comparison">
                            {{ room.vent_heat_loss_nl | number(0) }} W
                            <span style="color:#888; font-size:12px">
                                ({{room.qv_room_nl / room.volume | number(2)}})
                            </span>
                        </td>
                        <td v-if="show_no_limits_comparison">
                            {{ room.vent_heat_loss_zone_nl | number(0) }} W
                            <span style="color:#888; font-size:12px">
                                ({{room.qv_zone_nl / room.volume | number(2)}})
                            </span>
                        </td>
                    </tr>

                    <tr style="background-color: #f8f9fa;" :style="{ color: last_row_color }">
                        <td>Total</td>
                        <td>{{ zone.volume | number(1) }} m<sup>3</sup></td>
                        <td>{{ zone.envelope_area | number(1) }} m<sup>2</sup></td>
                        <td></td>
                        <td></td>
                        <td>{{ zone.qv_ATD_design_z | number(0) }} m<sup>3</sup>/h</td>
                        <td>{{ zone.vent_heat_loss_rooms | number(0) }} W <span
                                style="color:#666; font-size:12px">({{zone.qv_rooms / zone.volume | number(2)}})</span>
                        </td>
                        <td>{{ zone.vent_heat_loss | number(0) }} W <span
                                style="color:#666; font-size:12px">({{zone.qv_zone / zone.volume | number(2)}})</span>
                        </td>

                        <!-- Show comparison with no limits -->
                        <td v-if="show_no_limits_comparison">{{ zone.vent_heat_loss_rooms_nl | number(0) }} W
                            <span style="color:#666; font-size:12px">({{100*(1-zone.vent_heat_loss_rooms_nl /
                                zone.vent_heat_loss_rooms) | number(2)}}%)</span>
                        </td>
                        <td v-if="show_no_limits_comparison">{{ zone.vent_heat_loss_nl | number(0) }} W
                            <span style="color:#666; font-size:12px">({{100*(1-zone.vent_heat_loss_nl /
                                zone.vent_heat_loss) | number(2)}}%)</span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="row">
                <div class="col">
                    <div class="input-group mb-3">
                        <span class="input-group-text">Use simplified natural ventilation + ATD calculation</span>
                        <span class="input-group-text"><input type="checkbox" v-model="use_simplified_model"
                                @change="update"></span>
                    </div>
                </div>
                <div class="col">
                    <div class="input-group mb-3">
                        <span class="input-group-text">Show no limits comparison</span>
                        <span class="input-group-text"><input type="checkbox" v-model="show_no_limits_comparison"
                                :disabled="!use_simplified_model" @change="update"></span>
                    </div>
                </div>
            </div>

            <p><b>Minimum air change rates:</b> The MCS heat load calculator sets the minimum air change rates to values
                found in the CIBSE DHDG Table 3.8. Carefully studying the equations in the standard suggests this is the
                wrong approach. These minimum air change rates appear designed to be used as a floor for air change
                rates in very air-tight buildings, for normal buildings the equations that derive ventilation heat loss
                from the air-permeability value produce suitable results without the need for artificially high limits.
            </p>

            <p><b>External envelope areas:</b> The example calculation given here is a mid-terrace house, the external
                envelope areas do not include the party wall areas with the neighboring properties. This is consistent
                with how party walls are treated in the MCS heat load calculator and EN 12831 definition 6.3.3.6 but is
                inconsistent with the CIBSE TM23 and ISO 9972 definition of envelope area. How this is treated may
                change in future.</p>
            <p>The blower door test for the example property above came to 8.4 m3/h.m2 @ 50 Pa, but this was calculated
                for an envelope area that included party walls (240 m2). This air-permeability rate entered above
                represents the same volume flow 8.4 m3/h.m2 x 240 m2 = 2016 m3/hr, but this is now divided by the
                smaller envelope area without the party walls of 133 m2. This results in a revised air-permeability
                value of 15.2 m3/h.m2.</p>

            <p><b>Building vs room heat loss</b>: Note that EN 12831-1:2017 calculates a different heat loss for rooms
                individually as compared to the zone as a whole. Rooms facing the wind will have cold air pushed into
                them. This air would then move, pre-warmed, to adjoining rooms on the other side of the building,
                resulting in higher heating requirements for wind-facing rooms than those on the leeward side. The
                latter halving reflects an averaging out of these effects across the entire building.</p>

        </div>
    </div>
</div>

<script>

    // Example building (mid-terrace 3 bed home)
    var rooms = [
        { name: "Livingroom", volume: 56.93, envelope_area: 36.72, temperature: 21, n_min: 0.5 },
        { name: "Hall", volume: 15.84, envelope_area: 9.6, temperature: 18, n_min: 0.5 },
        { name: "Kitchen", volume: 17.28, envelope_area: 20.16, temperature: 18, n_min: 0.5, qv_ATD_design_i: 10 },
        { name: "Bed 1", volume: 23.52, envelope_area: 13.88, temperature: 18, n_min: 0.5 },
        { name: "Bed 2", volume: 20.74, envelope_area: 14.88, temperature: 18, n_min: 0.5 },
        { name: "Bed 3", volume: 9.5, envelope_area: 8.28, temperature: 18, n_min: 0.5 },
        { name: "Landing", volume: 19.01, envelope_area: 7.92, temperature: 18, n_min: 0.0 },
        { name: "Bathroom", volume: 19.01, envelope_area: 21.6, temperature: 22, n_min: 0.5, qv_ATD_design_i: 10 }
    ];

    // Initialize room properties if not defined
    for (var i = 0; i < rooms.length; i++) {
        var room = rooms[i];
        if (room.qv_exh_i === undefined) room.qv_exh_i = 0;
        if (room.qv_comb_i === undefined) room.qv_comb_i = 0;
        if (room.qv_sup_i === undefined) room.qv_sup_i = 0;
        if (room.qv_ATD_design_i === undefined) room.qv_ATD_design_i = 0;

        room.vent_heat_loss = 0;      // Ventilation heat loss for the room
        room.vent_heat_loss_zone = 0; // Ventilation heat loss for the zone
        room.qv_room = 0;
        room.qv_zone = 0;
    }

    var app = new Vue({
        el: '#app',

        data: {
            // Options: 
            // - MCS: MCS based on minimum ventilation rates table 1.7 CIBSE DHDG
            // - Test: Manual entry with envelope area entry and correction
            // - SAP: SAP based on air permeability estimator
            // - TableB6: EN 12831 Table B.6
            air_permeability_calc_method: 'Test',

            // Method Test:
            air_permeability_test_result: 8.4,          // m3/h/m2 @ 50 Pa
            air_permeability_test_envelope_area: 240,   // m2, envelope area used for the test result

            use_simplified_model: false, // Use simplified natural ventilation + ATD calculation
            show_no_limits_comparison: false, // Show comparison with no limits
            last_row_color: '#d4edda', // Used to flash the last row in the table

            TFA: 76.4,             // Total Floor Area in m2
            number_of_bedrooms: 3, // Number of bedrooms
            estimated_qenv50: 0,   // Estimated air permeability at 50 Pa in m3/h/m2
            estimated_ach: 0,      // Estimated air change rate in h-1

            outside: -2,
            qenv50: 15.2, // m3/h/m2

            // Volume flow factor
            fqv_z: 0.05, // Table B.8

            // Adjustment factor for the number of exposed facades
            ffac_z: 8, // > 1 exposed facades

            rooms: rooms,

            zone: {
                volume: 0,          // Total volume of the zone (sum of room volumes)
                envelope_area: 0,   // Total envelope area of the zone (sum of room envelope areas)

                qv_exh_z: 0,
                qv_comb_z: 0,
                qv_sup_z: 0,
                qv_ATD_design_z: 0,
            }
        },
        methods: {
            update: function () {
                if (!this.use_simplified_model) {
                    this.full_EN12831_ventilation_calc();
                    this.show_no_limits_comparison = false;
                } else {
                    // Use the simplified natural ventilation + ATD calculation
                    this.natural_vent_plus_ATDs_only();

                    if (this.show_no_limits_comparison) {
                        // Show comparison with no limits
                        this.natural_vent_plus_ATDs_only_no_limits();
                    }
                }

                this.flash_last_row();
            },

            flash_last_row: function () {
                this.last_row_color = '#4444cc'; // Flash last row color
                setTimeout(() => {
                    this.last_row_color = '#000'; // Reset last row color
                }, 200);
            },

            mcs_air_permeability_estimator: function () {
                // ------------------------------------------------------------------------------------
                // This calculator is not in EN12831-1:2017 but is used in the MCS heat load calculator
                // Calculate air permeability from minimum ventilation rates table 1.7 CIBSE DHDG

                // Table 1.7 Whole-building ventilation rates
                // Number of bedrooms        1, 2, 3, 4, 5
                let min_ventilation_rates = [13, 17, 21, 25, 29]; // l/s
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

            full_EN12831_ventilation_calc: function () {

                this.zone.volume = this.rooms.reduce((sum, room) => sum + room.volume, 0);                  // Total volume of the zone
                this.zone.envelope_area = this.rooms.reduce((sum, room) => sum + room.envelope_area, 0);    // Total envelope area of the zone

                if (this.air_permeability_calc_method === 'MCS') {
                    this.mcs_air_permeability_estimator();
                    this.qenv50 = this.estimated_qenv50; // m3/h/m2 @ 50 Pa
                } else if (this.air_permeability_calc_method === 'Test') {
                    // Manual entry with envelope area entry and correction
                    this.air_permeability_test_corrected = this.air_permeability_test_result * this.air_permeability_test_envelope_area / this.zone.envelope_area; // m3/h/m2 @ 50 Pa
                    this.qenv50 = this.air_permeability_test_corrected; // m3/h/m2 @ 50 Pa
                } else if (this.air_permeability_calc_method === 'SAP') {
                    // SAP based air permeability estimator
                    this.qenv50 = 15.0; // Placeholder value, replace with actual SAP calculation
                } else if (this.air_permeability_calc_method === 'TableB6') {
                    // EN 12831 Table B.6
                    this.qenv50 = 15.2; // Placeholder value, replace with actual Table B.6 calculation
                }

                // ------------------------------------------------------------------------------------
                // EN12831-1:2017 calculation section

                // Envelope of the ventilation zone (z)
                let Aenvz = this.zone.envelope_area; // m2

                // Specific air permeability of the envelope at 50pa
                let qenv50 = this.qenv50; // m3/h/m2

                // Exhaust air volume flow from the ventilation zone (z) (Sum of rooms, I)
                let qv_exh_z = 0; // m3/h

                // Combustion air volume flow from the ventilation zone (z) (Sum of rooms, I)
                let qv_comb_z = 0; // m3/h

                // Supply air volume flow from the ventilation zone (z) (Sum of rooms, I)
                let qv_sup_z = 0; // m3/h

                // Design air volume flow of the ATDs in the ventilation zone (z)
                let qv_ATD_design_z = 0; // m3/h

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];

                    // Formula 25
                    qv_exh_z += room.qv_exh_i;      // m3/h
                    // Formula 26
                    qv_comb_z += room.qv_comb_i;    // m3/h
                    // Formula 27
                    qv_sup_z += room.qv_sup_i;      // m3/h

                    // Formula B.1 (B.2.12 Estimation of design data of external ATDs)
                    // Use B.1 when the design volume flow of each single ATD or for each room with ATDs is known.
                    // Other forumlas are available when this is not known see B.2 & B.3
                    qv_ATD_design_z += room.qv_ATD_design_i; // m3/h

                }
                this.zone.qv_exh_z = qv_exh_z;                  // Update zone exhaust air volume flow
                this.zone.qv_comb_z = qv_comb_z;                // Update zone combustion air volume flow
                this.zone.qv_sup_z = qv_sup_z;                  // Update zone supply air volume flow
                this.zone.qv_ATD_design_z = qv_ATD_design_z;    // Update zone ATD design air volume flow

                // Air volume flow into the ventilation zone (z) through ATDs at a pressure difference of 50 Pa in accordance with Formula (30)
                // Pressure exponent for leakages
                let Vleak_z = 0.67; // Default value from B.2.14

                // Forula 30
                // The design pressure difference for the ATDs of a ventilation zone (z) may be estimated with delta p ATD,design,z = 4 Pa (page 71)
                let qv_ATD_50_z = qv_ATD_design_z * Math.pow((50 / 4), Vleak_z); // m3/h

                // ATD authority of the ATDs in zone (z) in accordance with Formula (22)
                let a_ATD_z = qv_ATD_50_z / (qv_ATD_50_z + (qenv50 * Aenvz));

                // Orientation factor (default: 2, B.2.14)
                let fdir_z = 2;

                // Formula 29 (fe,z) (page 38)
                // Adjustment factor taking into account the additional pressure difference due to unbalanced ventilation in accordance with Formula 29
                let fe_z_part = (qv_exh_z + qv_comb_z - qv_sup_z) / ((qenv50 * Aenvz) + qv_ATD_50_z);
                let fe_z = 1 / (1 + (this.ffac_z / this.fqv_z) * Math.pow(fe_z_part, 2));

                // 6.3.3.3.5 Air volume flow through additional infiltration into the zone (z) (page 37)
                let qv_inf_add_z = ((qenv50 * Aenvz) + qv_ATD_50_z) * this.fqv_z * fe_z;

                // 6.3.3.3.4 External air volume flow into the ventilation zone (z) through the building envelope (page 37)
                let qv_env_z = Math.max(qv_exh_z + qv_comb_z - qv_sup_z, 0) + qv_inf_add_z;

                // External air volume flow into the zone (z) through ATDs in accordance with Formula (21)
                let qv_ATD_z = a_ATD_z * qv_env_z;

                // Formula 20 (page 36)
                let qv_leak_z = (1 - a_ATD_z) * qv_env_z;

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];

                    // Design air volume flow of the ATDs in the ventilation room (I)
                    let plus_ATD = (qv_ATD_design_z > 0 ? (qv_ATD_z * (room.qv_ATD_design_i / qv_ATD_design_z)) : 0);

                    // Formula 19 (page 35)
                    // external air volume flow into the room (i) through leakages and ATDs in accordance with 6.3.3.3.2
                    let qv_leak_plus_ATD_i = (qv_leak_z * (room.envelope_area / Aenvz)) + plus_ATD;

                    // 6.3.3.3.2 External air volume flow into the room (I) through the building envelope
                    let qv_env_i = (qv_inf_add_z / qv_env_z) * Math.min(qv_env_z, qv_leak_plus_ATD_i * fdir_z) + ((qv_env_z - qv_inf_add_z) / qv_env_z) * qv_leak_plus_ATD_i

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

                    room.vent_heat_loss = 0.33 * (
                        (Math.max(qv_env_i + qv_open_i, qv_min_i - qv_techn_i) * (room.temperature - this.outside)) +
                        (qv_sup_i * (room.temperature - O_rec_z)) +
                        (qv_transfer_ij * (room.temperature - O_rec_z))
                    );

                    // 6.3.3.3.1 Zone (16)
                    // ratio between the minimum air volume flows of single rooms (i) that are part of the considered zone (z) and the resulting air volume flow of the zone (z)
                    // 1 room = 1
                    // >1 rooms = 0.5
                    let fi_z = 0.5;

                    room.vent_heat_loss_zone = 0.33 * (
                        (Math.max(qv_leak_plus_ATD_i + qv_open_i, (fi_z * qv_min_i) - qv_techn_i) * (room.temperature - this.outside)) +
                        (qv_sup_i * (room.temperature - O_rec_z)) +
                        (qv_transfer_ij * (room.temperature - O_rec_z))
                    );

                    // Used for calculating the effective air change rates (not part of the standard)
                    room.qv_room = room.vent_heat_loss / (0.33 * (room.temperature - this.outside));
                    room.qv_zone = room.vent_heat_loss_zone / (0.33 * (room.temperature - this.outside));
                }

                this.zone.vent_heat_loss_rooms = this.rooms.reduce((sum, room) => sum + room.vent_heat_loss, 0);
                this.zone.vent_heat_loss = this.rooms.reduce((sum, room) => sum + room.vent_heat_loss_zone, 0); // Total ventilation heat loss for the zone

                this.zone.qv_rooms = this.rooms.reduce((sum, room) => sum + room.qv_room, 0);
                this.zone.qv_zone = this.rooms.reduce((sum, room) => sum + room.qv_zone, 0);
            },

            // ------------------------------------------------------------------------------------------------
            // Simplification: Natural ventilation with ATDs only (no extract, supply & combustion factors)
            // ------------------------------------------------------------------------------------------------
            natural_vent_plus_ATDs_only: function () {

                this.zone.volume = this.rooms.reduce((sum, room) => sum + room.volume, 0);                  // Total volume of the zone
                this.zone.envelope_area = this.rooms.reduce((sum, room) => sum + room.envelope_area, 0);    // Total envelope area of the zone
                this.zone.qv_ATD_design_z = this.rooms.reduce((sum, room) => sum + room.qv_ATD_design_i, 0);// Total ATD volume flow

                this.n50 = (this.qenv50 * this.zone.envelope_area) / this.zone.volume;                      // Air change rate at 50 Pa in h-1
                this.ACH = this.n50 * this.fqv_z;                                                            // Air change rate in h-1

                // ------------------------------------------------------------------------------------
                // EN12831-1:2017 calculation section

                // Envelope of the ventilation zone (z)
                let Aenvz = this.zone.envelope_area;

                // 
                let ATD_factor = Math.pow(50 / 4, 0.67) * this.fqv_z;

                // air-permeability under normal conditions (m3/h.m2)
                let qenv = this.qenv50 * this.fqv_z;

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];

                    // --------------------------------------------------------------------------
                    // The calculation of the ATD volume flow is significantly simplified when 
                    // there are no extract, supply & combustion factors to take into account.
                    // It is only proportional to the ATD volume flow for the room.
                    let qv_ATD = room.qv_ATD_design_i * ATD_factor;

                    // The calculation for qv_leak_plus_ATD_i also simplifies out when 
                    // there are no extract, supply & combustion factors to take into account.
                    // It becomes only proportional to:
                    // the air-permeability test result (qenv50) divide by 20 x room.envelope_area
                    let qv_leak_plus_ATD_i = (qenv * room.envelope_area) + qv_ATD;

                    // 6.3.3.3.2 External air volume flow into the room (I) through the building envelope
                    // Double leakage or whole zone which ever is smaller
                    // qv_env_z is only going to be smaller if room.envelope_area * fdir_z > Aenvz
                    let fdir_z = 2; // Orientation factor (default: 2, B.2.14)
                    let qv_env_i = Math.min(qenv * Aenvz, qv_leak_plus_ATD_i * fdir_z);

                    // Calculate minimum volume flow rate
                    let qv_min_i = room.n_min * room.volume; // m3/h

                    // Mark that this room used the minimum room value
                    room.used_min_room = (qv_min_i > qv_env_i) ? true : false;

                    // Apply minimum volume flow rate 
                    if (qv_min_i > qv_env_i) qv_env_i = qv_min_i;

                    // 6.3.3.3.1 Heated space (17)
                    room.vent_heat_loss = 0.33 * qv_env_i * (room.temperature - this.outside);

                    // Apply minimum volume flow rate 
                    let fi_z = 0.5; // 1 room = 1, >1 rooms = 0.5

                    // Mark that this room used the minimum zone value
                    room.used_min_zone = (qv_min_i * fi_z > qv_leak_plus_ATD_i) ? true : false;

                    if (qv_min_i * fi_z > qv_leak_plus_ATD_i) qv_leak_plus_ATD_i = qv_min_i * fi_z;

                    // 6.3.3.3.1 Zone (16)
                    room.vent_heat_loss_zone = 0.33 * qv_leak_plus_ATD_i * (room.temperature - this.outside);

                    room.qv_room = qv_env_i;           // m3/h
                    room.qv_zone = qv_leak_plus_ATD_i; // m3/hr
                }

                this.zone.vent_heat_loss_rooms = this.rooms.reduce((sum, room) => sum + room.vent_heat_loss, 0);
                this.zone.vent_heat_loss = this.rooms.reduce((sum, room) => sum + room.vent_heat_loss_zone, 0); // Total ventilation heat loss for the zone

                this.zone.qv_rooms = this.rooms.reduce((sum, room) => sum + room.qv_room, 0);
                this.zone.qv_zone = this.rooms.reduce((sum, room) => sum + room.qv_zone, 0);
            },


            // ------------------------------------------------------------------------------------------------
            // The simplest form: natural ventilation with ATDs only, no minimum volume flow rates
            // ------------------------------------------------------------------------------------------------
            natural_vent_plus_ATDs_only_no_limits: function () {
                let Aenvz = this.zone.envelope_area;
                let ATD_factor = Math.pow(50 / 4, 0.67) * this.fqv_z;
                let qenv = this.qenv50 * this.fqv_z;

                for (var i = 0; i < this.rooms.length; i++) {
                    var room = this.rooms[i];

                    let qv_ATD = room.qv_ATD_design_i * ATD_factor;
                    let qv_leak_plus_ATD_i = (qenv * room.envelope_area) + qv_ATD;

                    let fdir_z = 2; // Orientation factor (default: 2, B.2.14)

                    // 6.3.3.3.1 Heated space (17)
                    room.vent_heat_loss_nl = 0.33 * qv_leak_plus_ATD_i * fdir_z * (room.temperature - this.outside);
                    // 6.3.3.3.1 Zone (16)
                    room.vent_heat_loss_zone_nl = 0.33 * qv_leak_plus_ATD_i * (room.temperature - this.outside);

                    room.qv_room_nl = qv_leak_plus_ATD_i * fdir_z; // m3/h
                    room.qv_zone_nl = qv_leak_plus_ATD_i; // m3/hr
                }

                this.zone.vent_heat_loss_rooms_nl = this.rooms.reduce((sum, room) => sum + room.vent_heat_loss_nl, 0);
                this.zone.vent_heat_loss_nl = this.rooms.reduce((sum, room) => sum + room.vent_heat_loss_zone_nl, 0); // Total ventilation heat loss for the zone

                this.zone.qv_rooms_nl = this.rooms.reduce((sum, room) => sum + room.qv_room_nl, 0);
                this.zone.qv_zone_nl = this.rooms.reduce((sum, room) => sum + room.qv_zone_nl, 0);
            }

        },
        filters: {
            number: function (value, decimals) {
                if (!value) return '';
                return parseFloat(value).toFixed(decimals);
            }
        }
    });
    app.update();
</script>