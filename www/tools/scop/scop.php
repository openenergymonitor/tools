<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>

<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script> 
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script> 
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>

<script src="<?php echo $path_lib;?>ecodan.js?v=1"></script>
<script src="<?php echo $path_lib;?>feed.js?v=1"></script>

<div class="container mt-3" style="max-width:800px" id="app">
    <div class="row">
        <div class="col">
            <h3>Heat Pump System Performance Calculator</h3>
            <p>Calculate heat pump SCOP based on design flow temperature.</p>
            <div class="alert alert-warning"><i class="fa-solid fa-person-digging"></i> This tool is work in progress. 
            It does not include performance loss due to defrosts and seems to over-predict performance for systems running at higher design flow temperatures.
            </div>
        </div>
    </div>
    <hr>
    <div class="row">
        <div class="col">
            <label class="form-label">Base temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="baseTemp" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Heat Loss</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="heat_loss" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Average internal temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="roomT" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Design outside temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="designOutsideTemp" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>
    <div class="row">
        <div class="col">
            <label class="form-label">Heat pump capacity</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="heatpumpCapacity" @change="update">
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Practical COP factor</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="practicalCOPfactor" @change="update">
                <span class="input-group-text">%</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Minimum modulation</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minimumModulation" @change="update">
                <span class="input-group-text">%</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">System DT</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="systemDT" @change="update">
                <span class="input-group-text">K</span>
            </div>
        </div>    
    </div>        
    
    <div class="row">
        <div class="col">
            <label class="form-label">Design Flow Temperature</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="designFlowTemp" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Emitter rated output @ DT50</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="rad_rated_output*0.001 | toFixed(1)" disabled>
                <span class="input-group-text">kW</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Number of 1200x600 K2 rads</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="rad_rated_output*0.001*0.5 | toFixed(1)" disabled>
            </div>
        </div>
    </div>
    <div class="row">
        <div class="col">
            <label class="form-label">Annual space heat demand</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="annual_heat_kwh | toFixed(0)" disabled>
                <span class="input-group-text">kWh</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Annual electric demand</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="annual_elec_kwh | toFixed(0)" disabled>
                <span class="input-group-text">kWh</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">SCOP</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="annual_scop | toFixed(2)" disabled>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col">
            <label class="form-label">Weighted Flow Temp</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="weighted_flow_temp | toFixed(1)" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Weighted Flow - Outside</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="weighted_flow_minus_outside | toFixed(1)" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>
        <div class="col">
            <label class="form-label">Weighted Outside Temp</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" :value="weighted_outside | toFixed(1)" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>
    </div>

    <div class="row" style="background-color: #f6f6f6; margin: 0px 0px 10px 0px; padding:10px; border-radius: 5px;">
        <p>System operation at minimum modulation</p>

        <div class="col">

            <label class="form-label">Flow Temp</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minFlowTemp" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col">
            <label class="form-label">Heat</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minHeatOut" disabled>
                <span class="input-group-text">W</span>
            </div>
        </div>

        <div class="col">
            <label class="form-label">Outside</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minModOutsideMatch" disabled>
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col">
            <label class="form-label">Test</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minModOutside" @change="update">
                <span class="input-group-text">°C</span>
            </div>
        </div>

        <div class="col">
            <label class="form-label">COP</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minModCOP" disabled>
            </div>
        </div>

        <div class="col">
            <label class="form-label">Elec</label>
            <div class="input-group mb-3">
                <input type="text" class="form-control" v-model.number="minModElec" disabled>
                <span class="input-group-text">W</span>
            </div>
        </div>            

    </div>

    <div class="row">
        <div class="col">
            <!-- A simple flot graph -->
            <div id="graph" style="width:100%;height:350px;"></div>
        </div>
    </div>
    <hr> 
    <div class="row">
        <div class="col">
            <table class="table">
                <tr>
                    <th>Month</th>
                    <th>Heat demand</th>
                    <th>Electric demand</th>
                    <th>SCOP</th>
                </tr>
                <tr v-for="month in monthly_table">
                    <td>{{month.month}}</td>
                    <td>{{month.heat_kwh | toFixed(0)}} kWh</td>
                    <td>{{month.elec_kwh | toFixed(0)}} kWh</td>
                    <td>{{month.scop | toFixed(2)}}</td>
                </tr>
            </table>
        </div>
    </div>
    <hr> 
</div>

<script>
    // Start by loading hourly average outside temperature data from emoncms.org API
    // Create basic Vue outline
    var series = [];

    var app = new Vue({
        el: '#app',
        data: {
            // inputs
            roomT: 19.3,
            baseTemp: 15.5,
            heat_loss: 3.3,
            designOutsideTemp: -1.4,
            designFlowTemp: 38,
            minFlowTemp: '',
            minHeatOut: '',
            minModOutsideMatch: '',
            minModOutside: 10,
            minModCOP: '',
            minModElec: '',
            systemDT: 5,
            heatpumpCapacity: 5,
            minimumModulation: 40,  // %
            practicalCOPfactor: 50, // %
            rad_rated_output: 0,
            // outputs
            annual_heat_kwh: 0,
            annual_elec_kwh: 0,
            annual_scop: 0,
            monthly_table: [],
            monthly_heat_demand: [],
            // weighted
            weighted_flow_temp: 0,
            weighted_flow_minus_outside: 0,
            weighted_outside: 0
        },
        methods: {
            update: function () {
                app.model();
            },
            model: function() {
                // reset for new calculation
                app.annual_elec_kwh = 0;
                app.annual_heat_kwh = 0;
                let month_elec_kwh = 0;
                let month_heat_kwh = 0;

                var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                
                let month = new Date(series[0].data[0][0]).getMonth();
                app.monthly_heat_demand = [];
                app.monthly_table = [];
                
                // Calculate HLP
                let HLP = (app.heat_loss*1000) / (app.roomT - app.designOutsideTemp);
                
                // Calculate radiator size
                // Rad heat demand is actually smaller than this due to DHW & internal gains..
                let rad_heat_demand = app.heat_loss*1000;
                let MWT = app.designFlowTemp - (app.systemDT*0.5);
                let deltaT = MWT - app.roomT;
                app.rad_rated_output = rad_heat_demand / Math.pow(deltaT / 50,1.3);
                
                // Calculate minimum flow temperature
                rad_heat_demand = app.heatpumpCapacity * (app.minimumModulation*0.01) * 1000;
                deltaT = Math.pow(rad_heat_demand / app.rad_rated_output, 1/1.3) * 50;
                MWT = app.roomT + deltaT;
                app.minFlowTemp = MWT + (app.systemDT*0.5);
                app.minFlowTemp = app.minFlowTemp.toFixed(1)*1;

                // Calculate minimum heat output
                app.minHeatOut = app.rad_rated_output * Math.pow((MWT - app.roomT)/50, 1.3)
                app.minHeatOut = app.minHeatOut.toFixed(0);

                app.minModOutsideMatch = app.roomT - (app.minHeatOut / HLP)
                app.minModOutsideMatch = app.minModOutsideMatch.toFixed(1);

                // Calculate COP at minimum modulation
                let Th = app.minFlowTemp + 273 + 2;
                let Tc = app.minModOutside + 273 - 6;
                let carnot_COP = Th / (Th - Tc);
                app.minModCOP = carnot_COP * (app.practicalCOPfactor*0.01);
                app.minModCOP = app.minModCOP.toFixed(2);

                // Calculate electric demand at minimum modulation
                app.minModElec = app.minHeatOut / app.minModCOP;
                app.minModElec = app.minModElec.toFixed(0);

                let flowT_sum = 0;
                let flowT_count = 0;

                let flowT_weighted_sum = 0;
                let flowT_minus_outside_weighted_sum = 0;
                let outside_weighted_sum = 0;

                var histogram_hours_at_modulation = [];
                var modulation_bucket = 10;
                
                for (var i = 0; i < series[0].data.length; i++) {
                    let outsideTemp = series[0].data[i][1];

                    // Calculate degree hours heating demand
                    let degreeHour = app.baseTemp - outsideTemp;
                    if (degreeHour < 0) {
                        degreeHour = 0;
                    }

                    // Calculate heat demand using heat loss parameter
                    let heatDemand = degreeHour * HLP;
                    
                    // This approach would need to take into account gains, hence use of degree days approach
                    // let WK = 3300 / 20.7;
                    // let heatDemand = WK * (19.3 - outsideTemp);
                    
                    // convert to cumulative kWh
                    app.annual_heat_kwh += heatDemand / 1000;
                    month_heat_kwh += heatDemand / 1000;

                    let deltaT = Math.pow(heatDemand / app.rad_rated_output, 1/1.3) * 50;
                    let MWT = app.roomT + deltaT;
                    
                    if (MWT < app.minFlowTemp) {
                        MWT = app.minFlowTemp;
                    }

                    let flowTemp = MWT + (app.systemDT*0.5);
                    flowT_sum += flowTemp;
                    flowT_count ++;

                    flowT_weighted_sum += flowTemp * (heatDemand / 1000);
                    flowT_minus_outside_weighted_sum += (flowTemp - outsideTemp) * (heatDemand / 1000);
                    outside_weighted_sum += outsideTemp * (heatDemand / 1000);
                    
                    let condensing_offset = 2;
                    let evaporating_offset = -6;

                    let Th = flowTemp + 273 + condensing_offset;
                    let Tc = outsideTemp + 273 + evaporating_offset;
                    let carnot_COP = Th / (Th - Tc);
                    let COP = carnot_COP * (app.practicalCOPfactor*0.01);

                    // Alternative ecodan datasheet approach
                    // COP = get_ecodan_cop(flowTemp, outsideTemp, heatDemand / app.heatpumpCapacity);

                    let elecDemand = heatDemand / COP;
                    app.annual_elec_kwh += elecDemand / 1000;
                    month_elec_kwh += elecDemand / 1000;

                    // Create timeseries of monthly heat demand for graph and table
                    let lastMonth = month;
                    month = new Date(series[0].data[i][0]).getMonth();
                    if (month != lastMonth) {
                        app.monthly_heat_demand.push([lastMonth, month_heat_kwh]);

                        app.monthly_table.push({
                            month: months[lastMonth],
                            heat_kwh: month_heat_kwh,
                            elec_kwh: month_elec_kwh,
                            scop: month_heat_kwh / month_elec_kwh
                        });
                        month_heat_kwh = 0;
                        month_elec_kwh = 0;
                    }

                    // Create histogram of hours at modulation
                    if (heatDemand>0) {
                        let modulation = Math.round((heatDemand / (app.heatpumpCapacity*1000)) * 100);
                        let bucket = Math.floor(modulation / modulation_bucket) * modulation_bucket;

                        if (bucket > 100) {
                            bucket = 100;
                        }
                        if (bucket < 0) {
                            bucket = 0;
                        }

                        if (!histogram_hours_at_modulation[bucket]) {
                            histogram_hours_at_modulation[bucket] = 0;
                        }
                        histogram_hours_at_modulation[bucket] += heatDemand / 1000;
                    }

                }

                console.log(histogram_hours_at_modulation);

                app.weighted_flow_temp = flowT_weighted_sum / app.annual_heat_kwh;
                app.weighted_flow_minus_outside = flowT_minus_outside_weighted_sum / app.annual_heat_kwh;
                app.weighted_outside = outside_weighted_sum / app.annual_heat_kwh;

                app.annual_scop = app.annual_heat_kwh / app.annual_elec_kwh;

                $.plot("#graph", [app.monthly_heat_demand], {
                    // bar graph
                    series: {
                        bars: {
                            show: true,
                            barWidth: 0.8,
                            align: "center"
                        }
                    },
                    xaxis: {
                    },
                    yaxis: {
                    },
                    selection: {
                        mode: "x"
                    },
                    grid:{
                        hoverable: true,
                        clickable: true
                    }
                });
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
        },
        mounted: function () {
            feed.getdata(458775,"2022-01-01T00:00:00Z","2023-01-01T00:00:00Z",3600,1,function(result){
                series = result;
                app.update();
            });
        }
    });

</script>
