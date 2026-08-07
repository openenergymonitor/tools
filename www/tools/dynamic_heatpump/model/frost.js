// ============================================================================
// Evaporator frosting & reverse-cycle defrost model
// ----------------------------------------------------------------------------
// Single lumped frost-mass state with humidity-ratio-difference deposition and
// a mass-threshold triggered reverse-cycle defrost, following the reduced-order
// approach validated by Zanetti, Scoccia & Aprile (IBPSA BS2025) — see
// frost-literature.md for the full literature basis of each term.
//
// Frosting (compressor running, coil below 0C):
//   coil temperature = outside - coil_dt (measured 4-5 K on test units)
//   deposition = air_kg_s * (w_ambient - w_sat(coil)) * capture_eff
// Optionally (use_cop_evaporator) the coil temperature is taken from the COP
// model's own evaporating temperature instead of the fixed drop, where the
// selected model resolves one (the carnot and fitted models; the lookup-table
// models do not, and fall back to coil_dt). That makes the coil-air difference
// scale with compressor load rather than being held constant: near-zero at
// minimum modulation, 7-8 K at full output. Note the models report the
// refrigerant saturation temperature, which sits a little below the air-side
// fin surface the frost actually forms on, so capture_eff is the knob to
// re-calibrate on if you switch this on.
// using the Magnus saturation curve for both; capture_eff is the single
// calibrated composite knob (Lewis-analogy air-side effectiveness x over-ice
// correction x surface-temperature correction). The same law run backwards
// gives sublimation in cold-dry air while frost is present.
//
// Pre-defrost derating (per Dongellini et al., CLIMA 2019): available capacity
// falls linearly with frost fraction to (1 - derate_max) at the trigger point
// with electric input unchanged, so COP falls by the same factor. Assumes
// datasheet COP tables are frost-free.
//
// Defrost (frost_mass >= threshold): heat is drawn from the heating circuit at
// defrost_power. A fixed per-cycle overhead (cycle reversal + sensible reheat
// of the coil metal, Ma et al. 2023: defrost efficiency 30% light vs 56% heavy
// frost) is worked through first, then frost melts at
// defrost_power * melt_eff / 334 kJ/kg. Exits when melted, or at the 20 min
// safety cap with the residual frost retained (refreeze).
//
// Framework-free: loaded by the browser app via a script tag and by Node
// (harness/tests) via require(). The caller owns the state object from
// init_state(), which warm-starts across simulation runs.
// ============================================================================

var frost = (function () {
    "use strict";

    var LATENT_FUSION = 334000;   // J/kg
    var MASS_EPSILON = 0.001;     // kg, below this frost counts as gone

    // Magnus saturation vapour pressure over water (Pa), T in Celsius
    function sat_vp(T) {
        return 610.94 * Math.exp(17.625 * T / (T + 243.04));
    }

    // Humidity ratio (kg water per kg dry air) from vapour pressure
    function humidity_ratio(vp) {
        return 0.622 * vp / (101325 - vp);
    }

    // Derive per-run constants from the frost config. opts: {timestep s}.
    // A missing config disables the model (older saved configs).
    function setup(cfg, opts) {
        if (!cfg) return { enabled: false };

        var rh = cfg.humidity * 1;
        if (!(rh >= 20)) rh = 20;
        if (rh > 100) rh = 100;

        return {
            enabled: !!cfg.enabled,
            use_csv_humidity: !!cfg.use_csv_humidity,
            rh: rh,
            air_kg_s: (cfg.airflow / 3600) * 1.25,
            capture_eff: cfg.capture_eff * 1,
            coil_dt: cfg.coil_dt * 1,
            use_cop_evaporator: !!cfg.use_cop_evaporator,
            threshold: Math.max(0.1, cfg.threshold * 1),
            defrost_power: cfg.defrost_power * 1,
            defrost_elec: cfg.defrost_elec * 1,
            melt_eff: cfg.melt_eff * 1,
            overhead_j: (cfg.overhead_kj * 1 || 0) * 1000,
            derate_max: Math.min(0.5, Math.max(0, cfg.derate_max * 0.01)),
            max_defrost_s: 1200,
            timestep: opts.timestep
        };
    }

    function init_state() {
        return {
            mass: 0,        // kg of frost on the evaporator
            defrosting: 0,  // 1 while a reverse-cycle defrost runs
            defrost_t: 0,   // s elapsed in the current defrost
            preheat_j: 0    // J of per-cycle overhead still to work through
        };
    }

    // One timestep. inp: {running — compressor delivering heat, outside C,
    // humidity %RH, evaporator C — optional modelled evaporating temperature,
    // used as the coil temperature when use_cop_evaporator is on}. Returns
    // {defrosting, capacity_factor, started}; while defrosting is true the
    // caller zeroes the heat output and draws defrost_power from the heating
    // circuit.
    function step(P, S, inp) {
        var started = false;

        if (S.defrosting) {
            S.defrost_t += P.timestep;
            var E = P.defrost_power * P.timestep;
            if (S.preheat_j > 0) {
                var used = Math.min(S.preheat_j, E);
                S.preheat_j -= used;
                E -= used;
            }
            if (E > 0) {
                S.mass -= E * P.melt_eff / LATENT_FUSION;
            }
            if (S.mass <= MASS_EPSILON) {
                S.mass = 0;
                S.defrosting = 0;
            } else if (S.defrost_t >= P.max_defrost_s) {
                // Safety cap: exit with the residual retained (it refreezes
                // and shortens the next cycle)
                S.defrosting = 0;
            }
        } else if (inp.running) {
            // Coil temperature driving deposition: the modelled evaporating
            // temperature where enabled and available, otherwise the fixed
            // drop below outside air
            var T_coil = (P.use_cop_evaporator && typeof inp.evaporator === "number")
                ? inp.evaporator
                : inp.outside - P.coil_dt;
            if (T_coil < 0) {
                var w_amb = humidity_ratio(sat_vp(inp.outside) * inp.humidity * 0.01);
                var w_coil = humidity_ratio(sat_vp(T_coil));
                var dw = w_amb - w_coil;
                // Deposition when the air is moister than saturation at the
                // coil; sublimation when drier while frost is present
                if (dw > 0 || S.mass > 0) {
                    S.mass += P.air_kg_s * dw * P.capture_eff * P.timestep;
                    if (S.mass < MASS_EPSILON) S.mass = 0;
                }
            } else if (S.mass > 0) {
                // Coil above freezing with the fan running: frost melts off
                // naturally — same air-side effectiveness, sensible heat
                // driving the melt
                S.mass -= P.air_kg_s * 1006 * P.capture_eff * T_coil * P.timestep / LATENT_FUSION;
                if (S.mass < MASS_EPSILON) S.mass = 0;
            }
            if (S.mass >= P.threshold) {
                S.defrosting = 1;
                S.defrost_t = 0;
                S.preheat_j = P.overhead_j;
                started = true;
            }
        } else if (S.mass > 0 && inp.outside > 0) {
            // Unit off in above-freezing air: natural-convection melt at a
            // tenth of the fan-on rate (fan stopped, coil near air temp)
            S.mass -= 0.1 * P.air_kg_s * 1006 * P.capture_eff * inp.outside * P.timestep / LATENT_FUSION;
            if (S.mass < MASS_EPSILON) S.mass = 0;
        }

        // Pre-defrost derating: linear in frost fraction
        var capacity_factor = 1;
        if (!S.defrosting && S.mass > 0) {
            var f = S.mass / P.threshold;
            if (f > 1) f = 1;
            capacity_factor = 1 - P.derate_max * f;
        }

        return {
            defrosting: S.defrosting == 1,
            capacity_factor: capacity_factor,
            started: started
        };
    }

    return {
        setup: setup,
        init_state: init_state,
        step: step
    };
})();

if (typeof module !== 'undefined') module.exports = frost;
