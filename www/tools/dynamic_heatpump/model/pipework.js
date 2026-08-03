// ============================================================================
// Primary pipework model
// ----------------------------------------------------------------------------
// Finite-volume model of the primary pipework between the heat pump and the
// building entry, ported from primary-pipework-simulator.html. Each leg is
// split into DX metre cells (water + pipe wall heat capacity) with upwind
// advection when the pump runs and free cool-down when it stops, so transport
// delay, warm-front propagation and stagnant losses all emerge naturally.
//
// The circuit modelled here is:
//
//   condenser -> unit volume (Th) -> [M1] -> flow leg cells -> [M2] ->
//   diverter: emitter node (Te) or DHW coil -> return leg cells -> unit
//
// Metering point 1 (M1) sits at the heat pump connections, metering point 2
// (M2) at the building entry after the primary pipework.
//
// Framework-free: loaded by the browser app via a script tag and by Node
// (harness/tests) via require(). Holds no state of its own — the caller owns
// a state object {sig, flow, ret, Th, Te} passed to init_state()/step().
// ============================================================================

var pipework = (function () {
    "use strict";

    var DX = 0.5; // finite volume cell length (m)
    var PIPES = { // inner diameter m, copper wall heat capacity J/K per m
        "22": { id: 0.0202, wallC: 205 },
        "28": { id: 0.0262, wallC: 264 },
        "35": { id: 0.0327, wallC: 385 }
    };
    var INSUL = { bare: 1.2, "13": 0.30, "19": 0.23, "25": 0.19 }; // U' W/m.K
    // Segment types for the segmented path: inner diameter m, wall heat
    // capacity J/K per m (MDPE walls carry over twice the heat capacity of
    // copper), U' = 2*pi*lambda/ln(r2/r1) W/m.K
    var SEGTYPES = {
        cu28_pp19: { label: "28mm Cu + 19mm Primary Pro", id: 0.0262, wallC: 264, u: 0.2565 },
        cu28_25:   { label: "28mm Cu + 25mm nitrile",     id: 0.0262, wallC: 264, u: 0.19 },
        cu28_bare: { label: "28mm Cu bare",               id: 0.0262, wallC: 264, u: 1.2 },
        mdpe32_75: { label: "32mm MDPE in 75mm jacket",   id: 0.026,  wallC: 591, u: 0.2582 },
        cu22_pp19: { label: "22mm Cu + 19mm Primary Pro", id: 0.0202, wallC: 205, u: 0.30 }
    };

    // Build per-cell property arrays for the one-way path (heat pump ->
    // building). amb: null means every cell tracks the live outside air
    // temperature (simple mode); in segmented mode each cell has its own
    // fixed ambient (e.g. ground temperature for buried MDPE).
    function build_path(primary) {
        var cap = [], u = [], amb = [], areas = [];
        if (primary.mode != "segmented") {
            var pd = PIPES[primary.pipe];
            var area = Math.PI * pd.id * pd.id / 4;
            var n = Math.max(2, Math.round(primary.length / DX));
            for (var j = 0; j < n; j++) {
                cap.push((area * 1000 * 4187 + pd.wallC) * DX);
                u.push(INSUL[primary.insulation]);
                areas.push(area);
            }
            return {
                N: n,
                cap: Float64Array.from(cap),
                u: Float64Array.from(u),
                amb: null,
                area: Float64Array.from(areas)
            };
        }
        for (var s = 0; s < primary.segments.length; s++) {
            var sg = primary.segments[s];
            var t = SEGTYPES[sg.type];
            var nseg = Math.max(1, Math.round(sg.len / DX));
            var a = Math.PI * t.id * t.id / 4;
            for (var k = 0; k < nseg; k++) {
                cap.push((a * 1000 * 4187 + t.wallC) * DX);
                u.push(t.u);
                amb.push(sg.amb * 1);
                areas.push(a);
            }
        }
        while (cap.length < 2) {
            cap.push(cap[0]); u.push(u[0]); amb.push(amb[0]); areas.push(areas[0]);
        }
        return {
            N: cap.length,
            cap: Float64Array.from(cap),
            u: Float64Array.from(u),
            amb: Float64Array.from(amb),
            area: Float64Array.from(areas)
        };
    }

    // Derive the per-run constants from a primary pipework config and the
    // circuit opts {flow_heat_capacity W/K, timestep s, emitter_C J/K,
    // rad_W rated radiator output, rad_DT rated radiator delta-T}.
    //
    // Advection sub-stepping: the building timestep is far larger than the
    // pipe cell transport time, so while the pump runs the pipework advances
    // in sub-steps sized to keep the upwind advection fraction below 0.9
    // (and no longer than 2 s).
    // The advection fraction is mcp*dt/cap rather than v*dt/DX: the warm
    // front travels slower than the water because it heats the pipe wall as
    // it advances, and with this scaling every cell-boundary energy exchange
    // is exactly mcp*dT, so the scheme conserves energy and the M1/M2 heat
    // metering ties up with the reported pipework loss.
    function setup(primary, opts) {
        var path = build_path(primary);
        var N = path.N;
        var flow_heat_capacity = opts.flow_heat_capacity;
        var timestep = opts.timestep;

        // Heat pump internal volume node (+10% for HX metal), losing heat to
        // its ambient like an equivalent length of the first pipe cell
        var Ch = Math.max(0.5, primary.unit_volume) / 1000 * 1000 * 4187 * 1.1;
        var UAh = path.u[0] * (primary.unit_volume / 1000) / path.area[0];

        var fmax = 1e-9; // largest advection fraction per second across the path
        for (var c = 0; c < N; c++) fmax = Math.max(fmax, flow_heat_capacity / path.cap[c]);
        var nsub = Math.max(1, Math.ceil(timestep / Math.min(2, 0.9 / fmax)));
        var dt = timestep / nsub;
        // Per-cell advection fractions for flow and return legs (return cell
        // i sits at path position N-1-i: ret[0] at the building, ret[N-1] at
        // the heat pump)
        var fF = new Float64Array(N);
        var fR = new Float64Array(N);
        for (var c2 = 0; c2 < N; c2++) {
            fF[c2] = Math.min(1, flow_heat_capacity * dt / path.cap[c2]);
            fR[c2] = Math.min(1, flow_heat_capacity * dt / path.cap[N - 1 - c2]);
        }

        return {
            N: N, cap: path.cap, u: path.u, amb: path.amb, area: path.area,
            Ch: Ch, UAh: UAh, nsub: nsub, dt: dt, fF: fF, fR: fR,
            overrun_s: (primary.pump_overrun * 1 || 0) * 60,
            flow_heat_capacity: flow_heat_capacity,
            timestep: timestep,
            emitter_C: opts.emitter_C,
            rad_W: opts.rad_W,
            rad_DT: opts.rad_DT
        };
    }

    // (Re)initialise the caller-owned state {sig, flow, ret, Th, Te} if the
    // pipework configuration changed, otherwise leave it for a warm start.
    // fallback_amb is used for cells with no fixed ambient (simple mode).
    function init_state(params, primary, fallback_amb, room, state) {
        var sig = JSON.stringify([primary.mode, primary.length, primary.pipe,
            primary.insulation, primary.unit_volume, primary.segments]);
        if (state.sig !== sig || !state.flow || state.flow.length != params.N) {
            state.sig = sig;
            state.flow = new Float64Array(params.N);
            state.ret = new Float64Array(params.N);
            for (var c = 0; c < params.N; c++) {
                state.flow[c] = params.amb ? params.amb[c] : fallback_amb;
                state.ret[c] = params.amb ? params.amb[params.N - 1 - c] : fallback_amb;
            }
            state.Th = params.amb ? params.amb[0] : fallback_amb;
            state.Te = room;
        }
    }

    // Advance one building timestep.
    // inp: {pump_on, heat_W condenser output, dhw_mode, outside, room,
    //       coil(Tf2, dt) -> return temp — the DHW cylinder coil, used as the
    //       diverter sink instead of the emitter node while dhw_mode is true}
    // Returns per-step energies in J:
    //   E1 through metering point 1, E2 through metering point 2,
    //   Erad emitted by the radiators, Eloss lost to ambient by the
    //   primaries + unit volume.
    function step(P, S, inp) {
        var N = P.N, mcp = P.flow_heat_capacity, dt = P.dt;
        var cap = P.cap, u = P.u, amb = P.amb;
        var fF = P.fF, fR = P.fR;
        var outside = inp.outside, room = inp.room;
        var Ce = P.emitter_C;
        var E1_step = 0, E2_step = 0, Erad_step = 0, Eloss_step = 0;
        var amb_unit = amb ? amb[0] : outside;
        var c, m, q, af, ar, Delta_T, Prad, qh;

        if (inp.pump_on) {
            for (var s = 0; s < P.nsub; s++) {
                var ThIn = S.ret[N - 1];     // unit inlet from the return leg
                E1_step += mcp * (S.Th - ThIn) * dt;
                var Tf2 = S.flow[N - 1];     // flow temperature at the building entry

                // Diverter valve: the building return comes from either the
                // DHW coil or the emitter node
                var Tret_building;
                if (inp.dhw_mode) {
                    Tret_building = inp.coil(Tf2, dt);
                } else {
                    Tret_building = S.Te;
                }
                E2_step += mcp * (Tf2 - Tret_building) * dt;

                // Heat pump internal volume node
                S.Th += (mcp * (ThIn - S.Th) + inp.heat_W) * dt / P.Ch;

                // Advect flow leg (upstream = unit outlet)
                for (c = N - 1; c > 0; c--) S.flow[c] += fF[c] * (S.flow[c - 1] - S.flow[c]);
                S.flow[0] += fF[0] * (S.Th - S.flow[0]);

                // Emitter node & radiator output (isolated during DHW reheat).
                // While circulating, the radiators emit at the mean of the
                // incoming flow (Tf2) and the well-mixed node (the return),
                // matching the mean-emitter-temperature basis of DT50 ratings.
                Delta_T = (inp.dhw_mode ? S.Te : (Tf2 + S.Te) * 0.5) - room;
                if (Delta_T < 0) Delta_T = 0;
                Prad = P.rad_W * Math.pow(Delta_T / P.rad_DT, 1.3);
                if (inp.dhw_mode) {
                    S.Te -= Prad * dt / Ce;
                } else {
                    S.Te += (mcp * (Tf2 - S.Te) - Prad) * dt / Ce;
                }
                Erad_step += Prad * dt;

                // Advect return leg (upstream = building return)
                for (c = N - 1; c > 0; c--) S.ret[c] += fR[c] * (S.ret[c - 1] - S.ret[c]);
                S.ret[0] += fR[0] * (Tret_building - S.ret[0]);

                // Ambient losses: every pipe cell + the unit's internal volume
                for (c = 0; c < N; c++) {
                    af = amb ? amb[c] : outside;
                    q = u[c] * DX * dt * (S.flow[c] - af);
                    S.flow[c] -= q / cap[c]; Eloss_step += q;
                    m = N - 1 - c;
                    ar = amb ? amb[m] : outside;
                    q = u[m] * DX * dt * (S.ret[c] - ar);
                    S.ret[c] -= q / cap[m]; Eloss_step += q;
                }
                qh = P.UAh * (S.Th - amb_unit) * dt;
                S.Th -= qh / P.Ch; Eloss_step += qh;
            }
        } else {
            // Pump off: no advection — the radiators drain the emitter node
            // and the pipes + unit volume cool towards their ambients (loss
            // rates are small enough for a single building timestep to be
            // stable)
            Delta_T = S.Te - room;
            if (Delta_T < 0) Delta_T = 0;
            Prad = P.rad_W * Math.pow(Delta_T / P.rad_DT, 1.3);
            S.Te -= Prad * P.timestep / Ce;
            Erad_step = Prad * P.timestep;

            for (c = 0; c < N; c++) {
                af = amb ? amb[c] : outside;
                q = u[c] * DX * P.timestep * (S.flow[c] - af);
                S.flow[c] -= q / cap[c]; Eloss_step += q;
                m = N - 1 - c;
                ar = amb ? amb[m] : outside;
                q = u[m] * DX * P.timestep * (S.ret[c] - ar);
                S.ret[c] -= q / cap[m]; Eloss_step += q;
            }
            qh = P.UAh * (S.Th - amb_unit) * P.timestep;
            S.Th -= qh / P.Ch; Eloss_step += qh;
        }

        return { E1: E1_step, E2: E2_step, Erad: Erad_step, Eloss: Eloss_step };
    }

    return {
        DX: DX,
        PIPES: PIPES,
        INSUL: INSUL,
        SEGTYPES: SEGTYPES,
        build_path: build_path,
        setup: setup,
        init_state: init_state,
        step: step
    };
})();

if (typeof module !== 'undefined') module.exports = pipework;
