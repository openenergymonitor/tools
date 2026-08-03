// ============================================================================
// Building fabric model
// ----------------------------------------------------------------------------
// Three-layer thermal model of the building fabric: room air (layer 3) inside
// two mass layers, each with a conductance to the next and a heat capacity.
// Internal gains, radiator output, utilised solar gains and cylinder standing
// losses arrive in the room node; heat conducts outwards to the outside air.
//
// Solar gains utilisation: gains are progressively rejected (windows opened,
// blinds closed) as the room rises above the overheating threshold.
//
// The caller owns the state {room, t1, t2}, which warm-starts across
// simulation runs.
//
// Framework-free: loaded by the browser app via a script tag and by Node
// (harness/tests) via require().
// ============================================================================

var building = (function () {
    "use strict";

    // Flatten the fabric layer configs (WK conductance, kWhK capacity) and
    // gain settings into per-run params. opts: {overheating_temp, timestep}.
    function setup(bld, opts) {
        return {
            // Layer 1 (outermost):
            u1: bld.fabric[0].WK,
            k1: 3600000 * bld.fabric[0].kWhK,
            // Layer 2:
            u2: bld.fabric[1].WK,
            k2: 3600000 * bld.fabric[1].kWhK,
            // Layer 3 (room):
            u3: bld.fabric[2].WK,
            k3: 3600000 * bld.fabric[2].kWhK,
            metabolic_gains: bld.metabolic_gains,
            lac_gains: bld.lac_gains,
            solar_gains_scale: bld.solar_gains_scale,
            overheating_temp: opts.overheating_temp,
            timestep: opts.timestep
        };
    }

    function init_state(fabric) {
        return {
            t1: fabric[0].T,
            t2: fabric[1].T,
            room: fabric[2].T
        };
    }

    // One building timestep. inp: {radiator_heat W, cyl_loss W, solar W raw
    // dataset value, outside C}. Mutates S {room, t1, t2}; returns the solar
    // gain terms for the caller's accumulators.
    function step(P, S, inp) {
        var timestep = P.timestep;

        var solar_gains = inp.solar * P.solar_gains_scale * 0.9;
        // Limit solar gains if room temperature is above the overheating
        // threshold: linearly reduce gains as room temp rises, zero at 2
        // degrees above it
        var utilised_solar_gains = solar_gains;
        if (S.room > P.overheating_temp) {
            utilised_solar_gains = solar_gains * Math.max(0, 1 - ((S.room - P.overheating_temp) / 2));
        }

        var internal_gains = P.metabolic_gains + P.lac_gains;

        // 1. Calculate heat fluxes
        var h3 = (internal_gains + inp.radiator_heat + utilised_solar_gains + inp.cyl_loss) - (P.u3 * (S.room - S.t2));
        var h2 = P.u3 * (S.room - S.t2) - P.u2 * (S.t2 - S.t1);
        var h1 = P.u2 * (S.t2 - S.t1) - P.u1 * (S.t1 - inp.outside);

        // 2. Calculate change in temperature
        S.room += (h3 * timestep) / P.k3;
        S.t2 += (h2 * timestep) / P.k2;
        S.t1 += (h1 * timestep) / P.k1;

        return { solar_gains: solar_gains, utilised_solar_gains: utilised_solar_gains };
    }

    return {
        setup: setup,
        init_state: init_state,
        step: step
    };
})();

if (typeof module !== 'undefined') module.exports = building;
