// ============================================================================
// Dynamic heat pump simulator — orchestration
// ----------------------------------------------------------------------------
// Runs the whole-system simulation: inputs (synthetic or CSV weather,
// schedules), the controller, the primary pipework + emitter + DHW coil, the
// stratified cylinder, the building fabric, the heat pump COP models, and the
// solar / battery / cost accounting.
//
// simulator.run(cfg, opts)
//   cfg  — plain config object (the same shape the UI's export produces):
//          {building, external, heatpump, primary, control, schedule, dhw,
//           dhw_schedule, dhw_draw_profile, battery,
//           outside_min_time, outside_max_time (hours)}
//          Objects are used by reference; the DHW schedule modulation limits
//          are clamped in place so a UI can reflect them.
//   opts — {days, state, dataset, on_done(result), on_progress(days_done)}
//
// opts.state is the caller-owned warm-start container {control, fabric, pw,
// cyl_T}; missing pieces are initialised here, existing ones carry over so
// repeated runs (e.g. a pre-sim warmup then the real run) continue from a
// settled system.
//
// opts.dataset is the annual driving dataset {loaded, outsideT, solar, agile}
// (half-hourly arrays) or null; it is used when cfg.external.use_csv is set.
//
// The loop is processed in chunks of a few simulated days, yielding via
// setTimeout between chunks so a browser can show progress on long runs.
// The result object carries totals, stats, design temperatures and the
// per-timestep series for plotting.
//
// Depends on the model modules (pipework, cylinder, controller, building) and
// the COP model globals from lib/ (get_ecodan_cop, getCOP, vaillant_data,
// copFitGeneric, copFitGenericV2).
// ============================================================================

var simulator = (function () {
    "use strict";

    function time_str_to_hour(time_str) {
        var hourmin = time_str.split(":");
        return parseInt(hourmin[0]) + parseInt(hourmin[1]) / 60;
    }

    // Sample the annual dataset (half-hourly, wrapping) at a simulation time
    function get_from_dataset(dataset, time_seconds) {
        if (!dataset || !dataset.loaded || dataset.outsideT.length === 0) {
            return null;
        }
        var index = Math.floor(time_seconds / 1800) % dataset.outsideT.length;
        if (index >= 0 && index < dataset.outsideT.length) {
            return {
                temperature: dataset.outsideT[index],
                solar: dataset.solar[index],
                agile: dataset.agile[index],
                humidity: dataset.humidity ? dataset.humidity[index] : NaN
            };
        }
        return null;
    }

    // 99.6% / 99.0% design temperatures from the outside temperature
    // histogram (seconds spent in 0.1 degree buckets)
    function design_temperatures(outsideT_histogram, days) {
        var sorted_keys = Object.keys(outsideT_histogram).sort(function (a, b) {
            return parseFloat(a) - parseFloat(b);
        });

        var total_hours = 24 * days;
        var prc_996 = null;
        var prc_990 = null;

        var sum_hours = 0;
        for (var k = 0; k < sorted_keys.length; k++) {
            var temperature = sorted_keys[k];
            var hours = outsideT_histogram[temperature] / 3600;

            sum_hours += hours;
            var prc = 100 * (1.0 - (sum_hours / total_hours));

            if (prc_996 === null && prc <= 99.6) {
                prc_996 = parseFloat(temperature);
            }
            if (prc_990 === null && prc <= 99.0) {
                prc_990 = parseFloat(temperature);
            }
        }

        return { outsideT_996: prc_996, outsideT_990: prc_990 };
    }

    function run(cfg, opts) {
        var days = opts.days;
        var state = opts.state;
        var dataset = opts.dataset;
        var on_done = opts.on_done;
        var on_progress = opts.on_progress;

        console.log("Sim run, days: ", days);

        // Simulation time parameters
        var timestep = 30;
        var itterations = 3600 * 24 * days / timestep;
        var power_to_kwh = timestep / 3600000;

        // Outside temperature parameters (synthetic waveform)
        var outside_min_time = cfg.outside_min_time;
        var outside_max_time = cfg.outside_max_time;
        var ramp_up = outside_max_time - outside_min_time;
        var ramp_down = 24 - ramp_up;

        // Pre-process schedule - convert time strings to hours and sort
        var processed_schedule = cfg.schedule.map(function (entry) {
            return {
                hour: time_str_to_hour(entry.start),
                set_point: parseFloat(entry.set_point),
                price: parseFloat(entry.price)
            };
        }).sort(function (a, b) {
            return a.hour - b.hour;
        });

        // Pre-process DHW schedule - convert time strings to hours and
        // duration to hours. Each window has a modulation limit (% of heat
        // pump capacity) so e.g. an overnight eco window can reheat slowly at
        // low output for better COP. Clamp between the heat pump minimum
        // modulation and 100%, writing the clamped value back so the UI
        // reflects it.
        var processed_dhw_schedule = cfg.dhw_schedule.map(function (entry) {
            var modulation = parseFloat(entry.modulation);
            if (isNaN(modulation)) modulation = 100;
            if (modulation < cfg.heatpump.minimum_modulation) modulation = cfg.heatpump.minimum_modulation;
            if (modulation > 100) modulation = 100;
            entry.modulation = modulation;
            return {
                start_hour: time_str_to_hour(entry.start),
                end_hour: time_str_to_hour(entry.start) + (entry.duration / 3600),
                set_point: parseFloat(entry.set_point),
                modulation: modulation
            };
        });

        // Calculate overheating temperature as max setpoint + 1 degree (min 20 degrees)
        var max_setpoint = Math.max.apply(null, processed_schedule.map(function (e) { return e.set_point; }));
        var overheating_temp = Math.max(20, max_setpoint + 1);

        // Battery parameters
        var battery_soc = cfg.battery.capacity_kwh * 0.5; // Start at 50% state of charge

        // State variables
        var setpoint = 0;
        var heatpump_heat = 0;
        var heatpump_elec = 0;
        var price = 0;
        var outside = 0;
        var solar = 0;
        var agile_price = 0;
        var DHW_active = false;
        var dhw_setpoint = 45;
        var dhw_modulation = 100;
        var dhw_mode = false;
        var radiator_heat = 0;

        // Max
        var max_room_temp = 0;

        // Results accumulators
        var elec_kwh = 0;
        var heat_kwh = 0;
        var solar_elec_kwh = 0;
        var solar_pv_kwh = 0;
        var solar_cost = 0;
        var solar_gains_kwh = 0;
        var utilised_solar_gains_kwh = 0;
        var kwh_carnot_elec = 0;
        var kwh_elec_running = 0;
        var kwh_heat_running = 0;

        var degree_hours_above_setpoint = 0;
        var degree_hours_below_setpoint = 0;
        var stats_count = 0;
        var flowT_weighted_sum = 0;
        var outsideT_weighted_sum = 0;
        var flowT_minus_outsideT_weighted_sum = 0;

        // HeatpumpMonitor.org-style stats, mirroring myheatpump_process.php
        // (calculate_window_cops, category means) and myheatpump_waft.php
        // (heat-weighted averages, % carnot) so the model's annual stats
        // compare like-for-like with the site's published last-365-day
        // system stats. Heat is the metered heat at point 1 (the heat meter
        // at the heat pump connections); space/water only accumulate while
        // the unit draws at least the starting-power threshold, matching
        // the upstream categorisation.
        var HPM_STARTING_POWER = 200; // W, heatpumpmonitor.org default
        var hpm = {
            combined_elec_kwh: 0,
            combined_heat_kwh: 0,        // raw metered heat, negatives included
            combined_cooling_kwh: 0,     // sum of negative metered heat
            combined_data_length: 0,     // seconds
            combined_roomT_sum: 0,
            combined_outsideT_sum: 0,
            combined_count: 0,
            space_elec_kwh: 0,
            space_heat_kwh: 0,
            space_data_length: 0,
            water_elec_kwh: 0,
            water_heat_kwh: 0,
            water_data_length: 0,
            // Weighted averages: heat clamped to zero when negative, as in
            // myheatpump_waft.php; kwh_heat is the clamped-heat divisor
            kwh_heat: 0,
            flowT_weighted_sum: 0,
            outsideT_weighted_sum: 0,
            flowT_minus_outsideT_weighted_sum: 0,
            flowT_minus_returnT_weighted_sum: 0,
            elec_weighted_sum: 0,
            heat_weighted_sum: 0,
            // % carnot over running data (flow-return DT > 1 K)
            kwh_carnot_elec: 0,
            kwh_elec_running: 0,
            kwh_heat_running: 0
        };

        var room_temp_sum = 0;
        var total_cost = 0;
        var agile_cost = 0;

        var dhw_heat_kwh = 0;
        var dhw_elec_kwh = 0;
        var cylinder_loss_kwh = 0;
        var min_cyl_top = 1000;

        var defrost_heat_kwh = 0;
        var defrost_elec_kwh = 0;
        var defrost_cycles = 0;

        // Time series for plotting
        var roomT_data = [];
        var outsideT_data = [];
        var flowT_data = [];
        var returnT_data = [];
        var elec_data = [];
        var heat_data = [];
        var agile_data = [];
        var targetT_data = [];
        var solar_pv_data = [];
        var cylTopT_data = [];
        var cylBottomT_data = [];
        var frost_data = [];
        var dhw_mode_data = [];
        var ch_mode_data = [];
        var defrost_data = [];

        var outsideT_histogram = {};

        // Extract config parameters as constants before the loop
        var hp_capacity = cfg.heatpump.capacity;
        var hp_system_water_volume = cfg.heatpump.system_water_volume;
        var hp_flow_rate = cfg.heatpump.flow_rate;
        var hp_radiatorRatedOutput = cfg.heatpump.radiatorRatedOutput;
        var hp_radiatorRatedDT = cfg.heatpump.radiatorRatedDT;
        var hp_prc_carnot = cfg.heatpump.prc_carnot;
        var hp_cop_model = cfg.heatpump.cop_model;
        // Generic COP model inputs: nominal (rated) capacity rather than the
        // top-end capacity above, plus an efficiency scale for other units
        var hp_nominal_capacity = cfg.heatpump.nominal_capacity;
        var hp_eta_scale = cfg.heatpump.eta_scale;
        var hp_standby = cfg.heatpump.standby;
        var hp_pumps = cfg.heatpump.pumps;
        // Optional cap on the unit's total electrical input (compressor +
        // pumps + standby), e.g. a supply fuse or a grid connection limit
        var hp_max_elec_enabled = cfg.heatpump.max_elec_enabled ? true : false;
        var hp_max_elec = cfg.heatpump.max_elec;
        var bld_lac_gains = cfg.building.lac_gains;
        var bld_pv_scale = cfg.building.pv_scale;
        var bld_include_lac_gains_in_elec_demand = cfg.building.include_lac_gains_in_elec_demand;
        var bat_capacity_kwh = cfg.battery.capacity_kwh;
        var bat_max_rate_kw = cfg.battery.max_rate_kw;
        var bat_round_trip_efficiency = cfg.battery.round_trip_efficiency;
        var ext_mid = cfg.external.mid;
        var ext_use_csv = cfg.external.use_csv;
        var ext_swing_half = cfg.external.swing * 0.5;

        // Hoisted loop invariants
        var max_elec_trim = 0;   // max electrical power limiter feedback trim, W
        var timestep_hours = timestep / 3600;
        var water_heat_capacity = hp_system_water_volume * 4187;
        var flow_heat_capacity = (hp_flow_rate / 60) * 4187;
        var schedule_last_index = processed_schedule.length - 1;
        var dhw_schedule_length = processed_dhw_schedule.length;

        // Operating point of the unit: flow temperature at the unit, outside
        // air temperature and condenser heat output (W) in; practical COP out,
        // plus the refrigerant-side evaporating and condensing temperatures
        // (degC) where the model resolves them. The carnot models and the
        // fitted models (lib/vaillant_cop_fit.js) all build the COP from a
        // lift between those two temperatures, so they can report them; the
        // lookup-table models (ecodan, vaillant datasheet) cannot and return
        // null, which the frost model falls back from.
        //
        // Used by the max electrical power limiter, by the electricity
        // calculation at the end of each step, and — for the evaporator
        // temperature only — by the frost model. Frost derating is applied by
        // the callers.
        function operating_point(flowT, outsideT, heat) {
            if (hp_cop_model == "carnot_fixed") {
                // Simple carnot equation based heat pump model with fixed offsets
                var condenser_f = flowT + 2;
                var evaporator_f = outsideT - 6;
                var IdealCOP_f = (condenser_f + 273) / ((condenser_f + 273) - (evaporator_f + 273));
                return { cop: IdealCOP_f * (hp_prc_carnot / 100), evaporator: evaporator_f, condenser: condenser_f };
            } else if (hp_cop_model == "carnot_variable") {
                // Simple carnot equation based heat pump model with variable offsets
                var output_ratio = heat / hp_capacity;
                var condenser_v = flowT + (3 * output_ratio);
                var evaporator_v = outsideT - (8 * output_ratio);
                var IdealCOP_v = (condenser_v + 273) / ((condenser_v + 273) - (evaporator_v + 273));
                return { cop: IdealCOP_v * (hp_prc_carnot / 100), evaporator: evaporator_v, condenser: condenser_v };
            } else if (hp_cop_model == "ecodan") {
                return { cop: get_ecodan_cop(flowT, outsideT, heat / hp_capacity), evaporator: null, condenser: null };
            } else if (hp_cop_model == "vaillant5") {
                return { cop: getCOP(vaillant_data['5kW'], flowT, outsideT, 0.001 * heat), evaporator: null, condenser: null };
            } else if (hp_cop_model == "vaillant12") {
                return { cop: getCOP(vaillant_data['12kW'], flowT, outsideT, 0.001 * heat), evaporator: null, condenser: null };
            } else if (hp_cop_model == "generic") {
                // Capacity-normalised fit (lib/vaillant_cop_fit.js): one
                // pooled parameter set, scaled by the unit's nominal
                // capacity, with an optional efficiency scale for units
                // other than the Arotherm+. Frost is left off here since
                // the frost model applies its own derating.
                return copFitGeneric(0.001 * hp_nominal_capacity, flowT, outsideT, 0.001 * heat, {
                    etaScale: hp_eta_scale,
                    includeFrost: false
                });
            } else if (hp_cop_model == "generic_v2") {
                // Same pooled approach, but the efficiency curve is in
                // inferred compressor speed rather than load fraction
                // (lib/vaillant_cop_fit.js). Pre-defrost by construction,
                // so the frost model supplies the derating.
                return copFitGenericV2(0.001 * hp_nominal_capacity, flowT, outsideT, 0.001 * heat, {
                    etaScale: hp_eta_scale
                });
            }
            return { cop: 0, evaporator: null, condenser: null };
        }

        // == Warm-start state ==
        // Initialise any missing pieces; existing ones carry over from the
        // previous run (pre-sim warmup, or repeated UI runs).
        if (!state.control) state.control = controller.init_persistent_state();
        if (!state.fabric) state.fabric = building.init_state(cfg.building.fabric);
        var control_state = state.control;
        var fabric_state = state.fabric;

        // == Controller setup (model/controller.js) ==
        var ctl_params = controller.setup(cfg.control, cfg.heatpump, timestep);
        var ctl_state = controller.init_run_state();

        // == Building fabric setup (model/building.js) ==
        var bld_params = building.setup(cfg.building, {
            overheating_temp: overheating_temp,
            timestep: timestep
        });

        // == Evaporator frosting & defrost setup (model/frost.js) ==
        var frost_params = frost.setup(cfg.frost, { timestep: timestep });
        if (!state.frost) state.frost = frost.init_state();
        var frost_state = state.frost;

        // == Primary pipework setup (model/pipework.js) ==
        // The emitter node capacity is the indoor system volume downstream of
        // metering point 2.
        var prim = cfg.primary;
        var pw_params = pipework.setup(prim, {
            flow_heat_capacity: flow_heat_capacity,
            timestep: timestep,
            emitter_C: water_heat_capacity,
            rad_W: hp_radiatorRatedOutput,
            rad_DT: hp_radiatorRatedDT
        });
        if (!state.pw) state.pw = { sig: "", flow: null, ret: null, Th: fabric_state.room, Te: fabric_state.room };
        var pw = state.pw;
        pipework.init_state(pw_params, prim, ext_mid, fabric_state.room, pw);

        // Metering accumulators: source is the condenser output (heat_kwh),
        // M1 the heat metered at the heat pump connections, M2 at the
        // building entry after the primary pipework
        var heat_m1_kwh = 0;
        var heat_m2_kwh = 0;
        var primary_loss_kwh = 0;
        var last_heat_time = -1e12;

        // == Hot water cylinder setup (model/cylinder.js) ==
        var cyl_params = cylinder.setup(cfg.dhw, {
            flow_heat_capacity: flow_heat_capacity,
            timestep: timestep,
            draw_profile: cfg.dhw_draw_profile.map(function (ev) {
                return {
                    start_hour: time_str_to_hour(ev.start),
                    duration_min: ev.duration_min,
                    fraction: ev.fraction
                };
            })
        });
        state.cyl_T = cylinder.init_state(cyl_params, state.cyl_T);
        var cyl_T = state.cyl_T;
        var cyl_acct = cylinder.start_accounting(cyl_params, cyl_T);

        // Per-run controller/pipework working values
        var flow_temperature = fabric_state.room;
        var return_temperature = fabric_state.room;

        // DHW coil exchange, used by the pipework step as the diverter sink
        // while dhw_mode is active
        var dhw_coil_exchange = function (Tf2, dt) {
            return cylinder.coil_exchange(cyl_params, cyl_T, cyl_acct, Tf2, dt);
        };

        // == Main simulation loop ==
        // Processed in chunks by run_chunk(); all simulation state lives in
        // the enclosing closure so each chunk carries on where the last one
        // stopped.
        var chunk_iterations = 2880 * 4; // 4 simulated days per chunk
        var i = 0;

        function run_chunk() {
            var chunk_end = Math.min(i + chunk_iterations, itterations);
            for (; i < chunk_end; i++) {
                var time = i * timestep;
                var hour = time / 3600;
                hour = hour % 24;

                // == Driving inputs: outside temperature, solar, prices ==
                if (ext_use_csv && dataset && dataset.loaded) {
                    // Use CSV data - time is in seconds from start of simulation
                    var ds = get_from_dataset(dataset, time);
                    var csv_temp = ds ? ds.temperature : null;
                    var csv_solar = ds ? ds.solar : 0;
                    var csv_agile = ds ? ds.agile : 0;

                    if (csv_temp !== null) {
                        outside = csv_temp;
                        if (outside < -10) outside = -10; // Limit extreme cold temperatures to avoid simulation instability
                        if (outside > 35) outside = 35; // Limit extreme hot temperatures to avoid simulation instability
                    }

                    if (csv_solar !== null) {
                        solar = csv_solar;
                        if (solar < 0) solar = 0; // Ensure no negative solar gains
                    }

                    if (csv_agile !== null) {
                        agile_price = csv_agile;
                    }

                } else {
                    // Use synthetic temperature model
                    var A;
                    if (hour >= outside_min_time && hour < outside_max_time) {
                        A = (hour - outside_min_time - (6 * ramp_up / 12)) / (ramp_up * 2);
                    } else {
                        var hour_mod = hour;
                        if (hour < outside_min_time) hour_mod = 24 + hour;
                        A = (hour_mod - outside_max_time + (6 * ramp_down / 12)) / (ramp_down * 2);
                    }
                    var radians = 2 * Math.PI * A;
                    outside = ext_mid + Math.sin(radians) * ext_swing_half;
                }

                // Ambient relative humidity for the frost model: the measured
                // CSV value when available and enabled, otherwise the fixed
                // value from the frost config
                var humidity = frost_params.rh;
                if (frost_params.use_csv_humidity && ext_use_csv && dataset &&
                    dataset.loaded && ds && isFinite(ds.humidity)) {
                    humidity = ds.humidity;
                }

                // Load heating schedule - find the active schedule entry for
                // the current hour, starting with the last entry (handles
                // wraparound to the next day)
                var scheduleIndex = schedule_last_index;
                for (var j = 0; j < processed_schedule.length; j++) {
                    if (hour >= processed_schedule[j].hour) {
                        scheduleIndex = j;
                    } else {
                        break;
                    }
                }
                setpoint = processed_schedule[scheduleIndex].set_point;
                price = processed_schedule[scheduleIndex].price;

                // Load DHW schedule - check if current hour falls within any DHW period
                DHW_active = false;
                for (var jd = 0; jd < dhw_schedule_length; jd++) {
                    var start = processed_dhw_schedule[jd].start_hour;
                    var end = processed_dhw_schedule[jd].end_hour;

                    // Handle wraparound case where end > 24 (e.g., 23:00 + 2 hours = 25:00)
                    if (end > 24) {
                        // DHW period spans midnight
                        if (hour >= start || hour < (end - 24)) {
                            DHW_active = true;
                            dhw_setpoint = processed_dhw_schedule[jd].set_point;
                            dhw_modulation = processed_dhw_schedule[jd].modulation;
                            break;
                        }
                    } else {
                        // Normal case - no wraparound
                        if (hour >= start && hour < end) {
                            DHW_active = true;
                            dhw_setpoint = processed_dhw_schedule[jd].set_point;
                            dhw_modulation = processed_dhw_schedule[jd].modulation;
                            break;
                        }
                    }
                }

                // == Control decision (model/controller.js) ==
                // DHW thermostat & priority, the four control modes, room
                // limiter, minimum-modulation cycling, summer cutoff and ramp
                // limiting. last_heat is the output the unit ended the
                // previous step on (after any flow-temperature cap), which
                // the ramp limits against.
                var ctl = controller.step(ctl_params, control_state, ctl_state, {
                    time: time,
                    hour: hour,
                    days: days,
                    setpoint: setpoint,
                    room: fabric_state.room,
                    outside: outside,
                    ext_mid: ext_mid,
                    flow_temperature: flow_temperature,
                    dhw_active: DHW_active,
                    dhw_setpoint: dhw_setpoint,
                    dhw_modulation: dhw_modulation,
                    dhw_hysteresis: cyl_params.hysteresis,
                    cyl_stat_T: cyl_T[cyl_params.stat_node],
                    last_heat: heatpump_heat
                });
                heatpump_heat = ctl.heat;
                dhw_mode = ctl.dhw_mode;

                // == Evaporator frosting & defrost (model/frost.js) ==
                // Frost accumulates while the compressor runs with the coil
                // below freezing; at the mass threshold a reverse-cycle
                // defrost zeroes the heat output and draws defrost_power from
                // the heating circuit (DHW diverter forced to the space
                // circuit) until the frost has melted. While frost builds,
                // available capacity and COP derate linearly with frost
                // fraction (electric input held, so COP falls with capacity).
                var defrost_draw = 0;
                var frost_cf = 1;
                if (frost_params.enabled) {
                    // Optionally drive the deposition from the COP model's own
                    // evaporating temperature (carnot / fitted models) rather
                    // than the fixed coil_dt below air, so the coil-air
                    // difference scales with load as the compressor modulates.
                    // Evaluated at the flow temperature and requested output
                    // the step starts on, as the electrical limiter below is.
                    var frost_evaporator = null;
                    if (frost_params.use_cop_evaporator && heatpump_heat > 0) {
                        frost_evaporator = operating_point(flow_temperature, outside, heatpump_heat).evaporator;
                    }
                    var fr = frost.step(frost_params, frost_state, {
                        running: heatpump_heat > 0,
                        outside: outside,
                        humidity: humidity,
                        evaporator: frost_evaporator
                    });
                    if (fr.started) defrost_cycles++;
                    if (fr.defrosting) {
                        heatpump_heat = 0;
                        dhw_mode = false;
                        defrost_draw = frost_params.defrost_power;
                    } else {
                        frost_cf = fr.capacity_factor;
                        var derated_capacity = hp_capacity * frost_cf;
                        if (heatpump_heat > derated_capacity) heatpump_heat = derated_capacity;
                    }
                }

                // == Primary pipework, emitter & DHW coil (model/pipework.js) ==

                var system_DT = (heatpump_heat - defrost_draw) / flow_heat_capacity;

                // Circulation pump runs while the heat pump runs (including
                // defrost), plus optional overrun
                if (heatpump_heat > 0 || defrost_draw > 0) last_heat_time = time;
                var pump_on = heatpump_heat > 0 || defrost_draw > 0 || (time - last_heat_time) <= pw_params.overrun_s;

                // Flow temperature limiter: as the unit outlet approaches the
                // cap the heat pump modulates down (and electricity use falls
                // accordingly). DHW reheat caps at dhw.flow_max, space
                // heating at 75C.
                if (heatpump_heat > 0) {
                    var flowT_cap = dhw_mode ? cyl_params.flow_max : 75;
                    var max_heat = flow_heat_capacity * (flowT_cap - pw.Th);
                    if (max_heat < 0) max_heat = 0;
                    if (heatpump_heat > max_heat) {
                        heatpump_heat = max_heat;
                        system_DT = heatpump_heat / flow_heat_capacity;
                    }
                }

                // Max electrical power limiter: an optional cap on the unit's
                // total electrical input (compressor + pumps + standby), e.g.
                // a supply fuse or a grid connection limit. The COP itself
                // depends on the heat output, so the output the cap allows is
                // solved by a few damped fixed-point steps of
                // heat = COP(heat) * compressor budget. Evaluated at the
                // current flow temperature, as the flow temperature limiter
                // above is. Defrost draw is a fixed compressor input and is
                // left alone.
                var elec_limited = false;
                if (hp_max_elec_enabled && heatpump_heat > 0 && defrost_draw == 0) {
                    var compressor_budget = hp_max_elec - hp_standby - (pump_on ? hp_pumps : 0) - max_elec_trim;
                    var elec_limited_heat = 0;
                    if (compressor_budget > 0) {
                        elec_limited_heat = heatpump_heat;
                        for (var eit = 0; eit < 4; eit++) {
                            var cop_trial = operating_point(flow_temperature, outside, elec_limited_heat).cop * frost_cf;
                            var allowed = cop_trial > 0 ? compressor_budget * cop_trial : 0;
                            if (allowed >= heatpump_heat) {
                                elec_limited_heat = heatpump_heat;
                                break;
                            }
                            // COP falls as output rises, so an undamped fixed
                            // point can oscillate: damp after the first step
                            elec_limited_heat = eit === 0 ? allowed : 0.5 * (elec_limited_heat + allowed);
                        }
                    }
                    if (elec_limited_heat < heatpump_heat) {
                        heatpump_heat = elec_limited_heat;
                        system_DT = heatpump_heat / flow_heat_capacity;
                        elec_limited = true;
                    }
                }

                var pw_out = pipework.step(pw_params, pw, {
                    pump_on: pump_on,
                    heat_W: heatpump_heat - defrost_draw,
                    dhw_mode: dhw_mode,
                    outside: outside,
                    room: fabric_state.room,
                    coil: dhw_coil_exchange
                });

                radiator_heat = pw_out.Erad / timestep;
                heat_m1_kwh += pw_out.E1 / 3600000;
                heat_m2_kwh += pw_out.E2 / 3600000;
                primary_loss_kwh += pw_out.Eloss / 3600000;

                // Flow and return temperatures at the heat pump connections
                // (the unit's own flow sensor — used by the controller and
                // the COP model)
                flow_temperature = pw.Th;
                return_temperature = pw.ret[pw_params.N - 1];

                // == Hot water cylinder (model/cylinder.js) ==
                // The coil heat input is applied inside the pipework sub-step
                // loop above; draws, standing losses, conduction and buoyancy
                // here. The standing loss is credited as an internal gain to
                // the room below.
                var cyl_loss = cylinder.step_passive(cyl_params, cyl_T, cyl_acct, hour, fabric_state.room);
                cylinder_loss_kwh += cyl_loss * power_to_kwh;

                if (cyl_T[cyl_params.node_count - 1] < min_cyl_top) min_cyl_top = cyl_T[cyl_params.node_count - 1];

                // == Heat pump COP model & electricity ==
                var PracticalCOP = operating_point(flow_temperature, outside, heatpump_heat).cop;

                // Pre-defrost derating: capacity falls with frost while the
                // electric input holds, so COP falls by the same factor
                if (frost_cf < 1) PracticalCOP *= frost_cf;

                if (defrost_draw > 0) {
                    // Reverse-cycle defrost: compressor electric draw
                    heatpump_elec = frost_params.defrost_elec;
                } else if (PracticalCOP > 0) {
                    heatpump_elec = heatpump_heat / PracticalCOP;
                } else {
                    heatpump_elec = 0;
                }

                // Add standby power and pump power (pump also draws during overrun)
                if (heatpump_elec > 0 || pump_on) {
                    heatpump_elec += hp_pumps;
                }
                heatpump_elec += hp_standby;

                // The limiter above sizes the compressor budget on the COP at
                // the flow temperature the step started at, so the realised
                // input lands a little over the cap as the flow temperature
                // rises through the step. Feed that error back as a trim on
                // the next step's budget (as a real power-limiting inverter
                // would), and release it as soon as the limiter stops biting.
                if (elec_limited) {
                    max_elec_trim += 0.5 * (heatpump_elec - hp_max_elec);
                    if (max_elec_trim < 0) max_elec_trim = 0;
                    if (max_elec_trim > hp_max_elec) max_elec_trim = hp_max_elec;
                } else {
                    max_elec_trim = 0;
                }

                if (defrost_draw > 0) {
                    defrost_heat_kwh += defrost_draw * power_to_kwh;
                    defrost_elec_kwh += heatpump_elec * power_to_kwh;
                }

                // == Building fabric (model/building.js) ==
                // Radiator output, solar gains, internal gains and cylinder
                // standing loss arrive in the room node; heat conducts out to
                // the outside air.
                var gains = building.step(bld_params, fabric_state, {
                    radiator_heat: radiator_heat,
                    cyl_loss: cyl_loss,
                    solar: solar,
                    outside: outside
                });
                solar_gains_kwh += gains.solar_gains * power_to_kwh;
                utilised_solar_gains_kwh += gains.utilised_solar_gains * power_to_kwh;

                if (fabric_state.room > max_room_temp) {
                    max_room_temp = fabric_state.room;
                }

                // Record degree hours above and below setpoint
                var tolerance = 0.05;
                if (fabric_state.room > setpoint + tolerance) {
                    if (heatpump_heat > 0) {
                        degree_hours_above_setpoint += (fabric_state.room - setpoint) * timestep_hours;
                    }
                } else if (fabric_state.room < setpoint - tolerance) {
                    degree_hours_below_setpoint += (setpoint - fabric_state.room) * timestep_hours;
                }

                // Abort cleanly (finishing with partial results) if the simulation has gone unstable
                if (isNaN(fabric_state.room) || isNaN(outside) || isNaN(flow_temperature) ||
                    isNaN(return_temperature) || isNaN(heatpump_elec) || isNaN(heatpump_heat) ||
                    isNaN(pw.Th) || isNaN(pw.Te) || isNaN(frost_state.mass)) {
                    console.error("Simulation aborted, NaN at step " + i);
                    i = itterations;
                    break;
                }

                // Store data for plotting (fixed interval timeseries;
                // timestamps are added at plot time)
                roomT_data[i] = fabric_state.room;
                outsideT_data[i] = outside;
                flowT_data[i] = flow_temperature;
                returnT_data[i] = return_temperature;
                elec_data[i] = heatpump_elec;
                heat_data[i] = heatpump_heat;
                agile_data[i] = agile_price;
                targetT_data[i] = setpoint;
                cylTopT_data[i] = cyl_T[cyl_params.node_count - 1];
                cylBottomT_data[i] = cyl_T[0];
                frost_data[i] = frost_state.mass;
                // Mode indicators (powergraph-style shading) and the reverse
                // cycle defrost draw on the heating circuit
                dhw_mode_data[i] = dhw_mode ? 1 : 0;
                ch_mode_data[i] = (heatpump_heat > 0 && !dhw_mode) ? 1 : 0;
                defrost_data[i] = defrost_draw;

                // == Stats ==

                // Calculate ideal carnot efficiency
                var condensor = flow_temperature + 2 + 273.15;
                var evaporator = outside - 6 + 273.15;
                var carnot_dt = condensor - evaporator;
                var ideal_carnot = 0;
                if (carnot_dt > 0) {
                    ideal_carnot = condensor / carnot_dt;
                }

                if (system_DT > 1 && heatpump_heat > 0 && ideal_carnot > 0) {
                    // Calulate predicted elec consumption based on carnot efficiency
                    kwh_carnot_elec += (heatpump_heat / ideal_carnot) * power_to_kwh;
                    kwh_elec_running += heatpump_elec * power_to_kwh;
                    kwh_heat_running += heatpump_heat * power_to_kwh;
                }

                room_temp_sum += fabric_state.room;
                elec_kwh += heatpump_elec * power_to_kwh;
                heat_kwh += heatpump_heat * power_to_kwh;

                if (dhw_mode) {
                    dhw_elec_kwh += heatpump_elec * power_to_kwh;
                    dhw_heat_kwh += heatpump_heat * power_to_kwh;
                }

                flowT_weighted_sum += flow_temperature * heatpump_heat * power_to_kwh;
                outsideT_weighted_sum += outside * heatpump_heat * power_to_kwh;
                flowT_minus_outsideT_weighted_sum += heatpump_heat * (flow_temperature - outside) * power_to_kwh;

                stats_count++;

                // == HeatpumpMonitor.org-style stats ==
                // hpm_heat is what a heat meter at the heat pump connections
                // reads: negative during a reverse-cycle defrost draw
                var hpm_heat = pw_out.E1 / timestep;
                hpm.combined_elec_kwh += heatpump_elec * power_to_kwh;
                hpm.combined_heat_kwh += hpm_heat * power_to_kwh;
                hpm.combined_data_length += timestep;
                if (hpm_heat < 0) hpm.combined_cooling_kwh += -hpm_heat * power_to_kwh;
                hpm.combined_roomT_sum += fabric_state.room;
                hpm.combined_outsideT_sum += outside;
                hpm.combined_count++;

                if (heatpump_elec >= HPM_STARTING_POWER) {
                    if (dhw_mode) {
                        hpm.water_elec_kwh += heatpump_elec * power_to_kwh;
                        hpm.water_heat_kwh += hpm_heat * power_to_kwh;
                        hpm.water_data_length += timestep;
                    } else {
                        hpm.space_elec_kwh += heatpump_elec * power_to_kwh;
                        hpm.space_heat_kwh += hpm_heat * power_to_kwh;
                        hpm.space_data_length += timestep;
                    }
                }

                // Weighted averages: negative metered heat clamped to zero
                var hpm_heat_pos = hpm_heat > 0 ? hpm_heat : 0;
                hpm.kwh_heat += hpm_heat_pos * power_to_kwh;
                hpm.flowT_weighted_sum += hpm_heat_pos * flow_temperature * power_to_kwh;
                hpm.outsideT_weighted_sum += hpm_heat_pos * outside * power_to_kwh;
                hpm.flowT_minus_outsideT_weighted_sum += hpm_heat_pos * (flow_temperature - outside) * power_to_kwh;
                hpm.flowT_minus_returnT_weighted_sum += hpm_heat_pos * (flow_temperature - return_temperature) * power_to_kwh;
                hpm.elec_weighted_sum += heatpump_elec * heatpump_elec * power_to_kwh;
                hpm.heat_weighted_sum += hpm_heat_pos * hpm_heat_pos * power_to_kwh;

                // % carnot accumulates while the unit runs with a real
                // flow-return DT, same condition as myheatpump_waft.php
                // (ideal_carnot from the same flow+2 / outside-6 offsets above)
                var hpm_dt = flow_temperature - return_temperature;
                if (hpm_dt > 1 && hpm_heat_pos > 0 && ideal_carnot > 0) {
                    hpm.kwh_carnot_elec += (hpm_heat_pos / ideal_carnot) * power_to_kwh;
                    hpm.kwh_elec_running += heatpump_elec * power_to_kwh;
                    hpm.kwh_heat_running += hpm_heat_pos * power_to_kwh;
                }

                // Outside temperature histogram, bucketed to the closest 0.1 degree
                var outside_bucket = (Math.round(outside * 10) / 10).toFixed(1);
                if (outsideT_histogram[outside_bucket] === undefined) {
                    outsideT_histogram[outside_bucket] = 0;
                }
                outsideT_histogram[outside_bucket] += timestep;

                // == Home solar and battery storage model ==

                // Solar PV electrical offset
                // 0.90 converts pv_scale in kW to 870 kWh/year generation.
                var solar_pv_watts = solar * bld_pv_scale * 0.9;
                var balance = solar_pv_watts - heatpump_elec;
                if (bld_include_lac_gains_in_elec_demand) {
                    balance -= bld_lac_gains;
                }

                // Simple direct charge and discharge battery storage model
                var battery_one_way_efficiency = Math.sqrt(bat_round_trip_efficiency);

                if (bat_capacity_kwh > 0) {
                    if (balance > 0) {
                        var charge = balance;
                        if (charge > bat_max_rate_kw * 1000) {
                            charge = bat_max_rate_kw * 1000;
                        }

                        var charge_after_loss = charge * battery_one_way_efficiency;
                        var battery_soc_inc = charge_after_loss * power_to_kwh;

                        if (battery_soc + battery_soc_inc > bat_capacity_kwh) {
                            // Can't charge beyond capacity, so reduce charge to fit remaining capacity
                            battery_soc_inc = bat_capacity_kwh - battery_soc;
                            charge_after_loss = battery_soc_inc / power_to_kwh;
                            charge = charge_after_loss / battery_one_way_efficiency; // Adjust for efficiency losses
                        }

                        battery_soc += battery_soc_inc;
                        balance -= charge; // Reduce balance by the amount charged to battery
                    } else {
                        var discharge = -balance;
                        if (discharge > bat_max_rate_kw * 1000) {
                            discharge = bat_max_rate_kw * 1000;
                        }

                        var discharge_before_loss = discharge / battery_one_way_efficiency;
                        var battery_soc_dec = discharge_before_loss * power_to_kwh;

                        if (battery_soc - battery_soc_dec < 0) {
                            // Can't discharge beyond empty, so reduce discharge to fit available charge
                            battery_soc_dec = battery_soc;
                            discharge_before_loss = battery_soc_dec / power_to_kwh;
                            discharge = discharge_before_loss * battery_one_way_efficiency; // Adjust for efficiency losses
                        }

                        battery_soc -= battery_soc_dec;
                        balance += discharge; // Reduce balance by the amount discharged from battery
                    }
                }

                var solar_offset = 0;
                var import_power = 0;

                if (balance >= 0) {
                    // Surplus is exported (not valued in the cost model)
                    solar_offset = heatpump_elec;
                    if (bld_include_lac_gains_in_elec_demand) {
                        solar_offset += bld_lac_gains;
                    }
                } else {
                    import_power = -balance;
                    solar_offset = solar_pv_watts;
                }

                // Add solar generation to timeseries for plotting
                solar_pv_data[i] = solar_pv_watts;

                // Record solar PV generation and offset for stats
                solar_pv_kwh += solar_pv_watts * power_to_kwh;
                solar_elec_kwh += solar_offset * power_to_kwh;

                // Cost calculations
                total_cost += import_power * power_to_kwh * price * 0.01;
                agile_cost += import_power * power_to_kwh * agile_price * 0.01 * 1.05;
                solar_cost += solar_offset * power_to_kwh * price * 0.01;
            }

            if (on_progress) on_progress((i * timestep) / 86400);
            if (i < itterations) {
                // Yield to the browser so the progress display can render, then continue
                setTimeout(run_chunk, 0);
                return;
            }
            sim_finish();
        }
        // == End of run_chunk / main simulation loop ==

        function sim_finish() {

            var design = design_temperatures(outsideT_histogram, days);

            var wa_prc_carnot = 0;
            if (kwh_elec_running > 0 && kwh_carnot_elec > 0) {
                wa_prc_carnot = (kwh_heat_running / kwh_elec_running) / (kwh_heat_running / kwh_carnot_elec);
            }

            // HeatpumpMonitor.org-style stats, same field names as the
            // system/stats/last365 API so the validator compares like for like
            var hpm_prc_carnot = null;
            if (hpm.kwh_elec_running > 0 && hpm.kwh_carnot_elec > 0) {
                hpm_prc_carnot = 100 * (hpm.kwh_heat_running / hpm.kwh_elec_running) /
                    (hpm.kwh_heat_running / hpm.kwh_carnot_elec);
            }
            var hpm_stats = {
                combined_elec_kwh: hpm.combined_elec_kwh,
                combined_heat_kwh: hpm.combined_heat_kwh,
                combined_cop: hpm.combined_elec_kwh > 0 ? hpm.combined_heat_kwh / hpm.combined_elec_kwh : null,
                combined_cooling_kwh: hpm.combined_cooling_kwh,
                combined_data_length: hpm.combined_data_length,
                combined_roomT_mean: hpm.combined_count > 0 ? hpm.combined_roomT_sum / hpm.combined_count : null,
                combined_outsideT_mean: hpm.combined_count > 0 ? hpm.combined_outsideT_sum / hpm.combined_count : null,
                space_elec_kwh: hpm.space_elec_kwh,
                space_heat_kwh: hpm.space_heat_kwh,
                space_cop: hpm.space_elec_kwh > 0 ? hpm.space_heat_kwh / hpm.space_elec_kwh : null,
                water_elec_kwh: hpm.water_elec_kwh,
                water_heat_kwh: hpm.water_heat_kwh,
                water_cop: hpm.water_elec_kwh > 0 ? hpm.water_heat_kwh / hpm.water_elec_kwh : null,
                weighted_flowT: hpm.kwh_heat > 0 ? hpm.flowT_weighted_sum / hpm.kwh_heat : null,
                weighted_outsideT: hpm.kwh_heat > 0 ? hpm.outsideT_weighted_sum / hpm.kwh_heat : null,
                weighted_flowT_minus_outsideT: hpm.kwh_heat > 0 ? hpm.flowT_minus_outsideT_weighted_sum / hpm.kwh_heat : null,
                weighted_flowT_minus_returnT: hpm.kwh_heat > 0 ? hpm.flowT_minus_returnT_weighted_sum / hpm.kwh_heat : null,
                weighted_elec: hpm.combined_elec_kwh > 0 ? hpm.elec_weighted_sum / hpm.combined_elec_kwh : null,
                weighted_heat: hpm.kwh_heat > 0 ? hpm.heat_weighted_sum / hpm.kwh_heat : null,
                weighted_prc_carnot: hpm_prc_carnot
            };

            // Print solar kWh console
            console.log("Solar PV kWh: " + solar_pv_kwh.toFixed(2));

            // Cylinder energy-conservation self-test: the change in stored
            // energy must equal the net external energy in (coil - draws -
            // standing losses). Conduction and buoyancy mixing are internal
            // and must cancel.
            var cyl_check = cylinder.conservation_check(cyl_params, cyl_T, cyl_acct);
            if (cyl_check.rel_residual > 1e-9) {
                console.warn("Cylinder energy conservation residual: " + cyl_check.residual.toFixed(1) +
                             " J (relative " + cyl_check.rel_residual.toExponential(2) + ")");
            }

            on_done({
                elec_kwh: elec_kwh,
                heat_kwh: heat_kwh,
                heat_kwh_m1: heat_m1_kwh,
                heat_kwh_m2: heat_m2_kwh,
                primary_loss_kwh: primary_loss_kwh,
                max_room_temp: max_room_temp,
                mean_room_temp: room_temp_sum / stats_count,
                total_cost: total_cost,
                agile_cost: agile_cost,
                solar_elec_kwh: solar_elec_kwh,
                solar_cost: solar_cost,
                solar_gains_kwh: solar_gains_kwh,
                utilised_solar_gains_kwh: utilised_solar_gains_kwh,
                flowT_weighted: flowT_weighted_sum / heat_kwh,
                outsideT_weighted: outsideT_weighted_sum / heat_kwh,
                flowT_minus_outsideT_weighted: flowT_minus_outsideT_weighted_sum / heat_kwh,
                wa_prc_carnot: wa_prc_carnot,
                degree_hours_above_setpoint: degree_hours_above_setpoint,
                degree_hours_below_setpoint: degree_hours_below_setpoint,
                dhw_heat_kwh: dhw_heat_kwh,
                dhw_elec_kwh: dhw_elec_kwh,
                dhw_delivered_kwh: cyl_acct.delivered_kwh,
                cylinder_loss_kwh: cylinder_loss_kwh,
                min_cylinder_top_temp: min_cyl_top,
                defrost_heat_kwh: defrost_heat_kwh,
                defrost_elec_kwh: defrost_elec_kwh,
                defrost_cycles: defrost_cycles,
                outsideT_996: design.outsideT_996,
                outsideT_990: design.outsideT_990,
                hpm_stats: hpm_stats,
                series: {
                    roomT_data: roomT_data,
                    outsideT_data: outsideT_data,
                    flowT_data: flowT_data,
                    returnT_data: returnT_data,
                    elec_data: elec_data,
                    heat_data: heat_data,
                    agile_data: agile_data,
                    targetT_data: targetT_data,
                    solar_pv_data: solar_pv_data,
                    cylTopT_data: cylTopT_data,
                    cylBottomT_data: cylBottomT_data,
                    frost_data: frost_data,
                    dhw_mode_data: dhw_mode_data,
                    ch_mode_data: ch_mode_data,
                    defrost_data: defrost_data
                }
            });
        }
        // == End of sim_finish ==

        // Start the first chunk
        run_chunk();
    }

    return {
        run: run,
        design_temperatures: design_temperatures
    };
})();

if (typeof module !== 'undefined') module.exports = simulator;
