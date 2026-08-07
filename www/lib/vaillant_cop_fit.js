/**
 * Continuous semi-physical COP model for Vaillant Arotherm+ (5 kW & 12 kW),
 * fitted to the manufacturer's datasheet lookup tables (390 + 365 points).
 *
 * Structure:
 *
 *   COP = eta * frost * Tc / (Tc - Te)          <- Carnot with offsets
 *
 *   Tc = Tflow + 273.15 + dTc                    condensing temp [K]
 *   Te = Tamb  + 273.15 - dTe                    evaporating temp [K]
 *   dTc = 4 * qhat                               condenser approach, K
 *   dTe = 7 * qhat                               evaporator approach, K
 *       (approach temps scale with load: dT ~ Q/UA; fixed at 4 K and 7 K
 *        at nominal output, which is physically typical for R290 ASHPs)
 *   qhat = Q / Qnom                              load fraction
 *
 *   eta (fitted second-law / compressor efficiency curve, typ. 0.35-0.50):
 *     z   = (L - 45) / 45,  L = Tc - Te  (temperature lift, K)
 *     w   = (Tflow - 50) / 15
 *     eta = (e0 + e1*qhat + e2*qhat^2 + exz*qhat*z)      part-load curve
 *         * (1 + a1*z + a2*z^2 + a3*z^3)                 lift dependence
 *         * (1 + b1*w)                                   flow-temp correction
 *
 *   frost = 1 - fA * exp(-0.5*((Tamb - fMu)/fSig)^2)     defrost penalty dip
 *       (broad ~5-7% dip centred a little below 0C for the 5 kW unit;
 *        essentially absent from the 12 kW tables)
 *
 * Fit quality vs the datasheet tables (fitted on relative error):
 *   5 kW : MAPE 6.5 %, RMSE 0.23, max |err| 0.85 COP  (82 % of pts within 10 %)
 *   12 kW: MAPE 5.6 %, RMSE 0.22, max |err| 0.80 COP  (87 % of pts within 10 %)
 * For context, the tables' own noise floor (0.1-COP rounding + defrost steps)
 * is ~2 % MAPE, and errors concentrate at the envelope corners (ambient
 * +20 C and -20/-15 C); in the core heating range (-7..+12 C ambient) the
 * model is typically within ~5 %.
 *
 * Same argument order as getCOP(modelData, flow, ambient, output), but takes
 * the model name string instead of the data object.
 *
 * The COP functions below return { cop, evaporator, condenser }, the two
 * temperatures in degC, so a caller can reuse the model's own refrigerant-side
 * operating point (e.g. a frost model needing the evaporator temperature)
 * rather than assuming a fixed offset from the air/flow temperatures.
 */

var vaillant_cop_fit_params = {
    // [e0, e1, e2, exz, a1, a2, a3, b1, fA, fMu, fSig, Qnom]
    "5kW":  [0.29796, 0.34580, -0.14278, 0.21528,
             -0.36836, 0.39579, -0.53194, -0.09262,
             0.06790, -2.0, 6.0, 5.0],
    "12kW": [0.35750, 0.40685, -0.22836, 0.22177,
             -0.53664, -0.46257, 0.60862, -0.04182,
             0.00154, -2.0, 1.5, 12.0]
};

/**
 * Continuous COP model.
 * @param {string} model "5kW" or "12kW"
 * @param {number} flowTemp    outlet/flow temperature, degC
 * @param {number} ambientTemp outside air temperature, degC
 * @param {number} outputKW    heat output, kW
 * @param {boolean} [includeFrost=true]
 *        true  -> reproduces the datasheet tables (defrost penalty embedded,
 *                 significant only for the 5 kW unit: ~7% dip centred -2 C).
 *        false -> "pre-defrost" COP: the frost factor is forced to 1, giving
 *                 the underlying frost-free performance surface. Use this if
 *                 your simulator applies its own frost build-up / defrost
 *                 model, otherwise the penalty is double counted.
 *                 (The 12 kW tables show no embedded defrost signature, so
 *                 for that unit the two variants are near-identical.)
 * @returns {{cop: number, evaporator: number, condenser: number}}
 *          COP plus the evaporating and condensing temperatures, degC
 */
function copFit(model, flowTemp, ambientTemp, outputKW, includeFrost = true) {
    const p = vaillant_cop_fit_params[model];
    if (!p) throw new Error("Unknown model: " + model);
    const [e0, e1, e2, exz, a1, a2, a3, b1, fA, fMu, fSig, Qnom] = p;

    const qh = outputKW / Qnom;

    // Carnot with load-dependent approach-temperature offsets
    const Tc = flowTemp + 273.15 + 4.0 * qh;
    const Te = ambientTemp + 273.15 - 7.0 * qh;
    const L  = Math.max(Tc - Te, 5.0);           // temperature lift, K

    // Fitted efficiency curve
    const z = (L - 45.0) / 45.0;
    const w = (flowTemp - 50.0) / 15.0;
    const eta = (e0 + e1 * qh + e2 * qh * qh + exz * qh * z)
              * (1.0 + a1 * z + a2 * z * z + a3 * z * z * z)
              * (1.0 + b1 * w);

    // Defrost / frosting penalty (embedded in the 5 kW datasheet tables)
    const frost = includeFrost
        ? 1.0 - fA * Math.exp(-0.5 * Math.pow((ambientTemp - fMu) / fSig, 2))
        : 1.0;

    return {
        cop: eta * frost * Tc / L,
        evaporator: Te - 273.15,
        condenser: Tc - 273.15
    };
}

// Convenience: Carnot COP and implied second-law efficiency, if useful elsewhere
function carnotCOP(flowTemp, ambientTemp) {
    const Tc = flowTemp + 273.15;
    return Tc / Math.max(flowTemp - ambientTemp, 1.0);
}

/* ------------------------------------------------------------------------
 * GENERIC MODEL (capacity generalisation)
 *
 * A single parameter set fitted jointly to both units in normalised-load
 * space reproduces BOTH tables at ~7.0% MAPE (vs 5.6-6.5% for the
 * unit-specific fits above). Cross-applying one unit's parameters to the
 * other gives 8.7-10.2%, so the pooled set is the better transfer vehicle.
 *
 * Usage tiers:
 *  1. Other Arotherm+ sizes (3.5 / 7 / 10 kW): use as-is with the unit's
 *     nominal capacity as qnomKW. Expect ~7% typical error.
 *  2. Other inverter air-source monoblocs (R290/R32): keep the shape and
 *     calibrate etaScale from one or more datasheet rating points
 *     (e.g. A7/W35, A2/W35, A-7/W35) via calibrateEtaScale() below.
 *  3. NOT suitable for: fixed-speed units (part-load curve wrong),
 *     ground-source (different offsets/frost), CO2/R744 transcritical
 *     (Carnot form itself breaks down).
 *
 * Frost defaults to OFF here, since the generic model is intended for
 * simulators supplying their own frost/defrost treatment. The pooled frost
 * parameters are included for completeness (mostly inherited from the 5 kW
 * tables; the 12 kW tables contain no defrost signature).
 * ---------------------------------------------------------------------- */

var vaillant_generic_params =
    // [e0, e1, e2, exz, a1, a2, a3, b1, fA, fMu, fSig]
    [0.32497, 0.35205, -0.16327, 0.24436,
     -0.48360, 0.04104, -0.02819, -0.06901,
     0.03291, -2.0, 5.6935];

/**
 * Generic capacity-normalised COP model.
 * @param {number} qnomKW      nominal heating capacity of the unit, kW
 * @param {number} flowTemp    outlet/flow temperature, degC
 * @param {number} ambientTemp outside air temperature, degC
 * @param {number} outputKW    heat output, kW
 * @param {object} [opts]      { etaScale = 1.0, includeFrost = false }
 * @returns {{cop: number, evaporator: number, condenser: number}}
 *          COP plus the evaporating and condensing temperatures, degC
 */
function copFitGeneric(qnomKW, flowTemp, ambientTemp, outputKW, opts = {}) {
    const { etaScale = 1.0, includeFrost = false } = opts;
    const [e0, e1, e2, exz, a1, a2, a3, b1, fA, fMu, fSig] = vaillant_generic_params;

    const qh = outputKW / qnomKW;
    const Tc = flowTemp + 273.15 + 4.0 * qh;
    const Te = ambientTemp + 273.15 - 7.0 * qh;
    const L  = Math.max(Tc - Te, 5.0);

    const z = (L - 45.0) / 45.0;
    const w = (flowTemp - 50.0) / 15.0;
    const eta = etaScale
              * (e0 + e1 * qh + e2 * qh * qh + exz * qh * z)
              * (1.0 + a1 * z + a2 * z * z + a3 * z * z * z)
              * (1.0 + b1 * w);

    const frost = includeFrost
        ? 1.0 - fA * Math.exp(-0.5 * Math.pow((ambientTemp - fMu) / fSig, 2))
        : 1.0;

    return {
        cop: eta * frost * Tc / L,
        evaporator: Te - 273.15,
        condenser: Tc - 273.15
    };
}

/**
 * Calibrate etaScale for a different heat pump from datasheet rating points.
 * Least-squares in log space over the provided points.
 * @param {number} qnomKW nominal capacity, kW
 * @param {Array}  points e.g. [{flow:35, ambient:7, outputKW:5.0, cop:4.7},
 *                              {flow:35, ambient:2, outputKW:4.6, cop:3.8}]
 *        Note: use rating points measured EXCLUDING defrost if you intend to
 *        run with includeFrost=false; A7/W35 and mild-weather points are
 *        safest (outside the frost band).
 * @returns {number} etaScale to pass to copFitGeneric
 */
function calibrateEtaScale(qnomKW, points) {
    let s = 0;
    for (const pt of points) {
        const base = copFitGeneric(qnomKW, pt.flow, pt.ambient, pt.outputKW, { etaScale: 1.0 }).cop;
        s += Math.log(pt.cop / base);
    }
    return Math.exp(s / points.length);
}

/* ------------------------------------------------------------------------
 * SPEED BACK-CALCULATION + SPEED-BASED GENERIC MODEL (v2)
 *
 * Normalised volumetric capacity c = Q/(rps * Qnom) collapses onto a single
 * curve for both units (suction density is refrigerant physics, displacement
 * scales with capacity), so compressor speed can be inferred from
 * (Q, ambient, flow, Qnom) at ~7% accuracy for any unit in the family:
 *
 *   rps = Q / (Qnom * c(Ta,Tf)),  c = (c0+c1*Ta+c2*Ta^2)*(1+c3*(Tf-50))
 *
 * The v2 efficiency curve is a polynomial in inferred speed rather than load
 * fraction, which fixes most of the cold high-speed corner error (5 kW
 * 35C tab: +14% -> +1.5%). Fitted with the frost amplitude free, the pooled
 * fit chose fA = 0, i.e. v2 is natively a pre-defrost surface.
 * Remaining known weakness: underprediction at mild ambient (+10..+20 C)
 * for the 5 kW (~ -10..-16%), the flip side of fitting across the
 * EN 14511 wet/dry-coil boundary at ~+7 C.
 * ---------------------------------------------------------------------- */

var vaillant_capacity_params = [1.070e-2, 2.889e-4, 6.495e-7, -9.330e-3];

// Compressor modulation range for the Arotherm+ family (both tabulated units
// span 30-120 rps; override maxRps per unit if a datasheet says otherwise).
var VAILLANT_MIN_RPS = 30;
var VAILLANT_MAX_RPS = 120;

var vaillant_generic_v2_params =
    // [e0, e1, e2, exz, a1, a2, a3, b1]  (eta polynomial in s = rps/100)
    [0.24930, 0.74153, -0.48742, 0.66656,
     -1.05159, 0.32990, -0.03477, -0.00303];

/** Normalised volumetric capacity c(Ta,Tf) = Q/(rps*Qnom). Internal. */
function volumetricCapacity(flowTemp, ambientTemp) {
    const [c0, c1, c2, c3] = vaillant_capacity_params;
    return Math.max(
        (c0 + c1 * ambientTemp + c2 * ambientTemp * ambientTemp)
            * (1 + c3 * (flowTemp - 50.0)),
        1e-4);
}

/**
 * Estimate compressor speed from operating point.
 * @param {boolean} [clamp=false] clamp to [VAILLANT_MIN_RPS, VAILLANT_MAX_RPS].
 *        Leave false to detect out-of-envelope demand (rps < 30 implies
 *        on/off cycling; rps > max implies the output is not deliverable);
 *        use true (or copFitGenericV2, which clamps internally) for COP.
 *        Note: unclamped inference overshoots at the coldest extreme for
 *        larger units (their capacity curve sags less at -20 C than the
 *        shared fit), so treat raw rps near the limits as approximate.
 * @returns {number} rps
 */
function estimateSpeed(qnomKW, flowTemp, ambientTemp, outputKW, clamp = false) {
    const rps = outputKW / (qnomKW * volumetricCapacity(flowTemp, ambientTemp));
    return clamp ? Math.min(Math.max(rps, VAILLANT_MIN_RPS), VAILLANT_MAX_RPS) : rps;
}

/**
 * Modulation envelope: deliverable output range at a condition, from the
 * capacity model and the compressor speed limits.
 * Approximate: the true max is additionally limited by the operating
 * envelope (max flow temp vs ambient, power limits) at the extremes.
 * @returns {{minKW: number, maxKW: number}}
 */
function outputRange(qnomKW, flowTemp, ambientTemp, maxRps = VAILLANT_MAX_RPS) {
    const c = volumetricCapacity(flowTemp, ambientTemp);
    return { minKW: qnomKW * c * VAILLANT_MIN_RPS,
             maxKW: qnomKW * c * maxRps };
}

/**
 * Generic v2: speed-based efficiency curve, pre-defrost by construction.
 * Same interface as copFitGeneric; speed is inferred and clamped internally.
 * @returns {{cop: number, evaporator: number, condenser: number}}
 *          COP plus the evaporating and condensing temperatures, degC
 */
function copFitGenericV2(qnomKW, flowTemp, ambientTemp, outputKW, opts = {}) {
    const { etaScale = 1.0 } = opts;
    const [e0, e1, e2, exz, a1, a2, a3, b1] = vaillant_generic_v2_params;

    const qh = outputKW / qnomKW;
    const s  = estimateSpeed(qnomKW, flowTemp, ambientTemp, outputKW, true) / 100.0;

    const Tc = flowTemp + 273.15 + 4.0 * qh;
    const Te = ambientTemp + 273.15 - 7.0 * qh;
    const L  = Math.max(Tc - Te, 5.0);
    const z = (L - 45.0) / 45.0;
    const w = (flowTemp - 50.0) / 15.0;

    const eta = etaScale
              * (e0 + e1 * s + e2 * s * s + exz * s * z)
              * (1.0 + a1 * z + a2 * z * z + a3 * z * z * z)
              * (1.0 + b1 * w);

    return {
        cop: eta * Tc / L,
        evaporator: Te - 273.15,
        condenser: Tc - 273.15
    };
}

// Example:
// console.log(copFit("5kW", 45, 2, 4.0).cop.toFixed(2));   // ~2.9
// console.log(copFit("12kW", 35, 7, 9.6).cop.toFixed(2));  // ~5.0
// console.log(copFit("5kW", 45, 2, 4.0).evaporator.toFixed(1)); // ~-3.6 C
// const s = calibrateEtaScale(7.0, [{flow:35, ambient:7, outputKW:7.0, cop:4.8}]);
// console.log(copFitGeneric(7.0, 45, 2, 5.0, { etaScale: s }).cop.toFixed(2));
// console.log(estimateSpeed(5, 35, -7, 5.1).toFixed(0), 'rps (table: 97)');
// console.log(copFitGenericV2(5, 35, -7, 5.1).cop.toFixed(2));
// console.log(outputRange(5, 45, -7));   // {minKW, maxKW} at this condition

// module.exports = { copFit, carnotCOP, copFitGeneric, copFitGenericV2,
//                    estimateSpeed, outputRange, calibrateEtaScale,
//                    VAILLANT_MIN_RPS, VAILLANT_MAX_RPS,
//                    vaillant_cop_fit_params, vaillant_generic_params,
//                    vaillant_generic_v2_params, vaillant_capacity_params };