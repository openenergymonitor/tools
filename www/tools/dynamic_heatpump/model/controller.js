// ============================================================================
// Heat pump controller
// ----------------------------------------------------------------------------
// The four control modes (auto-adaptive room PI, weather compensation curve,
// cascade PI, fixed compressor speed) plus the DHW reheat thermostat and
// priority, the room-temperature limiter, minimum-modulation cycling, summer
// cutoff and ramp-rate limiting.
//
// State is split in two, both owned by the caller:
//  - persistent (pstate): {ITerm, error, ITerm_outer, error_outer} — the PI
//    integrators, which warm-start across simulation runs and are reset by
//    the summer cutoff.
//  - per-run (rstate): {heatpump_state, last_on_time, max_roomT_state,
//    dhw_reheat_state} — created fresh for each simulation run.
//
// Framework-free: loaded by the browser app via a script tag and by Node
// (harness/tests) via require().
// ============================================================================

var controller = (function () {
    "use strict";

    var AUTO_ADAPT = 0;
    var WEATHER_COMP_CURVE = 1;
    var CASCADE_PI = 2;
    var FIXED_SPEED = 3;

    // Snapshot the control + heat pump config into flat per-run params
    function setup(control, heatpump, timestep) {
        return {
            mode: control.mode,
            Kp: control.Kp,
            Ki: control.Ki,
            wc_use_outside_mean: control.wc_use_outside_mean,
            curve: control.curve,
            limit_by_roomT: control.limit_by_roomT,
            roomT_hysteresis: control.roomT_hysteresis,
            fixed_compressor_speed: control.fixed_compressor_speed,
            cascade_outer_Kp: control.cascade_outer_Kp,
            cascade_outer_Ki: control.cascade_outer_Ki,
            cascade_outer_max_flowT: control.cascade_outer_max_flowT,
            cascade_inner_Kp: control.cascade_inner_Kp,
            cascade_inner_Ki: control.cascade_inner_Ki,
            capacity: heatpump.capacity,
            minimum_modulation: heatpump.minimum_modulation,
            ramp_rate: heatpump.ramp_rate,
            timestep: timestep
        };
    }

    function init_persistent_state() {
        return { ITerm: 0, error: 0, ITerm_outer: 0, error_outer: 0 };
    }

    function init_run_state() {
        return {
            heatpump_state: 0,
            last_on_time: 0,
            max_roomT_state: 0,
            dhw_reheat_state: 0
        };
    }

    // One control decision.
    // inp: {time, hour, days, setpoint, room, outside, ext_mid,
    //       flow_temperature — at the heat pump's own flow sensor,
    //       dhw_active, dhw_setpoint, dhw_modulation, cyl_stat_T,
    //       last_heat — the heat output the unit ended the previous step on
    //       (after any flow-temperature cap), which the ramp limits against}
    // Returns {heat: condenser output W for this step, dhw_mode}.
    function step(P, pstate, rstate, inp) {
        var timestep = P.timestep;
        var setpoint = inp.setpoint;
        var room = inp.room;
        var heatpump_heat_target = 0;
        var flowT_target;
        var PTerm;

        // DHW reheat thermostat with hysteresis, sensing the stat node
        if (inp.dhw_active) {
            if (rstate.dhw_reheat_state == 0 && inp.cyl_stat_T < inp.dhw_setpoint - inp.dhw_hysteresis) rstate.dhw_reheat_state = 1;
            if (rstate.dhw_reheat_state == 1 && inp.cyl_stat_T >= inp.dhw_setpoint) rstate.dhw_reheat_state = 0;
        } else {
            rstate.dhw_reheat_state = 0;
        }

        if (P.mode == AUTO_ADAPT) {
            // PI control on room temperature (a derivative term was never
            // implemented). Kp: find the unstable oscillation point and
            // divide in half.
            pstate.error = setpoint - room;

            // Option: explore control based on flow temp target
            // error = max_flowT - flow_temperature

            PTerm = P.Kp * pstate.error;
            pstate.ITerm += pstate.error * timestep;

            var max_ITerm = P.capacity / P.Ki;
            if (pstate.ITerm > max_ITerm) pstate.ITerm = max_ITerm;
            if (pstate.ITerm < 0) pstate.ITerm = 0;

            heatpump_heat_target = PTerm + (P.Ki * pstate.ITerm);
            if (!isFinite(heatpump_heat_target)) heatpump_heat_target = 0;

        } else if (P.mode == CASCADE_PI) {

            // Outer PI loop: room temperature error -> flow temperature target
            pstate.error_outer = setpoint - room;
            pstate.ITerm_outer += pstate.error_outer * timestep;

            // Clamp outer ITerm so the flow temp target stays within [setpoint, max_flowT]
            var cascade_flowT_min = setpoint;
            var max_ITerm_outer = (P.cascade_outer_max_flowT - cascade_flowT_min) / P.cascade_outer_Ki;
            if (pstate.ITerm_outer > max_ITerm_outer) pstate.ITerm_outer = max_ITerm_outer;
            if (pstate.ITerm_outer < 0) pstate.ITerm_outer = 0;

            var cascade_flowT_target = cascade_flowT_min
                + P.cascade_outer_Kp * pstate.error_outer
                + P.cascade_outer_Ki * pstate.ITerm_outer;

            // Clamp flow temp target to reasonable bounds
            if (cascade_flowT_target < cascade_flowT_min) cascade_flowT_target = cascade_flowT_min;
            if (cascade_flowT_target > P.cascade_outer_max_flowT) cascade_flowT_target = P.cascade_outer_max_flowT;

            flowT_target = cascade_flowT_target;

        } else if (P.mode == WEATHER_COMP_CURVE) {
            var used_outside = inp.outside;

            // Mean option only available in day mode not annual mode
            if (P.wc_use_outside_mean && inp.days == 1) {
                used_outside = inp.ext_mid;
            }

            // Simple weather compensation curve - flow temperature target is a
            // function of setpoint and outside temperature. Clamp temp
            // difference to 0 to avoid Math.pow(negative, 0.75) returning NaN
            // when outside > setpoint
            var wc_temp_diff = Math.max(0, setpoint - used_outside);
            flowT_target = setpoint + (2.8 * Math.pow(P.curve, 0.8)) * Math.pow(wc_temp_diff, 0.75);

            // Clamp flow temp target to reasonable bounds
            if (flowT_target < setpoint) flowT_target = setpoint;
            if (flowT_target > 80) flowT_target = 80; // Max flow temp of 80 degrees to prevent unrealistic targets

        } else if (P.mode == FIXED_SPEED) {
            heatpump_heat_target = 1.0 * P.capacity * (P.fixed_compressor_speed / 100);
        }

        // Inner cascade loop control (used by both weather compensation and cascade PI modes)
        if (P.mode == CASCADE_PI || P.mode == WEATHER_COMP_CURVE) {
            // Inner PI loop: flow temperature error -> heat demand
            pstate.error = flowT_target - inp.flow_temperature;
            pstate.ITerm += pstate.error * timestep;

            var max_ITerm_inner = P.capacity / P.cascade_inner_Ki;
            if (pstate.ITerm > max_ITerm_inner) pstate.ITerm = max_ITerm_inner;
            if (pstate.ITerm < 0) pstate.ITerm = 0;

            heatpump_heat_target = P.cascade_inner_Kp * pstate.error + P.cascade_inner_Ki * pstate.ITerm;
            if (!isFinite(heatpump_heat_target)) heatpump_heat_target = 0;
        }

        // Max temperature limit control - only applies in fixed speed or
        // weather compensation modes as in these modes we are not already
        // modulating heat pump output based on room temperature
        if (P.mode == WEATHER_COMP_CURVE || P.mode == FIXED_SPEED) {
            if (P.limit_by_roomT) {
                if (room > setpoint + (P.roomT_hysteresis * 0.5)) {
                    rstate.max_roomT_state = 1;
                }

                if (rstate.max_roomT_state == 1 && room < setpoint - (P.roomT_hysteresis * 0.5)) {
                    rstate.max_roomT_state = 0;
                }

                if (rstate.max_roomT_state == 1) {
                    heatpump_heat_target = 0;
                }
            }
        }

        // DHW priority: diverter valve sends all heat pump output to the
        // cylinder coil. The reheat runs at the schedule window's modulation
        // limit (an eco mode: e.g. 40% of capacity gives a slower reheat at
        // lower flow temperature and therefore better COP).
        var dhw_mode = false;
        if (rstate.dhw_reheat_state == 1) {
            dhw_mode = true;
            heatpump_heat_target = P.capacity * inp.dhw_modulation * 0.01;
        }

        // Apply limits
        if (heatpump_heat_target > P.capacity) {
            heatpump_heat_target = P.capacity;
        }
        if (heatpump_heat_target < 0) {
            heatpump_heat_target = 0;
        }

        // === Minimum modulation cycling control ===
        // if heat pump is off and demand for heat is more than minimum modulation turn heat pump on
        if (rstate.heatpump_state == 0 && heatpump_heat_target >= (P.capacity * P.minimum_modulation * 0.01)) {
            // turn on if we have been off for at least 10 minutes to prevent short cycling
            if (inp.time - rstate.last_on_time >= 600) {
                rstate.heatpump_state = 1;
            }
        }

        // If we are below minimum modulation turn heat pump off
        if (heatpump_heat_target < (P.capacity * P.minimum_modulation * 0.01) && rstate.heatpump_state == 1) {
            rstate.last_on_time = inp.time;
            rstate.heatpump_state = 0;
        }

        // Set heat pump heat to zero if state is off
        if (rstate.heatpump_state == 0) {
            heatpump_heat_target = 0;
        }
        // === End of minimum modulation control ===

        // Summer cutoff applies to space heating only, DHW reheat runs year round
        if (inp.outside > 15 && !dhw_mode) {
            rstate.heatpump_state = 0;
            heatpump_heat_target = 0;
            // Reset integrators when heat pump is off due to high outside
            // temperature to prevent windup that would prevent the heat pump
            // restarting in autumn
            pstate.ITerm = 0;
            pstate.ITerm_outer = 0;
            rstate.max_roomT_state = 0;
        }

        var heat;
        // Only apply ramp rate limiting if not fixed speed mode
        if (P.mode != FIXED_SPEED) {
            var min_modulation_watts = P.capacity * P.minimum_modulation * 0.01;
            // Use min_modulation as the ramp rate when starting from zero,
            // otherwise use ramp_rate % of capacity per timestep
            var max_step = inp.last_heat >= min_modulation_watts ? P.capacity * P.ramp_rate * 0.01 : min_modulation_watts;
            heat = Math.min(heatpump_heat_target, inp.last_heat + max_step);
        } else {
            heat = heatpump_heat_target;
        }

        return { heat: heat, dhw_mode: dhw_mode };
    }

    return {
        AUTO_ADAPT: AUTO_ADAPT,
        WEATHER_COMP_CURVE: WEATHER_COMP_CURVE,
        CASCADE_PI: CASCADE_PI,
        FIXED_SPEED: FIXED_SPEED,
        setup: setup,
        init_persistent_state: init_persistent_state,
        init_run_state: init_run_state,
        step: step
    };
})();

if (typeof module !== 'undefined') module.exports = controller;
