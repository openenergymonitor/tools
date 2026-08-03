// ============================================================================
// Hot water cylinder model
// ----------------------------------------------------------------------------
// Stratified multi-node cylinder (node 0 = bottom, node N-1 = top) ported
// from cylinder/cylinder_sim.js. The primary-side coil occupies the bottom
// coil_volume litres and exchanges heat via a per-node NTU effectiveness;
// draws are plug flow with thermostatic mixing at the tap; buoyancy mixes
// any temperature inversion.
//
// Framework-free: loaded by the browser app via a script tag and by Node
// (harness/tests) via require(). The caller owns the node temperature array
// (cyl_T) and an accounting object from start_accounting() that carries the
// energy-conservation bookkeeping and the delivered-energy accumulator.
// ============================================================================

var cylinder = (function () {
    "use strict";

    // Derive per-run constants from the dhw config and circuit opts
    // {flow_heat_capacity W/K, timestep s, draw_profile: [{start_hour,
    // duration_min, fraction}] — fractions of daily_volume at clock times}.
    // node_count is clamped; the caller should write params.node_count back
    // to the config so the UI reflects it.
    function setup(dhw, opts) {
        var flow_heat_capacity = opts.flow_heat_capacity;
        var timestep = opts.timestep;

        // Clamp node count to an integer between 2 and 40
        var node_count = Math.round(dhw.node_count);
        if (node_count < 2) node_count = 2;
        if (node_count > 40) node_count = 40;

        // Geometry: diameter derived from volume and height, r from V = pi r^2 H
        var volume_m3 = dhw.cylinder_volume / 1000;
        var height = dhw.cylinder_height;
        var radius = Math.sqrt(volume_m3 / (Math.PI * height));
        var area = Math.PI * radius * radius;                          // cross-section m2
        var perim = 2 * Math.PI * radius;                              // circumference m
        var dz = height / node_count;                                  // node thickness m

        var node_volume = dhw.cylinder_volume / node_count;            // Litres
        var node_heat_capacity = node_volume * 4187;                   // J/K

        // Coil occupies the bottom coil_volume litres of the tank (nodes 0..nCoil-1)
        var coil_nodes = Math.round(dhw.coil_volume / node_volume);
        if (coil_nodes < 1) coil_nodes = 1;
        if (coil_nodes > node_count) coil_nodes = node_count;

        // Per coil-node NTU effectiveness of the primary-to-tank heat
        // exchange, expressed as a conductance (W/K), capped so a node cannot
        // overshoot the primary temperature in a single timestep
        var coil_eps = 1 - Math.exp(-(dhw.coil_UA / coil_nodes) / flow_heat_capacity);
        var coil_WK = coil_eps * flow_heat_capacity;
        if (coil_WK > node_heat_capacity / timestep) coil_WK = node_heat_capacity / timestep;

        // Standing loss: wall U-value x side area per node, plus end caps on
        // the bottom and top nodes
        var node_loss_UA = [];
        for (var n = 0; n < node_count; n++) node_loss_UA[n] = dhw.wall_U * perim * dz;
        node_loss_UA[0] += dhw.wall_U * area;                          // bottom cap
        node_loss_UA[node_count - 1] += dhw.wall_U * area;             // top cap

        // Inter-node conduction: G = k_eff * A / dz
        var internode_WK = dhw.k_eff * area / dz;

        var stat_node = Math.min(node_count - 1, Math.floor(dhw.stat_height * node_count));

        // Draw profile into per-timestep litres at fixed clock times
        var draw_events = opts.draw_profile.map(function (ev) {
            return {
                start_hour: ev.start_hour,
                end_hour: ev.start_hour + ev.duration_min / 60,
                litres_per_step: (ev.fraction * dhw.daily_volume) / (ev.duration_min * 60 / timestep)
            };
        });

        return {
            node_count: node_count,
            node_volume: node_volume,
            node_heat_capacity: node_heat_capacity,
            coil_nodes: coil_nodes,
            coil_WK: coil_WK,
            node_loss_UA: node_loss_UA,
            internode_WK: internode_WK,
            stat_node: stat_node,
            cold_feed: dhw.cold_feed_temp,
            hysteresis: dhw.reheat_hysteresis,
            mix_temp: dhw.mixed_draw_temp,
            flow_max: dhw.flow_max,
            draw_events: draw_events,
            flow_heat_capacity: flow_heat_capacity,
            timestep: timestep
        };
    }

    // (Re)initialise the node temperature array if the node count changed,
    // otherwise leave it for a warm start. Returns the array to use.
    function init_state(params, cyl_T) {
        if (!cyl_T || cyl_T.length != params.node_count) {
            cyl_T = [];
            for (var n = 0; n < params.node_count; n++) cyl_T[n] = 40;
        }
        return cyl_T;
    }

    // Energy-conservation bookkeeping: the change in stored energy must equal
    // coil input - draws - standing losses. delivered_kwh accumulates the
    // energy drawn at the taps.
    function start_accounting(params, cyl_T) {
        var E_start = 0;
        for (var n = 0; n < params.node_count; n++) E_start += cyl_T[n] * params.node_heat_capacity;
        return {
            E_start: E_start,
            energy_in: 0,      // J, net external energy into the cylinder
            throughput: 0,     // J, sum of |flux|, scale for the residual tolerance
            delivered_kwh: 0
        };
    }

    // Coil exchange: march the primary down through the coil nodes (NTU
    // effectiveness per node) — the hottest primary meets the top coil node
    // first and cools as it descends. Returns the coil outlet temperature.
    // Called from inside the pipework sub-step loop while DHW mode is active.
    function coil_exchange(params, cyl_T, acct, Tf2, dt) {
        var Tf = Tf2;
        for (var n = params.coil_nodes - 1; n >= 0; n--) {
            var Q_coil = params.coil_WK * (Tf - cyl_T[n]);
            cyl_T[n] += (Q_coil * dt) / params.node_heat_capacity;
            Tf -= Q_coil / params.flow_heat_capacity;
            acct.energy_in += Q_coil * dt;
            acct.throughput += Math.abs(Q_coil) * dt;
        }
        return Tf;
    }

    // The per-timestep cylinder processes other than the coil: draws,
    // standing losses, inter-node conduction and buoyancy mixing.
    // Returns the standing loss in W (a heat gain to the room).
    function step_passive(params, cyl_T, acct, hour, room) {
        var node_count = params.node_count;
        var node_heat_capacity = params.node_heat_capacity;
        var timestep = params.timestep;
        var n;

        // Hot water draws: thermostatic mixing at the tap — only the hot
        // fraction f = (Tmix - Tcold) / (Ttop - Tcold) of the mixed volume is
        // drawn from the top of the cylinder (all hot if the top can't reach
        // Tmix). Plug flow: each node's water moves up one place, cold feed
        // enters the bottom. Processed in chunks of at most one node volume
        // so large draws stay stable and see the falling top temperature.
        var draw_litres = 0;
        for (var d = 0; d < params.draw_events.length; d++) {
            if (hour >= params.draw_events[d].start_hour && hour < params.draw_events[d].end_hour) {
                draw_litres += params.draw_events[d].litres_per_step;
            }
        }
        var remaining_draw = draw_litres;
        while (remaining_draw > 0) {
            var chunk = Math.min(remaining_draw, params.node_volume);
            remaining_draw -= chunk;
            var Ttop = cyl_T[node_count - 1];
            var f_hot = 1;
            if (Ttop > params.mix_temp) {
                f_hot = (params.mix_temp - params.cold_feed) / (Ttop - params.cold_feed);
                if (f_hot < 0) f_hot = 0;
            }
            var hot_litres = f_hot * chunk;
            if (hot_litres <= 0) break;
            var draw_energy = hot_litres * 4187 * (Ttop - params.cold_feed);
            acct.delivered_kwh += draw_energy / 3600000;
            acct.energy_in -= draw_energy;
            acct.throughput += Math.abs(draw_energy);
            var f = hot_litres / params.node_volume;
            for (n = node_count - 1; n > 0; n--) {
                cyl_T[n] += f * (cyl_T[n - 1] - cyl_T[n]);
            }
            cyl_T[0] += f * (params.cold_feed - cyl_T[0]);
        }

        // Cylinder standing losses to the room (credited as an internal gain
        // by the caller)
        var cyl_loss = 0;
        for (n = 0; n < node_count; n++) {
            var node_loss = params.node_loss_UA[n] * (cyl_T[n] - room);
            cyl_T[n] -= (node_loss * timestep) / node_heat_capacity;
            cyl_loss += node_loss;
        }
        acct.energy_in -= cyl_loss * timestep;
        acct.throughput += Math.abs(cyl_loss) * timestep;

        // Conduction between adjacent nodes: G = k_eff * A / dz
        // (internal flux, cancels in the energy balance)
        for (n = 0; n < node_count - 1; n++) {
            var q_cond = params.internode_WK * (cyl_T[n + 1] - cyl_T[n]);
            cyl_T[n + 1] -= (q_cond * timestep) / node_heat_capacity;
            cyl_T[n] += (q_cond * timestep) / node_heat_capacity;
        }

        // Buoyancy: mix any inversion (lower node hotter than the one above)
        // to the mean, sweeping until the profile is stable. Equal node
        // masses, so a simple average conserves energy.
        var unstable = true;
        var passes = 0;
        while (unstable && passes < node_count * 10) {
            unstable = false;
            passes++;
            for (n = 0; n < node_count - 1; n++) {
                if (cyl_T[n] > cyl_T[n + 1] + 1e-9) {
                    var mixT = (cyl_T[n] + cyl_T[n + 1]) * 0.5;
                    cyl_T[n] = mixT;
                    cyl_T[n + 1] = mixT;
                    unstable = true;
                }
            }
        }

        return cyl_loss;
    }

    // Self-test: the change in stored energy must equal the net external
    // energy in (coil - draws - standing losses). Conduction and buoyancy
    // mixing are internal and must cancel.
    function conservation_check(params, cyl_T, acct) {
        var E_end = 0;
        for (var n = 0; n < params.node_count; n++) E_end += cyl_T[n] * params.node_heat_capacity;
        var residual = (E_end - acct.E_start) - acct.energy_in;
        var rel_residual = Math.abs(residual) / (acct.throughput + Math.abs(acct.E_start));
        return { residual: residual, rel_residual: rel_residual };
    }

    return {
        setup: setup,
        init_state: init_state,
        start_accounting: start_accounting,
        coil_exchange: coil_exchange,
        step_passive: step_passive,
        conservation_check: conservation_check
    };
})();

if (typeof module !== 'undefined') module.exports = cylinder;
