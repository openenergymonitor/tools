# Defrost model literature review — insights for frost.md

Companion to `frost.md` (the defrost implementation proposal). Six published papers on
reduced-order and high-fidelity ASHP frost/defrost models were reviewed in full text
against our proposed lumped model (single frost-mass state, humidity-ratio-difference
deposition, mass-threshold trigger, fixed-power reverse-cycle defrost). Summary first,
then per-paper notes.

## Headline: the proposed structure is the published state of the art for this class

Zanetti, Scoccia & Aprile (IBPSA Building Simulation 2025) is almost exactly our model,
independently developed and lab-validated. Their two-state gray-box model (evaporator
temperature + ice mass) uses:

- **The same deposition law**: `dM_ice/dt = ṁ_air · ε · (x_ambient − x_sat(T_coil))` —
  air mass flow × humidity-ratio difference × a single lumped effectiveness. Their `ε`
  is our `capture_eff`.
- **A mass threshold defrost trigger** (`M_ice` approaching `M_ice_max`), like ours.
- **No COP/capacity derating during frost buildup** — performance assumed unaffected
  "until mass of ice becomes critical". Directly supports our v1 exclusion.
- Their argument for annual-simulation accuracy: **the slow frosting dynamics (cycle
  count) dominate the SCOP impact; intra-defrost detail matters little.** This is the
  design thesis of frost.md, in print.

Validated against 19 frost/defrost cycles on a residential air-to-water unit (PoliMi
climate chambers, drip water weighed): ice formation error < 5.6%, defrost trigger
timing error ~10%, 2 days simulated in 12 s. The NREL 2024 review independently
identifies exactly this gap — "clear disconnection between high-fidelity equipment-level
models and the empirical models used in high-level impact analysis" — which is the niche
both Zanetti's model and ours occupy.

## Parameter anchors from the literature

| Our parameter | Our default | Literature anchor |
|---|---|---|
| `melt_eff` | 0.6 | Klingebiel 2023 (cited in NREL review): measured reverse-cycle defrost efficiency **56–61%**. Ma thesis 2024: 30.3% (light frost) to 56.5% (heavy frost), whole-cycle. Our implied ~48% for a 1 kg melt sits inside the band. **Keep.** |
| Latent heat | 334 kJ/kg | Same constant in Ma 2023 and Ma & Thorade 2025. **Keep.** |
| `coil_dt` | 6 K | Zanetti measured air-to-evaporator ΔT: **4.1 K** at 2 °C, **5.3 K** at 5 °C. Slightly high; 5 K would be closer. |
| `capture_eff` | 0.20 | Physical value via Lewis analogy is `1 − exp(−UA_air/(ṁ_air·cp))` ≈ **0.4–0.8** for residential coils (NREL review; Ma 2023 uses `1 − e^(−NTU/0.9)`); Zanetti's back-calculated ε ≈ 0.6–0.7. Our 0.20 is a legitimate composite: it also absorbs (a) our 6 K coil_dt over-driving Δw vs the real 4–5 K, (b) using coil temp instead of the warmer frost *surface* temp (frost insulates — real driving potential shrinks as frost grows), (c) single over-water Magnus. Fine as one calibrated knob, but don't read it as a physical capture fraction. |
| `threshold` | 1.0 kg | Zanetti measured **2.8–3.0 kg melted per cycle** on a ~5 kW-evaporator unit; Ma's 2-ton coil geometry implies order 1–3 kg at initiation. 1.0 kg is the right order but on the low side → more cycles than the validated units. Consider ~2 kg, scaled with unit capacity. |
| Cycle interval | ~65 min in frosty weather | Zanetti: trigger at 6000–6800 s (100–113 min) at 2–5 °C / 85% RH. Ma's production unit: fixed 30 min (first) / 120 min intervals. CLIMA 2019 manufacturer logic: 25 min (severe zone) / 45 min (moderate). Our ~65 min sits comfortably inside the observed 25–120 min envelope. |
| Defrost duration | ~2.3 min per kg + 20-min cap | Real durations: 4–5 min (CLIMA), 5 min light / 10–12 min heavy (Ma). Ours is fast-side but same order; the 20-min cap will essentially never bind. Real duration is set by the slowest-melting region of the coil (non-uniform frost), which is part of what melt_eff absorbs. |
| Defrost heat draw | 4000 W fixed | CLIMA: parabolic pulse peaking at **0.66 × rated heating capacity**, mean energy ≈ 200 Wh/cycle for a 6 kW unit. Our 4 kW flat × 2.3 min ≈ 155 Wh + electric — same order. |
| Defrost electric | 1000 W fixed | CLIMA: triangular pulse peaking at **0.90 × nominal electric input** (mean ≈ 0.45×). For a ~2 kW-input unit our flat 1 kW is right in band. |
| Annual loss | calibrated 1.7% of heat | CLIMA (N. Italy): SCOP penalty **2.2–4.4%** including pre-defrost derating we exclude; ~1170–2660 cycles/season. NREL review worst case up to 13% SCOP; Rossi di Schio: up to 10% extra electricity. 1.7% for a mild wet UK site is plausible and slightly conservative. |
| Frosting band | emerges from Magnus | Zhu et al. 2015 frosting map (used by CLIMA): frosting when **Text < 6 °C and RH > 50%**, severe zone around 0…+5 °C high RH. Matches our emergent band — cheap independent check for the harness band-shape test. |

## Model refinements worth considering (roughly in value order)

1. **Fixed per-cycle overhead energy.** Ma's measured defrost efficiency (30% light frost
   vs 56% heavy frost) shows a roughly constant per-cycle tax — cycle reversal plus
   sensible reheat of the coil metal (~coil mass × cp × ~30 K) — on top of the
   mass-proportional melt energy. Our cost is almost purely mass-proportional, so cycle
   *count* is under-penalised. With ~1045 cycles/yr this is first-order for the annual
   loss figure. Cheapest fix: add a fixed per-cycle kJ term (or equivalently lower
   melt_eff for small melts). Also argues for a larger threshold: fewer, longer defrosts
   are genuinely more efficient.
2. **Sublimation / negative deposition** (Zanetti): when ice is present and ambient air
   is *drier* than saturation at the coil, `ṁ_w` goes negative — frost sublimates away.
   One extra condition, removes spurious accumulation through cold-dry spells.
3. **Retained water / refreeze** (Ma & Thorade, Modelica 2025): if defrost terminates
   early (our 20-min cap, or real feedback termination), un-drained water refreezes and
   the next cycle starts with ice already present, shortening it. Our cap-exit already
   retains residual frost_mass — correct by construction. A fuller version is one extra
   scalar (retained water draining with a first-order time constant); simulation-only in
   the literature, no validated retained-fraction numbers yet. Low priority.
4. **Optional max-interval trigger clamp.** Production units initiate on *time*
   (30–120 min of sub-zero-coil runtime) and terminate on coil temperature; our mass
   threshold is an idealised demand defrost — better than real controllers, so we may
   undercount cycles in marginal frosting weather vs a real fixed-interval machine.
   A "force defrost after N min of frosting-capable runtime" option would mimic common
   controllers if matching a specific unit matters.
5. **If COP derating is ever added (v2):** CLIMA's form is the simplest credible one —
   capacity ramps down linearly (to a calibrated 10–28% loss at trigger) with electric
   input flat, i.e. `capacity_factor = 1 − α·(frost_mass/threshold)`, α ≈ 0.15–0.25.
   But two findings support continuing to exclude it: Ma observed *no noticeable*
   degradation for the first ~60 min of a 120-min frosting interval (a demand-triggered
   1–2 kg defrost sits mostly in that flat region), and Ma & Thorade note compressor
   power falls with capacity as frost builds, so COP degrades less than capacity —
   naive capacity-only derating overstates the penalty. Plus our datasheet
   double-counting concern stands.
6. **Post-defrost capacity boost** (CLIMA: up to +37% for ~4 min, warm coil): tiny
   integrated effect; ignoring it makes our 1.7% marginally conservative. Ignore.
7. **Not worth importing:** the enthalpy-method single-film state, fuzzy/Takagi-Sugeno
   stage blending, and apparent-heat-capacity phase change (Ma 2023, Ma & Thorade 2025)
   are machinery for variable-step stiff ODE solvers (Modelica/Dassl). Our explicit
   10–60 s loop with a hard state machine doesn't need them. The one transferable idea
   is their tiny "frost gone" thresholds (δ < 0.01 mm, m < 1e−5 kg) — clamp frost_mass
   to exactly 0 below a small epsilon to avoid chatter.

## Corroborated design decisions in frost.md

- Deposition = air mass flow × Δ(humidity ratio) × single effectiveness: the standard
  formulation from Lewis-analogy mass transfer, used by every model reviewed.
- Mass-threshold trigger: same philosophy as the validated Zanetti model.
- Defrost draws heat from the heating circuit with indoor emitters active: confirmed as
  the correct accounting (Ma runs the indoor coil as evaporator, indoor fan on, and
  counts robbed indoor heat as a defrost cost).
- Melt rate = power/334 kJ/kg with an efficiency factor: exactly Ma & Thorade's
  quasi-steady melt term; melt_eff 0.6 lands on measured RCD efficiencies.
- Outdoor fan off during defrost → no defrost fan-energy term needed (Ma switches to a
  natural-convection model); compressor runs continuously across mode switches.
- Flow-temperature dip during defrost as a visible output: CLIMA found defrost dips
  drove indoor air below 20 °C for up to 19% of season hours without a buffer —
  surfacing the dip signature is a genuinely useful feature.
- No COP derating in v1 (see point 5 above).

## Per-paper notes and sources

### Zanetti, Scoccia & Aprile — IBPSA BS2025 (PoliMi), DOI 10.26868/25222708.2025.1497
Two states: lumped evaporator temperature `T_hx` (energy balance with apparent-cp phase
change) and ice mass `M_ice`. Deposition `ṁ_w = ṁ_a·ε·(x_ext − x_sat(T_hx))`; melt during
defrost is first-order in remaining ice (`−τ·M_ice`), not fixed-rate. Airflow binary:
nominal until `M_ice_max`, then zero — no gradual derating. Two effectiveness values
(fan on / natural convection). ~6 tuned parameters (values not published). Validation:
19 cycles, residential A2W unit, 2 °C/86% RH and 5 °C/85% RH; 2.8/3.0 kg ice per cycle;
ice error < 5.6%, trigger timing RMSE 8–12% of frosting time; 12 s per 2 simulated days.
PDF: https://publications.ibpsa.org/proceedings/bs/2025/papers/bs2025_1497.pdf

### Lu, Huang & Woods — NREL review, IRACC 2024, NREL/CP-5500-89649
Taxonomy: lumped / 1-D semi-empirical / CFD frosting models; multi-stage first-principle
defrost models (Krakow 1993 lineage). Confirms Lewis analogy as the standard mass-transfer
route. Correlation chain if we ever need thickness/blocking: density Hayashi
`ρ_f = 650·exp(0.277·T_fs)` or Hermes 2009; conductivity Yonko-Sepsy or Lee
`k_f = 0.132 + 3.13e-4·ρ + 1.6e-7·ρ²` (flagged as condition-specific). Measured defrost
efficiencies: RCD 56–61% (Klingebiel 2023), electric 44–45%, warm brine 16–45%. Seasonal
worst case up to 13% COP degradation (Vocale 2014). Criticises EnergyPlus's empirical
defrost fraction method (no cycle frequency, no peaks). Gaps: no validated typical
kg-at-defrost figures; degradation-factor approaches unvalidated.
PDF: https://www.nrel.gov/docs/fy24osti/89649.pdf

### Ma, Kim, Braun & Horton — Energy 272 (2023) 127030 (+ Modelica 2022 companion, thesis 2024)
High-fidelity reference: 30-CV finite-volume evaporator, per-CV Lewis-analogy deposition
at the frost *surface* temperature, thickness+densification split, fan-curve/pressure-drop
airflow reduction, five-stage melt (preheat/melt-start/melt/vaporise/dry), fuzzy stage
blending, no state events across flow reversal. Validated on a 2-ton R410A split unit
at −2 °C/85% RH to 2–2.5% residuals. Key numbers: 23% airflow blockage after 120 min
frosting, degradation unnoticeable for the first ~60 min; defrost 5 min (light) /
10–12 min (heavy); real unit trigger fixed-interval 30/120 min, temperature-terminated;
**defrost efficiency 30.3% light vs 56.5% heavy frost** → fixed per-cycle overhead
(reversal + coil metal reheat) dominates small defrosts. Retained water film max 0.05 mm.
Journal (paywalled): https://doi.org/10.1016/j.energy.2023.127030
Open companion: https://ecp.ep.liu.se/index.php/modelica/article/download/621/559/577
Thesis: https://hammer.purdue.edu/articles/thesis/25521136

### Ma, Kim & Braun — IRACC 2022 Paper 2325 (defrost half of the above)
Five-stage melt equations + fuzzy switching detail; check-valve reversing valve; second
defrost initiation at 158 min, ~10–12 min duration; model overestimates indoor capacity
during defrost; capacity recovers within minutes post-defrost but refrigerant mass
redistribution takes tens of minutes. No defrost-strategy comparisons actually run.
https://docs.lib.purdue.edu/iracc/2325

### Ma & Thorade — Modelica Conference 2025, DOI 10.3384/ecp218335 (arXiv:2412.00017)
Enthalpy-method film volume: one lumped enthalpy state spans ice/melting/water via two
reference enthalpies — refreezing needs no extra logic. Retained water = one extra scalar
+ calibrated drainage time constant. Melt rate = available power / 334 kJ/kg. Deposition
`β·A·(ω_in − ω_sat(T_surface))`, Le = 0.89. Takagi-Sugeno fuzzy blending of four stages
(thresholds: frost gone below 0.01 mm / 1e−5 kg). Simulation-only (automotive R1234yf
HP); demonstrates short defrost → refreeze → progressive buildup. Notes compressor power
falls with frost, so COP degrades less than capacity.
PDF: https://ecp.ep.liu.se/index.php/modelica/article/download/1319/1133

### Dongellini, Piazzi, De Biagi & Morini — CLIMA 2019, E3S Web Conf. 111, 01063
TRNSYS 17 performance-map model, three phases: pre-defrost (capacity ramps down linearly
in *time* to α = 10–28% loss, electric flat), defrost (parabolic cooling pulse peaking at
0.66×rated for 240–300 s; triangular electric pulse peaking at 0.90×nominal), post-defrost
(boost up to +37% for ~4 min). No frost mass state — Zhu 2015 frosting map with fixed
25/45-min defrost intervals inside the frosting region (Text < 6 °C, RH > 50%). All shape
parameters from a manufacturer test campaign (unit-specific). Seasonal results, N. Italy:
SCOP penalty −4.1% Milan / −4.4% Bologna / −2.2% Udine; 1169–2660 cycles per 183-day
season; penalty tracks humidity, cycle count tracks temperature; defrost dips drove
indoor air below 20 °C for up to 19% of season hours (no buffer tank).
PDF: https://www.e3s-conferences.org/articles/e3sconf/pdf/2019/37/e3sconf_clima2019_01063.pdf

## Post-refactor implementation notes (code as of the "first stage refactor")

frost.md's line references predate the split into `model/*.js`. Key mapping:

- The frost/defrost state machine now belongs beside the controller/simulator boundary:
  accumulation + trigger after `controller.step()` in `simulator.js`, overriding
  `heatpump_heat` before the pipework step.
- The old single-volume `MWT` hack is obsolete — and the refactor makes the defrost
  *better*: pass **negative `heat_W`** into `pipework.step()` with `pump_on: true` and
  the defrost draw comes out of the unit-volume node `Th`, propagating a genuine
  flow-below-return signature through the finite-volume legs. `dhw_mode` forced false
  routes the draw through the emitter loop as intended.
- The `system_DT > 1` guard (simulator.js) still excludes defrost steps from carnot
  stats automatically once `system_DT` goes negative during defrost.
- CSV humidity is still parsed and discarded in `dynamic_heatpump.js` (`parse_csv`);
  the `dataset` object passed to `simulator.run()` needs a `humidity` array and
  `get_from_dataset()` needs to return it — the frost.md plumbing step carries over
  almost unchanged.
- Warm-start state (`frost_mass`, `defrost_state`) belongs in the caller-owned
  `opts.state` container alongside `control`, `fabric`, `pw`, `cyl_T`.
