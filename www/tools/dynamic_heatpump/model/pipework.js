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
    var PIPES = { // outer/inner diameter m, wall heat capacity J/K per m
        "22": { od: 0.022, id: 0.0202, wallC: 205 },
        "28": { od: 0.028, id: 0.0262, wallC: 264 },
        "35": { od: 0.035, id: 0.0327, wallC: 385 }
    };

    // ---- Insulation ---------------------------------------------------------
    // Every pipe loses heat at U', the linear heat loss coefficient of the
    // whole lagged assembly: W per metre of pipe RUN per K of pipe-to-ambient
    // temperature difference. U' is derived here from base conductivities
    // rather than tabulated, so it tracks pipe diameter correctly.
    //
    // For one concentric layer, U' = 2*pi*lambda/ln(r2/r1); layers in series
    // add as resistances, R = ln(r2/r1)/(2*pi*lambda), U' = 1/sum(R).
    //
    // U' and lambda share the unit W/m.K but are NOT the same quantity —
    // ln(r2/r1) is dimensionless, so lambda's unit passes through unchanged.
    // lambda is per metre of insulation THICKNESS (a material property); U' is
    // per metre of pipe LENGTH (a property of this pipe + this lagging).
    //
    // Worked example — Armaflex Class O 25 mm on 22 mm copper:
    //   r1 = 22mm OD / 2        = 0.011 m   (insulation bore = pipe OD)
    //   r2 = r1 + 25 mm         = 0.036 m
    //   ln(r2/r1) = ln(3.2727)  = 1.1856
    //   U' = 2*pi*0.038/1.1856  = 0.2014 W/m.K
    // i.e. the assembly loses 2*pi/ln(r2/r1) = 5.30x the foam's lambda figure
    // per metre of run; 10 m at dT 30 K is 0.2014*10*30 = 60 W. The same 25 mm
    // lagging on 28 mm copper gives 0.2330 — hence deriving rather than
    // tabulating.
    //
    // Both products' lambda is taken at 40 C mean insulation temperature.
    // That is the only basis Primary Pro publish, so Armaflex is quoted on the
    // same basis for a like-for-like comparison. It is the conservative end:
    // 45 C water in 0-5 C air gives a mean nearer 20-25 C, where both are lower.
    var LAMBDA = { // W/m.K
        // Armaflex Class O — elastomeric nitrile rubber.
        // 0.034 @ 0 C, 0.036 @ 20 C, 0.038 @ 40 C
        armaflex: 0.038,
        // Primary Pro — closed cell polyethylene, coated for external UV/water
        // exposure. 0.035 @ 40 C (BS EN 12667:2001, BS 5422:2023), datasheet
        // REV JULY 2025. Note this beats Armaflex at the same thickness.
        primarypro: 0.035,
        pe_foam: 0.035, // PE foam jacket of pre-insulated buried pipe
        mdpe:    0.40   // MDPE pipe wall (copper's is negligible, so omitted)
    };
    // Bare pipe loses through the surface film, not by conduction:
    // U' = h*pi*D. h ~ 13.6 W/m2K covers natural convection plus radiation on
    // a warm pipe in still indoor air, at the pessimistic end of the range.
    var H_BARE = 13.6; // W/m2.K

    // U' of a stack of concentric layers, W/m.K.
    // layers: [{r1, r2, lambda}, ...] radii in m, innermost first.
    function u_layers(layers) {
        var R = 0;
        for (var i = 0; i < layers.length; i++) {
            R += Math.log(layers[i].r2 / layers[i].r1) / (2 * Math.PI * layers[i].lambda);
        }
        return 1 / R;
    }

    // U' for a pipe spec {od, id, wall_lambda, insul}. insul is null for a bare
    // pipe, otherwise [{t thickness m, lambda}, ...] working outwards from the
    // pipe OD. wall_lambda adds the pipe wall as a series resistance (MDPE);
    // omit it for copper, whose wall resistance is ~0.01% of the total.
    function pipe_u(spec) {
        if (!spec.insul) return H_BARE * Math.PI * spec.od;
        var layers = [], r = spec.od / 2;
        if (spec.wall_lambda) layers.push({ r1: spec.id / 2, r2: r, lambda: spec.wall_lambda });
        for (var i = 0; i < spec.insul.length; i++) {
            layers.push({ r1: r, r2: r + spec.insul[i].t, lambda: spec.insul[i].lambda });
            r += spec.insul[i].t;
        }
        return u_layers(layers);
    }

    // ---- Product ranges -----------------------------------------------------
    // What is actually purchasable, so the insulation choice can be constrained
    // by pipe size rather than offering thicknesses that do not exist.
    //
    // Armaflex Class O is stocked in every wall thickness below for all three
    // copper sizes we model, with the tube bore matching the pipe OD.
    var ARMAFLEX_WALLS = [9, 13, 19, 25, 32]; // mm
    //
    // Primary Pro comes in ONE thickness per pipe size, and its tubes are
    // deliberately oversized — both bore and wall run over nominal, so the
    // measured dimensions from the datasheet are used rather than the nominal
    // ones. "28mm x 19mm" is really a 29 mm bore with a 21 mm wall. Taking the
    // foam bore as r1 (not the pipe OD) leaves the small annular gap outside
    // the insulation, which is the conservative reading.
    var PRIMARY_PRO = { // bore/t m, as measured; nominal for the label
        "22": { nominal: 25, bore: 0.023, t: 0.025 },
        "28": { nominal: 19, bore: 0.029, t: 0.021 },
        "35": { nominal: 19, bore: 0.036, t: 0.021 }
        // 42 mm x 19 mm also exists but is outside the PIPES range
    };
    // Superseded option keys from before the range was product-specific, kept
    // so previously saved configs still load
    var INSUL_LEGACY = { "13": "af13", "19": "af19", "25": "af25" };

    // The insulation options available for a given pipe size, in dropdown
    // order: [{key, label, product, u}]
    function insul_options(pipe) {
        var pd = PIPES[pipe];
        var opts = [{
            key: "bare", label: "Bare pipe", product: "bare",
            u: pipe_u({ od: pd.od, insul: null })
        }];
        for (var i = 0; i < ARMAFLEX_WALLS.length; i++) {
            var w = ARMAFLEX_WALLS[i];
            opts.push({
                key: "af" + w,
                label: "Armaflex Class O " + w + " mm",
                product: "armaflex",
                u: pipe_u({ od: pd.od, insul: [{ t: w / 1000, lambda: LAMBDA.armaflex }] })
            });
        }
        var pp = PRIMARY_PRO[pipe];
        if (pp) opts.push({
            key: "pp",
            label: "Primary Pro " + pipe + " mm x " + pp.nominal + " mm",
            product: "primarypro",
            u: pipe_u({ od: pp.bore, insul: [{ t: pp.t, lambda: LAMBDA.primarypro }] })
        });
        return opts;
    }

    // U' for simple mode, from a pipe size and an option key from insul_options
    function insul_u(pipe, insulation) {
        var key = INSUL_LEGACY[insulation] || insulation;
        var opts = insul_options(pipe);
        for (var i = 0; i < opts.length; i++) if (opts[i].key == key) return opts[i].u;
        return opts[0].u; // unknown key: fall back to bare rather than NaN
    }

    // Segment types for the segmented path. Geometry only — u is derived below.
    // wallC is the pipe wall heat capacity J/K per m (MDPE walls carry over
    // twice the heat capacity of copper).
    // Primary Pro entries use the oversized bore as od, per PRIMARY_PRO above.
    var SEGTYPES = {
        cu28_pp:   { label: "28mm Cu + Primary Pro 19mm", od: 0.029, id: 0.0262, wallC: 264,
                     insul: [{ t: 0.021, lambda: LAMBDA.primarypro }] },
        cu28_af25: { label: "28mm Cu + Armaflex 25mm",    od: 0.028, id: 0.0262, wallC: 264,
                     insul: [{ t: 0.025, lambda: LAMBDA.armaflex }] },
        cu28_af19: { label: "28mm Cu + Armaflex 19mm",    od: 0.028, id: 0.0262, wallC: 264,
                     insul: [{ t: 0.019, lambda: LAMBDA.armaflex }] },
        cu28_bare: { label: "28mm Cu bare",               od: 0.028, id: 0.0262, wallC: 264,
                     insul: null },
        // 32mm MDPE (3mm wall) in a 75mm OD foam jacket: wall 13->16mm radius,
        // then 21.5mm of foam out to 37.5mm
        mdpe32_75: { label: "32mm MDPE in 75mm jacket",   od: 0.032, id: 0.026,  wallC: 591,
                     wall_lambda: LAMBDA.mdpe,
                     insul: [{ t: 0.0215, lambda: LAMBDA.pe_foam }] },
        // Primary Pro for 22mm copper is only made in 25mm wall — there is no
        // 22mm x 19mm product
        cu22_pp:   { label: "22mm Cu + Primary Pro 25mm", od: 0.023, id: 0.0202, wallC: 205,
                     insul: [{ t: 0.025, lambda: LAMBDA.primarypro }] },
        cu35_pp:   { label: "35mm Cu + Primary Pro 19mm", od: 0.036, id: 0.0327, wallC: 385,
                     insul: [{ t: 0.021, lambda: LAMBDA.primarypro }] }
    };
    for (var st in SEGTYPES) SEGTYPES[st].u = pipe_u(SEGTYPES[st]);
    // Superseded segment keys, kept so previously saved configs still load.
    // cu22_pp19 never existed as a product; it maps to the real 25mm version.
    var SEGTYPE_LEGACY = { cu28_pp19: "cu28_pp", cu28_25: "cu28_af25", cu22_pp19: "cu22_pp" };

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
                u.push(insul_u(primary.pipe, primary.insulation));
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
            var t = SEGTYPES[SEGTYPE_LEGACY[sg.type] || sg.type] || SEGTYPES.cu28_pp;
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
        LAMBDA: LAMBDA,
        H_BARE: H_BARE,
        ARMAFLEX_WALLS: ARMAFLEX_WALLS,
        PRIMARY_PRO: PRIMARY_PRO,
        u_layers: u_layers,
        pipe_u: pipe_u,
        insul_options: insul_options,
        insul_u: insul_u,
        SEGTYPES: SEGTYPES,
        SEGTYPE_LEGACY: SEGTYPE_LEGACY,
        build_path: build_path,
        setup: setup,
        init_state: init_state,
        step: step
    };
})();

if (typeof module !== 'undefined') module.exports = pipework;
