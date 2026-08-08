<!doctype html>
<html lang="en">

<head>
<!-- Served by the front controller from a url that is deeper than this file's
     own location, so anchor the relative paths below to $path -->
<base href="<?php echo htmlspecialchars($path ?? '', ENT_QUOTES); ?>">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How the frost &amp; defrost model works - Dynamic heat pump simulator</title>
<meta name="description" content="An illustrated tutorial on the evaporator frosting and reverse-cycle defrost model used by the OpenEnergyMonitor dynamic heat pump simulator.">
<style>
    /* ====================================================================
       Frost & defrost model tutorial
       A standalone documentation page for the dynamic heat pump simulator.
       Every chart on this page is computed live by ../model/frost.js, the
       exact code the simulator runs, so the figures cannot drift from the
       implementation.
       ==================================================================== */
    :root {
        --bg: #f6f4f0;
        --surface: #fff;
        --rail-bg: #faf8f5;
        --border: #e3e0da;
        --border-soft: #e9e5df;
        --oem: #45a2c9;
        --ink: #1f1d1a;
        --ink-2: #52514e;
        --muted: #898781;
        --grid: #e7e4de;
        --axis: #c9c6bf;
        /* Chart series (validated palette; blue ordinal ramp for the RH family) */
        --s-blue: #2a78d6;
        --s-orange: #eb6834;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 1.6;
        -webkit-text-size-adjust: 100%;
    }

    /* --- Header bar (matches the simulator) ----------------------------- */
    .doc-header {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: .25rem .75rem;
        padding: .6rem 1.25rem;
        background: var(--oem);
    }
    .doc-header a.back {
        color: #fff;
        text-decoration: none;
        font-size: .85rem;
        border: 1px solid rgba(255,255,255,.55);
        background: rgba(255,255,255,.12);
        border-radius: .35rem;
        padding: .15rem .6rem;
        align-self: center;
    }
    .doc-header a.back:hover { background: rgba(255,255,255,.24); border-color: #fff; }
    .doc-title { font-size: 1.02rem; font-weight: 600; color: #fff; }
    .doc-subtitle { font-size: .83rem; color: rgba(255,255,255,.85); }

    /* --- Page column ----------------------------------------------------- */
    main {
        max-width: 860px;
        margin: 0 auto;
        padding: 2rem 1.25rem 4rem;
    }
    h1 {
        font-size: 1.7rem;
        line-height: 1.25;
        margin: .5rem 0 .75rem;
        letter-spacing: -.01em;
    }
    .lede {
        font-size: 1.08rem;
        color: var(--ink-2);
        margin: 0 0 1.5rem;
    }
    section { margin-top: 3rem; }
    h2 {
        font-size: 1.22rem;
        margin: 0 0 .75rem;
        letter-spacing: -.005em;
    }
    h2 .sec-no {
        color: var(--oem);
        font-weight: 700;
        margin-right: .4rem;
        font-variant-numeric: tabular-nums;
    }
    p { margin: .75rem 0; }
    a { color: #0d6efd; }
    code, .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: .88em;
        background: var(--rail-bg);
        border: 1px solid var(--border-soft);
        border-radius: 4px;
        padding: .05em .3em;
    }

    /* Equations: monospace blocks with a blue accent rule */
    .eq {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: .86rem;
        line-height: 1.7;
        background: var(--rail-bg);
        border: 1px solid var(--border-soft);
        border-left: 3px solid var(--s-blue);
        border-radius: 6px;
        padding: .75rem 1rem;
        margin: 1rem 0;
        overflow-x: auto;
        white-space: pre;
        color: var(--ink);
    }
    .eq .c { color: var(--muted); }

    /* Draft notice: same accent-rule treatment as .eq, in the warning amber */
    .notice {
        display: flex;
        align-items: baseline;
        gap: .6rem;
        font-size: .88rem;
        background: #fdf6e3;
        border: 1px solid #f2e2b0;
        border-left: 3px solid #fab219;
        border-radius: 6px;
        padding: .7rem 1rem;
        margin: 0 0 1.25rem;
        color: var(--ink);
    }
    .notice .notice-tag {
        flex: none;
        font-size: .7rem;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: #7a5600;
    }

    /* --- Stat tiles ------------------------------------------------------ */
    .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: .75rem;
        margin: 1.25rem 0;
    }
    .tile {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: .8rem 1rem .7rem;
    }
    .tile .label { font-size: .78rem; color: var(--ink-2); }
    .tile .value { font-size: 1.55rem; font-weight: 600; line-height: 1.2; margin-top: .1rem; }
    .tile .unit { font-size: .85rem; font-weight: 500; color: var(--ink-2); margin-left: .1rem; }
    .tile .note { font-size: .74rem; color: var(--muted); margin-top: .15rem; }

    /* --- Figures ---------------------------------------------------------- */
    figure {
        margin: 1.25rem 0;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 1rem 1.25rem 0.75rem;
    }
    figure .fig-title { font-size: .93rem; font-weight: 600; margin: 0 0 .1rem; }
    figure .fig-sub { font-size: .8rem; color: var(--ink-2); margin: 0 0 .6rem; }
    figure svg { display: block; width: 100%; height: auto; }
    figcaption {
        font-size: .8rem;
        color: var(--ink-2);
        border-top: 1px solid var(--border-soft);
        margin-top: .6rem;
        padding: .55rem 0 .3rem;
    }
    .legend {
        display: flex;
        flex-wrap: wrap;
        gap: .35rem 1rem;
        font-size: .78rem;
        color: var(--ink-2);
        margin: 0 0 .5rem;
    }
    .legend .key { display: inline-flex; align-items: center; gap: .4rem; }
    .legend .swatch-line { width: 16px; height: 0; border-top: 2px solid; border-radius: 2px; }
    .legend .swatch-fill { width: 12px; height: 12px; border-radius: 3px; }

    /* Chart text (inside SVG) */
    svg text {
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        fill: var(--ink-2);
    }
    svg .tick { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
    svg .axis-title { font-size: 11px; fill: var(--muted); }
    svg .dlabel { font-size: 11.5px; font-weight: 600; fill: var(--ink-2); }
    svg .anno { font-size: 11.5px; fill: var(--ink-2); }
    svg .anno-strong { font-size: 11.5px; font-weight: 600; fill: var(--ink); }

    /* Tooltip */
    .chart-wrap { position: relative; }
    #tooltip {
        position: absolute;
        pointer-events: none;
        background: var(--ink);
        color: #fff;
        font-size: .74rem;
        line-height: 1.5;
        border-radius: 6px;
        padding: .35rem .6rem;
        white-space: nowrap;
        transform: translate(-50%, calc(-100% - 10px));
        display: none;
        z-index: 10;
    }
    #tooltip .tt-title { font-weight: 600; }

    /* Data-table twins */
    details.table-view { margin: .4rem 0 0; font-size: .8rem; }
    details.table-view summary { cursor: pointer; color: var(--ink-2); }
    details.table-view table {
        border-collapse: collapse;
        margin: .5rem 0 .25rem;
        font-variant-numeric: tabular-nums;
    }
    details.table-view th, details.table-view td {
        border: 1px solid var(--border-soft);
        padding: .2rem .55rem;
        text-align: right;
    }
    details.table-view th { background: var(--rail-bg); font-weight: 600; }
    details.table-view th:first-child, details.table-view td:first-child { text-align: left; }

    /* Parameter table */
    table.params {
        width: 100%;
        border-collapse: collapse;
        font-size: .85rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        overflow: hidden;
    }
    table.params th, table.params td {
        padding: .5rem .75rem;
        border-bottom: 1px solid var(--border-soft);
        text-align: left;
        vertical-align: top;
    }
    table.params th { background: var(--rail-bg); font-size: .78rem; letter-spacing: .03em; }
    table.params tr:last-child td { border-bottom: 0; }
    table.params td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* Reading list */
    ul.reading { padding-left: 1.2rem; }
    ul.reading li { margin: .5rem 0; }
    ul.reading .who { color: var(--ink-2); font-size: .88em; }

    .footnote { font-size: .8rem; color: var(--muted); margin-top: 3rem; border-top: 1px solid var(--border-soft); padding-top: 1rem; }

    @media (max-width: 560px) {
        main { padding: 1.25rem .9rem 3rem; }
        figure { padding: .75rem .8rem .6rem; }
        .eq { font-size: .78rem; }
    }
</style>
</head>

<body>

<header class="doc-header">
    <a class="back" href="../../../dynamic_heatpump">&larr; Simulator</a>
    <span class="doc-title">Dynamic heat pump simulator</span>
    <span class="doc-subtitle">docs &middot; frost &amp; defrost model</span>
</header>

<main>

<h1>How the frost &amp; defrost model works</h1>

<div class="notice">
    <span class="notice-tag">Draft</span>
    <span>This document has been generated with the help of Claude Code. It is work in progress and is still being reviewed. Work on the defrost model itself is also ongoing, e.g the fixed 5K offset should be a load dependent variable.</span>
</div>

<p class="lede">
    Air source heat pumps build up frost on the evaporator in cold and damp weather. The
    evaporator is the outdoor heat exchanger, also known as the outdoor coil, it is
    where the heat pump absorbs heat from the outside air. To remove the frost, the unit
    periodically runs the refrigeration cycle in reverse, melting it by taking heat back
    from the heating circuit for a few minutes. This page explains the physics behind the
    frost and defrost model used in the simulator. The charts below
    are calculated using the same
    <a href="https://github.com/openenergymonitor/tools/blob/main/www/tools/dynamic_heatpump/model/frost.js"><code>model/frost.js</code></a> code
    that the simulator runs.
</p>

<div class="tiles" id="hero_tiles">
    <div class="tile">
        <div class="label">Frosting weather</div>
        <div class="value">&minus;7 to +5<span class="unit">&deg;C</span></div>
        <div class="note">humid air, evaporator below 0&nbsp;&deg;C</div>
    </div>
    <div class="tile">
        <div class="label">Defrost interval at 2&nbsp;&deg;C, 85% RH</div>
        <div class="value" id="tile_period">&hellip;</div>
        <div class="note">computed by the model, default settings</div>
    </div>
    <div class="tile">
        <div class="label">Each defrost takes</div>
        <div class="value" id="tile_duration">&hellip;</div>
        <div class="note" id="tile_duration_note">&hellip;</div>
    </div>
    <div class="tile">
        <div class="label">Typical annual cost</div>
        <div class="value">1-2<span class="unit">%</span></div>
        <div class="note">of heat delivered, mild UK climate</div>
    </div>
</div>

<!-- ================================================================== -->
<section id="s1">
<h2><span class="sec-no">1</span>Why frost forms: cold air holds less water</h2>

<p>
    The amount of water vapour that air can carry falls with temperature,
    roughly halving for every 10&nbsp;&deg;C drop. The evaporator of a heat pump runs
    <em>colder than the air</em> passing over it, as it must in order to absorb heat.
    The model uses a fixed approach temperature:
</p>

<div class="eq">T_coil = T_outside &minus; coil_dt        <span class="c">// coil_dt = 5 K, measured 4-5 K on test units</span></div>

<p>
    A fixed drop is a simplification: the real approach temperature scales with how hard
    the compressor is working, so the coil sits close to air temperature at minimum
    modulation and 7&ndash;8&nbsp;K below it at full output. The COP models that build the
    COP from a refrigerant-side lift &mdash; the carnot models and the fitted models in
    <code>lib/vaillant_cop_fit.js</code> &mdash; already track that evaporating temperature,
    and the <em>Use the COP model's evaporating temperature as the coil temperature</em>
    option feeds it to the frost model in place of <code>coil_dt</code>. Two things to keep in
    mind when using it: those models report the refrigerant saturation temperature, which is
    a little below the air-side fin surface that frost actually forms on, so
    <code>capture_eff</code> is the knob to re-calibrate on; and the datasheet lookup models
    (Ecodan, Vaillant) carry no such internal temperature, so they stay on the fixed drop.
</p>

<p>
    This means that whenever the outside air is below about +5&nbsp;&deg;C, the
    evaporator surface is below freezing. If the air arriving at the evaporator carries
    more water than saturated air at the evaporator temperature can hold, the excess
    has nowhere to go and is
    deposited on the fins as frost. The saturation curve makes this easier to see:
</p>

<figure>
    <div class="fig-title">The moisture wedge that becomes frost</div>
    <div class="fig-sub">Water content of saturated air (Magnus equation): the driving potential of the model is the vertical gap &Delta;w</div>
    <div id="fig_magnus" class="chart-wrap"></div>
    <figcaption>
        Air at 2&nbsp;&deg;C and 80% RH carries <span id="cap_wamb">&hellip;</span> of water per kg of air.
        The evaporator runs at &minus;3&nbsp;&deg;C, where saturated air holds only <span id="cap_wcoil">&hellip;</span>.
        The difference, &Delta;w &asymp; <span id="cap_dw">&hellip;</span>, condenses and freezes onto the
        fins as the fan drives air across them.
    </figcaption>
</figure>

<p>
    The deposition law is the standard Lewis-analogy form used by comparable
    reduced-order models. It appears as Equation&nbsp;(4) on page&nbsp;3 of
    <a href="https://publications.ibpsa.org/proceedings/bs/2025/papers/bs2025_1497.pdf">Zanetti et&nbsp;al. (2025)</a>,
    written there as m&#775;_w = m&#775;_a &middot; &epsilon; &middot; (x_ext &minus; x_sat), where
    &epsilon; is the heat exchanger effectiveness. The same quantities appear here under
    different names:
</p>

<div class="eq">frost_mass += m&#775;_air &middot; (w_ambient &minus; w_sat(T_coil)) &middot; capture_eff &middot; dt

<span class="c">// m&#775;_air      air mass flow = airflow &times; 1.25 kg/m&sup3;  (3500 m&sup3;/h &rarr; 1.22 kg/s)</span>
<span class="c">// w           humidity ratio, kg water per kg dry air (Magnus curve)</span>
<span class="c">// capture_eff one calibrated knob absorbing the air-side losses</span></div>

<p>
    The same law run in reverse also gives <strong>sublimation</strong>: in very cold
    and dry air the evaporator can be <em>wetter</em> than the air (&Delta;w&nbsp;&lt;&nbsp;0), and
    any frost already present slowly evaporates away without ever melting. Equation&nbsp;(4)
    of Zanetti et&nbsp;al. sets out the same three cases: deposition when the air is moister
    than the surface, sublimation when it is drier and ice is already present, and no mass
    transfer otherwise.
</p>
</section>

<!-- ================================================================== -->
<section id="s2">
<h2><span class="sec-no">2</span>The frosting band: worst just above freezing</h2>

<p>
    Putting the two ingredients together, an evaporator 5&nbsp;K below the air temperature and
    air whose water content falls steeply as it gets colder, produces a well known
    result: frosting is <strong>worst between 0 and +5&nbsp;&deg;C in humid weather</strong>,
    and not in the coldest weather. Below about &minus;7&nbsp;&deg;C the air is too dry to
    feed the frost. Above +5&nbsp;&deg;C the evaporator climbs above freezing and the frost
    melts off.
</p>

<figure>
    <div class="fig-title">Frost growth rate across the temperature range</div>
    <div class="fig-sub">kg of frost per hour of compressor runtime, computed by stepping the model at each temperature</div>
    <div class="legend" id="legend_band"></div>
    <div id="fig_band" class="chart-wrap"></div>
    <figcaption>
        Each curve is one relative humidity. The cliff at +5&nbsp;&deg;C is the point where
        the evaporator surface reaches 0&nbsp;&deg;C. Below the zero line the model runs the
        same law in reverse and frost sublimates into dry air. Note that with a 5&nbsp;K
        evaporator approach, meaningful frosting needs a relative humidity of roughly 70% or more,
        which is why mild and wet maritime climates see so many defrost cycles.
    </figcaption>
    <details class="table-view"><summary>Data table</summary><div id="table_band"></div></details>
</figure>
</section>

<!-- ================================================================== -->
<section id="s3">
<h2><span class="sec-no">3</span>The state machine: build up, trigger, melt, repeat</h2>

<p>
    The model tracks a single quantity, the mass of frost on the evaporator in kg, and moves
    between three behaviours around it. When the accumulated mass reaches a threshold
    (2&nbsp;kg by default) the unit runs a <strong>reverse-cycle defrost</strong>: the
    refrigeration circuit changes direction, the outdoor fan stops, and heat is pulled
    <em>out of the heating circuit</em> and into the evaporator until the frost has melted.
</p>

<figure>
    <div class="fig-title">Frost model states and transitions</div>
    <div id="fig_states"></div>
    <figcaption>
        The 20 minute safety cap mirrors real controllers. If it fires, the remaining
        frost is kept and refreezes, so the next cycle starts part loaded and triggers
        sooner. The model therefore captures refreeze behaviour without any extra logic.
    </figcaption>
</figure>

<p>Two details matter for realism:</p>
<p>
    <strong>The per-cycle overhead.</strong> Before any frost melts, the defrost must
    reverse the cycle and reheat the cold evaporator metal itself. The model charges a fixed
    300&nbsp;kJ per cycle for this before melting begins. Measured defrost efficiencies
    of 30% with light frost against 56% with heavy frost (Ma et&nbsp;al.&nbsp;2023) show
    that this fixed cost is real and significant: <em>many small defrosts cost more than
    a few large ones</em>, which is why the trigger threshold matters.
</p>
<p>
    <strong>Where the melt energy comes from.</strong> During a defrost the model sets
    the heat output to zero and draws 4&nbsp;kW from the heating circuit water. In the
    simulator this produces the classic monitoring signature of flow temperature dipping
    <em>below</em> return temperature for a few minutes.
</p>
</section>

<!-- ================================================================== -->
<section id="s4">
<h2><span class="sec-no">4</span>A frosty day, simulated</h2>

<p>
    Here is the model running through eight hours of steady frosty weather:
    2&nbsp;&deg;C at 85% RH, with the compressor running throughout and everything at
    the simulator default settings. Frost builds up to the 2&nbsp;kg trigger, a defrost
    removes it in a few minutes, and the cycle repeats. Hover over the chart to read
    values.
</p>

<figure>
    <div class="fig-title">Frost mass and available capacity, 8 hours at 2&nbsp;&deg;C / 85% RH</div>
    <div class="legend">
        <span class="key"><span class="swatch-line" style="border-color:var(--s-blue)"></span>Frost on evaporator (kg)</span>
        <span class="key"><span class="swatch-fill" style="background:rgba(235,104,52,.18)"></span>Reverse-cycle defrost</span>
    </div>
    <div id="fig_day" class="chart-wrap"></div>
    <figcaption id="cap_day">&hellip;</figcaption>
    <details class="table-view"><summary>Data table (15-minute samples)</summary><div id="table_day"></div></details>
</figure>

<p>
    The lower panel shows the other cost of frost: <strong>pre-defrost derating</strong>.
    As frost blankets the fins it insulates the evaporator and restricts the airflow, so the
    available capacity falls. In the model this fall is linear, reaching &minus;20% at the
    trigger point, with the electrical input unchanged, so the COP falls by the same
    factor. During the defrost itself the output is not just derated but negative,
    because the unit is taking heat back. The linear form follows Equation&nbsp;(2) on
    page&nbsp;4 of
    <a href="https://www.e3s-conferences.org/articles/e3sconf/pdf/2019/37/e3sconf_clima2019_01063.pdf">Dongellini et&nbsp;al. (2019)</a>,
    where the capacity reduction is a coefficient &alpha; times the steady state capacity.
    They fit &alpha; as a function of air temperature and humidity, ranging from 0.10 to
    0.28 (Table&nbsp;3, page&nbsp;6), so the 20% used here sits inside their range.
</p>

<div class="eq">capacity_factor = 1 &minus; derate_max &middot; (frost_mass / threshold)
<span class="c">// derate_max = 20% (Dongellini et al. 2019, Eq. 2)</span></div>
</section>

<!-- ================================================================== -->
<section id="s5">
<h2><span class="sec-no">5</span>What a defrost costs</h2>

<p>
    Melting ice takes 334&nbsp;kJ per kg, and that part is straightforward physics. On
    top of it sit the losses: only a fraction <code>melt_eff</code> (0.6 by default) of
    the heat drawn from the circuit actually reaches the frost, and every cycle pays the
    300&nbsp;kJ reversal and reheat overhead before melting starts. Dividing the useful
    melt energy by the total energy drawn gives the <strong>defrost efficiency</strong>,
    which explains why defrosting a lightly frosted evaporator is poor value:
</p>

<figure>
    <div class="fig-title">Defrost efficiency against the frost mass melted per cycle</div>
    <div class="fig-sub">latent heat of the melted frost &divide; total heat drawn from the heating circuit</div>
    <div id="fig_eff" class="chart-wrap"></div>
    <figcaption>
        The model lands on the measured anchors without being fitted to them.
        Ma et&nbsp;al.&nbsp;2023 measured a whole cycle efficiency of around 30% for
        light frost (the model gives <span id="cap_eff_light">&hellip;</span> at
        0.5&nbsp;kg) and 56% for heavy frost, approaching the 60% <code>melt_eff</code>
        ceiling of the model. At the default 2&nbsp;kg trigger each cycle draws
        <span id="cap_eff_cycle">&hellip;</span> from the heating circuit.
    </figcaption>
    <details class="table-view"><summary>Data table</summary><div id="table_eff"></div></details>
</figure>

<p>
    Over a year in a mild and wet climate this all adds up to roughly
    <strong>1-2% of the heat delivered</strong>, plus the derating loss. For comparison,
    Dongellini et&nbsp;al. (2019) report seasonal COP penalties of 4.1%, 4.4% and 2.2%
    for the same system modelled in Milan, Bologna and Udine (page&nbsp;7), which is the
    range to expect in a colder continental climate.
    The slow dynamics, in other words how often the unit defrosts, dominate the annual
    figure, while the fine detail of each individual defrost matters much less. That
    insight, validated by Zanetti et&nbsp;al. against climate chamber measurements, is
    what allows such a compact model to do this job honestly.
</p>
</section>

<!-- ================================================================== -->
<section id="s6">
<h2><span class="sec-no">6</span>Parameters and where the defaults come from</h2>

<p>
    Every parameter is available on the <em>Frost &amp; defrost</em> panel in the
    simulator. The defaults are anchored to published measurements. The full review is
    in <a href="https://github.com/openenergymonitor/tools/blob/main/www/tools/dynamic_heatpump/frost-literature.md">frost-literature.md</a>.
</p>

<table class="params">
    <tr><th>Parameter</th><th>Default</th><th>What it is</th><th>Literature anchor</th></tr>
    <tr>
        <td><code>humidity</code></td><td class="num">80 %RH</td>
        <td>Ambient humidity in single-day mode; annual mode uses measured CSV humidity</td>
        <td>UK winter average; Llanberis 2024 mean is 87%</td>
    </tr>
    <tr>
        <td><code>airflow</code></td><td class="num">3500 m&sup3;/h</td>
        <td>Evaporator fan flow, converted to 1.22 kg/s of air</td>
        <td>Typical ~8.5 kW monobloc fan rating</td>
    </tr>
    <tr>
        <td><code>capture_eff</code></td><td class="num">0.45</td>
        <td>Fraction of the available moisture excess that actually sticks, the single calibrated value</td>
        <td>Lewis-analogy effectiveness is typically 0.4 to 0.8 for residential coils (NREL 2024). Zanetti uses the same &epsilon; but does not publish its calibrated value</td>
    </tr>
    <tr>
        <td><code>coil_dt</code></td><td class="num">5 K</td>
        <td>How far the evaporator surface runs below the outside air (unused when the coil temperature is taken from the COP model's evaporating temperature)</td>
        <td>Zanetti Table&nbsp;2 (page&nbsp;4): evaporator at &minus;2.1&nbsp;&deg;C in 2&nbsp;&deg;C air and &minus;0.3&nbsp;&deg;C in 5&nbsp;&deg;C air, so 4.1 and 5.3&nbsp;K</td>
    </tr>
    <tr>
        <td><code>threshold</code></td><td class="num">2.0 kg</td>
        <td>Frost mass that triggers a defrost</td>
        <td>Zanetti Table&nbsp;2 (page&nbsp;4): 2.8 and 3.0&nbsp;kg of ice weighed off per cycle</td>
    </tr>
    <tr>
        <td><code>defrost_power</code></td><td class="num">4000 W</td>
        <td>Heat drawn from the heating circuit during defrost</td>
        <td>Dongellini Table&nbsp;3 (page&nbsp;6): defrost pulse peaking at 0.66 &times; rated capacity</td>
    </tr>
    <tr>
        <td><code>defrost_elec</code></td><td class="num">1000 W</td>
        <td>Compressor electrical draw during defrost</td>
        <td>Dongellini Table&nbsp;3 (page&nbsp;6): electric pulse peaking at 0.90 to 1.10 &times; nominal input</td>
    </tr>
    <tr>
        <td><code>melt_eff</code></td><td class="num">0.6</td>
        <td>Fraction of the drawn heat that reaches the frost</td>
        <td>Measured reverse-cycle defrost efficiency 56-61%, from Klingebiel 2023 as reported in the NREL 2024 review</td>
    </tr>
    <tr>
        <td><code>overhead_kj</code></td><td class="num">300 kJ</td>
        <td>Fixed per-cycle cost: cycle reversal + reheating the evaporator metal</td>
        <td>Implied by the Ma 2023 measurements of 30% (light) and 56% (heavy)</td>
    </tr>
    <tr>
        <td><code>derate_max</code></td><td class="num">20 %</td>
        <td>Capacity/COP loss when frost reaches the trigger point</td>
        <td>Dongellini Equation&nbsp;(2), page&nbsp;4: &alpha; ranges 0.10 to 0.28 (Table&nbsp;3, page&nbsp;6)</td>
    </tr>
</table>

<p style="font-size:.85rem;color:var(--ink-2)">
    One honest caveat: manufacturer COP tables measured near +2&nbsp;&deg;C already
    embed an average frosting penalty, so with the lookup table heat pump models the
    simulator counts a small part of the loss twice, and the totals are 1-2%
    pessimistic in frosty weather. The Carnot based models do not have this overlap.
</p>
</section>

<!-- ================================================================== -->
<section id="s7">
<h2><span class="sec-no">7</span>Reading list</h2>

<p>
    The structure of the model, one lumped frost mass state, humidity ratio difference
    deposition and a mass threshold trigger, is the same reduced-order form
    independently developed and validated in the laboratory by Zanetti et&nbsp;al.,
    with an ice mass error below 5.6% against 19 climate chamber defrost cycles.
</p>

<ul class="reading">
    <li>
        <a href="https://publications.ibpsa.org/proceedings/bs/2025/papers/bs2025_1497.pdf">Fast model for air source heat pump frosting and defrosting behavior</a>
        <span class="who">Zanetti, Scoccia and Aprile, Proceedings of the 19th IBPSA Building Simulation Conference, Brisbane, 2025. The validated twin of this model. The deposition law is Equation&nbsp;(4) on page&nbsp;3 and the validation measurements are in Table&nbsp;2 on page&nbsp;4.</span>
    </li>
    <li>
        <a href="https://www.osti.gov/biblio/2448280">A Review of Modeling Approaches for Predicting Frost Growth and Defrosting on Tube-Fin Heat Exchangers</a>
        <span class="who">Lu, Huang and Woods, NREL/CP-5500-89649, 20th International Refrigeration and Air Conditioning Conference, 2024. A map of the whole field.</span>
    </li>
    <li>
        <a href="https://doi.org/10.1016/j.energy.2023.127030">Development and validation of a dynamic modeling framework for air-source heat pumps under cycling of frosting and reverse-cycle defrosting</a>
        <span class="who">Ma, Kim, Braun and Horton, Energy 272, 127030, 2023. The high fidelity reference and the source of the defrost efficiency measurements. Paywalled; the open companion paper is <a href="https://ecp.ep.liu.se/index.php/modelica/article/download/621/559/577">Transient Simulation of an Air-source Heat Pump under Cycling of Frosting and Reverse-cycle Defrosting</a>.</span>
    </li>
    <li>
        <a href="https://ecp.ep.liu.se/index.php/modelica/article/download/1319/1133">Frost/Defrost Models for Air-Source Heat Pumps with Retained Water Refreezing Considered</a>
        <span class="who">Ma and Thorade, Proceedings of the 16th International Modelica Conference, 2025. Refreeze and retained water behaviour.</span>
    </li>
    <li>
        <a href="https://www.e3s-conferences.org/articles/e3sconf/pdf/2019/37/e3sconf_clima2019_01063.pdf">The modelling of reverse defrosting cycles of air-to-water heat pumps with TRNSYS</a>
        <span class="who">Dongellini, Piazzi, De Biagi and Morini, E3S Web of Conferences 111, 01063, CLIMA 2019. Seasonal penalties and the pre-defrost derating shape. The derating equation is Equation&nbsp;(2) on page&nbsp;4 and the seasonal results are on page&nbsp;7.</span>
    </li>
</ul>
</section>

<p class="footnote">
    Part of the <a href="../../../dynamic_heatpump">dynamic heat pump simulator</a> &middot;
    <a href="https://github.com/openenergymonitor/tools/tree/main/www/tools/dynamic_heatpump">source on GitHub</a> &middot;
    charts on this page are rendered from <code>model/frost.js</code> at load time.
</p>

</main>

<div id="tooltip"></div>

<script src="../model/frost.js"></script>
<script>
(function () {
    "use strict";

    // Simulator defaults (dynamic_heatpump.js `frost` config), the values the
    // figures and captions describe
    var CFG = {
        enabled: true,
        humidity: 80,
        use_csv_humidity: true,
        airflow: 3500,
        capture_eff: 0.45,
        coil_dt: 5,
        threshold: 2.0,
        defrost_power: 4000,
        defrost_elec: 1000,
        melt_eff: 0.6,
        overhead_kj: 300,
        derate_max: 20
    };
    var TIMESTEP = 60;

    // Same Magnus curve as frost.js (private there), for the psychrometric figure
    function sat_vp(T) { return 610.94 * Math.exp(17.625 * T / (T + 243.04)); }
    function humidity_ratio(vp) { return 0.622 * vp / (101325 - vp); }
    function w_gkg(T, rh) { return humidity_ratio(sat_vp(T) * rh * 0.01) * 1000; }

    // Frost growth rate (kg/h) at steady conditions, by stepping the real model
    function growth_rate(outside, rh) {
        var P = frost.setup(CFG, { timestep: TIMESTEP });
        var S = frost.init_state();
        S.mass = 0.5;   // frost present, so the sublimation branch is active too
        frost.step(P, S, { running: true, outside: outside, humidity: rh });
        return (S.mass - 0.5) * 3600 / TIMESTEP;
    }

    // ---------------------------------------------------------------------
    // Tiny SVG chart helpers
    // ---------------------------------------------------------------------
    var NS = { blue: "#2a78d6", orange: "#eb6834" };
    var RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
    var GRID = "#e7e4de", AXIS = "#c9c6bf";

    function scale(d0, d1, r0, r1) {
        var f = function (v) { return r0 + (v - d0) * (r1 - r0) / (d1 - d0); };
        f.invert = function (r) { return d0 + (r - r0) * (d1 - d0) / (r1 - r0); };
        return f;
    }
    function path(pts, x, y) {
        var d = "";
        for (var i = 0; i < pts.length; i++) {
            d += (i ? "L" : "M") + x(pts[i][0]).toFixed(1) + " " + y(pts[i][1]).toFixed(1);
        }
        return d;
    }
    function line(x1, y1, x2, y2, col, w) {
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
            '" stroke="' + col + '" stroke-width="' + (w || 1) + '"/>';
    }
    function txt(x, y, s, cls, anchor) {
        return '<text x="' + x + '" y="' + y + '" class="' + (cls || "tick") + '"' +
            (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>';
    }
    // Horizontal gridlines + left ticks + solid baseline
    function yGrid(ticks, x0, x1, y, fmt) {
        var s = "";
        ticks.forEach(function (t) {
            s += line(x0, y(t).toFixed(1), x1, y(t).toFixed(1), GRID);
            s += txt(x0 - 7, +y(t).toFixed(1) + 3.5, fmt ? fmt(t) : t, "tick", "end");
        });
        return s;
    }
    function xTicks(ticks, y0, x, fmt) {
        var s = "";
        ticks.forEach(function (t) {
            s += line(x(t).toFixed(1), y0, x(t).toFixed(1), y0 + 4, AXIS);
            s += txt(x(t).toFixed(1), y0 + 16, fmt ? fmt(t) : t, "tick", "middle");
        });
        return s;
    }
    // Spread direct labels vertically so none overlap
    function spread(items, minGap) {
        items.sort(function (a, b) { return a.y - b.y; });
        for (var i = 1; i < items.length; i++) {
            if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
        }
        return items;
    }

    // Shared tooltip
    var tip = document.getElementById("tooltip");
    function bindTooltip(wrapId, W, H, lookup) {
        var wrap = document.getElementById(wrapId);
        var svg = wrap.querySelector("svg");
        svg.addEventListener("mousemove", function (ev) {
            var r = svg.getBoundingClientRect();
            var px = (ev.clientX - r.left) * W / r.width;
            var res = lookup(px);
            if (!res) { tip.style.display = "none"; return; }
            tip.innerHTML = res.html;
            tip.style.display = "block";
            tip.style.left = (ev.clientX + window.scrollX) + "px";
            tip.style.top = (ev.clientY + window.scrollY) + "px";
        });
        svg.addEventListener("mouseleave", function () { tip.style.display = "none"; });
    }

    // ==================================================================
    // Fig 1 - Magnus saturation curve, the moisture wedge
    // ==================================================================
    (function () {
        var W = 800, H = 340, m = { l: 52, r: 20, t: 16, b: 40 };
        var x = scale(-15, 10, m.l, W - m.r);
        var y = scale(0, 8.2, H - m.b, m.t);

        var T_amb = 2, RH = 80, T_coil = T_amb - CFG.coil_dt; // -3 with coil_dt 5
        var wa = w_gkg(T_amb, RH), wc = w_gkg(T_coil, 100);

        var sat = [];
        for (var T = -15; T <= 10.001; T += 0.25) sat.push([T, w_gkg(T, 100)]);

        var s = "";
        s += yGrid([0, 2, 4, 6, 8], m.l, W - m.r, y, function (t) { return t; });
        s += xTicks([-15, -10, -5, 0, 5, 10], H - m.b, x, function (t) { return (t > 0 ? "+" : "") + t + "°"; });
        s += line(m.l, H - m.b, W - m.r, H - m.b, AXIS);
        s += txt(m.l - 38, m.t - 2, "g/kg", "axis-title", "start");
        s += txt((m.l + W - m.r) / 2, H - 6, "air temperature (°C)", "axis-title", "middle");

        // Saturation curve + wash beneath
        s += '<path d="' + path(sat, x, y) + ' L' + x(10).toFixed(1) + ' ' + y(0).toFixed(1) +
             ' L' + x(-15).toFixed(1) + ' ' + y(0).toFixed(1) + ' Z" fill="' + NS.blue + '" opacity="0.08"/>';
        s += '<path d="' + path(sat, x, y) + '" fill="none" stroke="' + NS.blue + '" stroke-width="2" stroke-linejoin="round"/>';
        s += txt(x(8.6), y(w_gkg(8.6, 100)) - 10, "saturation (100% RH)", "dlabel", "end");

        // Delta-w band between the two moisture levels, drawn left of the points
        var bx0 = x(-13), bx1 = x(T_coil);
        s += '<rect x="' + bx0 + '" y="' + y(wa).toFixed(1) + '" width="' + (bx1 - bx0).toFixed(1) +
             '" height="' + (y(wc) - y(wa)).toFixed(1) + '" fill="' + NS.orange + '" opacity="0.15"/>';

        // Guide lines from each point to the band (annotation guides, dashed)
        s += '<line x1="' + bx0 + '" y1="' + y(wa).toFixed(1) + '" x2="' + x(T_amb).toFixed(1) + '" y2="' + y(wa).toFixed(1) +
             '" stroke="' + AXIS + '" stroke-width="1" stroke-dasharray="3 3"/>';
        s += '<line x1="' + bx0 + '" y1="' + y(wc).toFixed(1) + '" x2="' + x(T_coil).toFixed(1) + '" y2="' + y(wc).toFixed(1) +
             '" stroke="' + AXIS + '" stroke-width="1" stroke-dasharray="3 3"/>';

        // Ambient air point (below the curve at 80% RH)
        s += '<circle cx="' + x(T_amb).toFixed(1) + '" cy="' + y(wa).toFixed(1) + '" r="5" fill="' + NS.blue + '" stroke="#fff" stroke-width="2"/>';
        s += txt(x(T_amb) + 10, y(wa) + 4, "ambient air · 2°C, 80% RH", "anno-strong", "start");

        // Evaporator point on the saturation curve
        s += '<circle cx="' + x(T_coil).toFixed(1) + '" cy="' + y(wc).toFixed(1) + '" r="5" fill="' + NS.blue + '" stroke="#fff" stroke-width="2"/>';
        s += txt(x(T_coil) + 12, y(wc) + 24, "evaporator surface · −3°C, saturated", "anno-strong", "start");

        // Delta-w label inside the band
        s += txt(x(-12.6), (y(wa) + y(wc)) / 2 + 4, "Δw → frost", "anno-strong", "start");

        // coil_dt bracket along the bottom
        var yb = y(0) - 12;
        s += '<line x1="' + x(T_coil).toFixed(1) + '" y1="' + yb + '" x2="' + x(T_amb).toFixed(1) + '" y2="' + yb +
             '" stroke="' + "#898781" + '" stroke-width="1"/>';
        s += txt((x(T_coil) + x(T_amb)) / 2, yb - 5, "coil_dt = 5 K", "anno", "middle");

        document.getElementById("fig_magnus").innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Saturation moisture content of air against temperature, showing the moisture excess between ambient air at 2 degrees and the evaporator at minus 3 degrees">' + s + '</svg>';

        function f2(v) { return v.toFixed(2) + " g/kg"; }
        document.getElementById("cap_wamb").textContent = f2(wa);
        document.getElementById("cap_wcoil").textContent = f2(wc);
        document.getElementById("cap_dw").textContent = f2(wa - wc);
    })();

    // ==================================================================
    // Fig 2 - the frosting band: growth rate vs temperature per RH
    // ==================================================================
    (function () {
        var W = 800, H = 392, m = { l: 52, r: 74, t: 28, b: 40 };
        var RHS = [60, 70, 80, 90, 100];
        var XMIN = -16, XMAX = CFG.coil_dt; // deposition ends where the evaporator hits 0C

        var series = RHS.map(function (rh) {
            var pts = [];
            for (var T = XMIN; T < XMAX - 0.001; T += 0.25) pts.push([T, growth_rate(T, rh)]);
            pts.push([XMAX - 0.01, growth_rate(XMAX - 0.01, rh)]);
            return { rh: rh, pts: pts };
        });
        var ymin = 0, ymax = 0;
        series.forEach(function (sr) { sr.pts.forEach(function (p) {
            if (p[1] < ymin) ymin = p[1];
            if (p[1] > ymax) ymax = p[1];
        }); });
        ymin = Math.floor(ymin * 2) / 2; ymax = Math.ceil(ymax * 2) / 2;

        var x = scale(XMIN, 7, m.l, W - m.r);
        var y = scale(ymin, ymax, H - m.b, m.t);

        var s = "";
        var yt = [];
        for (var v = ymin; v <= ymax + 0.001; v += 0.5) yt.push(Math.round(v * 2) / 2);
        s += yGrid(yt, m.l, W - m.r, y, function (t) { return t.toFixed(1); });
        s += xTicks([-15, -10, -5, 0, 5], H - m.b, x, function (t) { return (t > 0 ? "+" : "") + t + "°"; });
        s += line(m.l, H - m.b, W - m.r, H - m.b, AXIS);
        // Zero baseline emphasised
        s += line(m.l, y(0).toFixed(1), W - m.r, y(0).toFixed(1), AXIS, 1.5);
        s += txt(m.l - 38, 12, "kg/h", "axis-title", "start");
        s += txt((m.l + W - m.r) / 2, H - 6, "outside air temperature (°C)", "axis-title", "middle");

        // "No frost" region beyond +5C
        s += '<rect x="' + x(XMAX).toFixed(1) + '" y="' + m.t + '" width="' + (x(7) - x(XMAX)).toFixed(1) +
             '" height="' + (H - m.b - m.t) + '" fill="#f6f4f0"/>';
        s += line(x(XMAX).toFixed(1), m.t, x(XMAX).toFixed(1), H - m.b, AXIS);
        s += '<text x="' + (x(XMAX) + 11) + '" y="' + (m.t + 14) + '" class="anno" transform="rotate(90 ' +
             (x(XMAX) + 11) + ' ' + (m.t + 14) + ')">evaporator above 0°C: frost melts off</text>';

        // Sublimation annotation
        s += txt(x(-15.6), y(ymin) - 8, "↓ sublimation: frost evaporates into dry air", "anno", "start");

        series.forEach(function (sr, i) {
            s += '<path d="' + path(sr.pts, x, y) + '" fill="none" stroke="' + RAMP[i] +
                 '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        });

        // Direct labels at the right edge, collision-spread
        var labels = series.map(function (sr, i) {
            var last = sr.pts[sr.pts.length - 1];
            return { text: sr.rh + "% RH", y: y(last[1]), color: RAMP[i] };
        });
        spread(labels, 15).forEach(function (l) {
            s += '<text x="' + (x(XMAX) + 26) + '" y="' + (l.y + 4).toFixed(1) + '" class="dlabel">' + l.text + '</text>';
        });

        document.getElementById("fig_band").innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Frost growth rate against outside temperature for relative humidities from 60 to 100 percent">' + s + '</svg>';

        // Legend
        document.getElementById("legend_band").innerHTML = series.map(function (sr, i) {
            return '<span class="key"><span class="swatch-line" style="border-color:' + RAMP[i] + '"></span>' + sr.rh + '% RH</span>';
        }).join("");

        // Table twin: 2C steps
        var rows = "<tr><th>Outside °C</th>" + RHS.map(function (r) { return "<th>" + r + "% RH</th>"; }).join("") + "</tr>";
        for (var T = -14; T <= 4.001; T += 2) {
            rows += "<tr><td>" + (T > 0 ? "+" : "") + T + "</td>" + RHS.map(function (rh) {
                return "<td>" + growth_rate(T, rh).toFixed(2) + "</td>";
            }).join("") + "</tr>";
        }
        document.getElementById("table_band").innerHTML =
            "<table><caption style='caption-side:bottom;text-align:left;color:var(--muted);padding-top:.25rem'>Frost growth rate, kg per hour of runtime</caption>" + rows + "</table>";

        // Tooltip: nearest temperature, all series
        bindTooltip("fig_band", W, H, function (px) {
            if (px < m.l || px > x(XMAX)) return null;
            var T = Math.round(x.invert(px) * 2) / 2;
            if (T >= XMAX) T = XMAX - 0.5;
            var html = '<div class="tt-title">' + (T > 0 ? "+" : "") + T + "°C outside</div>";
            RHS.forEach(function (rh) {
                html += rh + "% RH: " + growth_rate(T, rh).toFixed(2) + " kg/h<br>";
            });
            return { html: html };
        });
    })();

    // ==================================================================
    // Fig 3 - state machine diagram (static SVG)
    // ==================================================================
    (function () {
        var W = 800, H = 330;
        var s = "";

        function box(x, y, w, h, stroke, title, lines) {
            var b = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
                '" rx="10" fill="#fff" stroke="' + stroke + '" stroke-width="1.5"/>';
            b += '<rect x="' + x + '" y="' + y + '" width="4" height="' + h + '" rx="2" fill="' + stroke + '"/>';
            b += '<text x="' + (x + 16) + '" y="' + (y + 24) + '" class="anno-strong" style="font-size:13px">' + title + '</text>';
            lines.forEach(function (l, i) {
                b += '<text x="' + (x + 16) + '" y="' + (y + 44 + i * 16) + '" class="anno" style="font-size:11px">' + l + '</text>';
            });
            return b;
        }
        function arrow(x1, y1, x2, y2, label, labelDy, dashed) {
            var a = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
                '" stroke="#898781" stroke-width="1.5"' + (dashed ? ' stroke-dasharray="4 4"' : '') + ' marker-end="url(#ah)"/>';
            if (label) {
                a += '<text x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2 + (labelDy || -8)) +
                    '" class="anno" text-anchor="middle" style="font-size:11px">' + label + '</text>';
            }
            return a;
        }

        s += '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
             '<path d="M0 0 L10 5 L0 10 z" fill="#898781"/></marker></defs>';

        // Frosting box (left), Defrost box (right), Melt box (bottom left)
        s += box(30, 40, 300, 110, NS.blue, "FROSTING", [
            "compressor on · evaporator below 0°C",
            "mass += ṁ_air · Δw · capture_eff · dt",
            "capacity derates as frost builds"
        ]);
        s += box(470, 40, 300, 110, NS.orange, "REVERSE-CYCLE DEFROST", [
            "heat output zero · 4 kW drawn from circuit",
            "300 kJ overhead first, then melt",
            "at defrost_power · melt_eff ÷ 334 kJ/kg"
        ]);
        s += box(30, 230, 300, 70, "#898781", "NATURAL MELT", [
            "evaporator above 0°C: fan-driven melt",
            "unit off in warm air: slow melt (×0.1)"
        ]);

        s += arrow(330, 75, 470, 75, "frost mass ≥ 2 kg", -8);
        s += arrow(470, 118, 330, 118, "melted (mass = 0)", 16);
        // Safety cap: routed under the two main boxes, re-entering FROSTING
        s += '<path d="M 620 150 L 620 195 L 200 195 L 200 150" fill="none" stroke="#898781" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#ah)"/>';
        s += '<text x="410" y="188" class="anno" text-anchor="middle" style="font-size:11px">20 min safety cap: residual frost retained (refreezes)</text>';
        // Frosting <-> natural melt, left of the safety-cap route
        s += arrow(100, 150, 100, 230, "", 0, false);
        s += arrow(160, 230, 160, 150, "", 0, false);
        s += '<text x="92" y="188" class="anno" text-anchor="end" style="font-size:11px">evaporator</text>';
        s += '<text x="92" y="202" class="anno" text-anchor="end" style="font-size:11px">crosses 0°C</text>';

        document.getElementById("fig_states").innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="State machine: frosting leads to defrost at 2 kilograms, defrost returns to frosting when melted or at the 20 minute cap, and natural melt removes frost when the evaporator is above freezing">' + s + '</svg>';
    })();

    // ==================================================================
    // Fig 4 - a frosty day: 8 h sawtooth + capacity panel
    // ==================================================================
    var day = (function () {
        var P = frost.setup(CFG, { timestep: TIMESTEP });
        var S = frost.init_state();
        var hours = 8, n = hours * 3600 / TIMESTEP;
        var rec = [], starts = [], defrost_s = 0;
        for (var i = 0; i <= n; i++) {
            var fr = frost.step(P, S, { running: true, outside: 2, humidity: 85 });
            if (fr.started) starts.push(i * TIMESTEP);
            if (fr.defrosting) defrost_s += TIMESTEP;
            rec.push({
                t: i * TIMESTEP,
                mass: S.mass,
                defrosting: fr.defrosting,
                cap: fr.defrosting ? 0 : fr.capacity_factor
            });
        }
        // Cycle stats
        var period = starts.length > 1 ? (starts[starts.length - 1] - starts[0]) / (starts.length - 1) : 0;
        var duration = starts.length ? defrost_s / starts.length : 0;
        var cycle_kj = (CFG.overhead_kj + CFG.threshold * 334 / CFG.melt_eff);
        return { rec: rec, starts: starts, period: period, duration: duration, cycle_kj: cycle_kj, hours: hours };
    })();

    (function () {
        var W = 800, HT = 300, HB = 130, GAP = 34, H = HT + GAP + HB;
        var m = { l: 52, r: 20 };
        var x = scale(0, day.hours * 3600, m.l, W - m.r);
        var yM = scale(0, 2.4, HT - 30, 16);              // mass panel
        var yC = scale(0, 100, HT + GAP + HB - 30, HT + GAP + 6); // capacity panel

        var s = "";

        // Defrost shading (both panels)
        var bands = [];
        var inD = false, d0 = 0;
        day.rec.forEach(function (r) {
            if (r.defrosting && !inD) { inD = true; d0 = r.t; }
            if (!r.defrosting && inD) { inD = false; bands.push([d0, r.t]); }
        });
        bands.forEach(function (b) {
            var bx = x(b[0]), bw = Math.max(2, x(b[1]) - x(b[0]));
            s += '<rect x="' + bx.toFixed(1) + '" y="' + yM(2.4).toFixed(1) + '" width="' + bw.toFixed(1) +
                 '" height="' + (yM(0) - yM(2.4)).toFixed(1) + '" fill="' + NS.orange + '" opacity="0.16"/>';
            s += '<rect x="' + bx.toFixed(1) + '" y="' + yC(100).toFixed(1) + '" width="' + bw.toFixed(1) +
                 '" height="' + (yC(0) - yC(100)).toFixed(1) + '" fill="' + NS.orange + '" opacity="0.16"/>';
        });

        // --- Mass panel
        s += yGrid([0, 0.5, 1, 1.5, 2], m.l, W - m.r, yM, function (t) { return t.toFixed(1); });
        s += txt(m.l - 38, 10, "kg", "axis-title", "start");
        // Threshold reference line
        s += '<line x1="' + m.l + '" y1="' + yM(2).toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + yM(2).toFixed(1) +
             '" stroke="' + NS.orange + '" stroke-width="1" stroke-dasharray="4 4"/>';
        s += txt(W - m.r, yM(2) - 6, "defrost trigger · 2 kg", "anno", "end");

        var massPts = day.rec.map(function (r) { return [r.t, Math.min(r.mass, 2.4)]; });
        s += '<path d="' + path(massPts, x, yM) + '" fill="none" stroke="' + NS.blue + '" stroke-width="2" stroke-linejoin="round"/>';
        s += line(m.l, yM(0).toFixed(1), W - m.r, yM(0).toFixed(1), AXIS);

        // Defrost label above first band
        if (bands.length) {
            var bx = (x(bands[0][0]) + x(bands[0][1])) / 2;
            s += txt(bx, yM(2.4) + 0, "defrost", "dlabel", "middle");
        }

        // --- Capacity panel
        s += yGrid([0, 50, 100], m.l, W - m.r, yC, function (t) { return t + "%"; });
        s += txt(m.l - 38, HT + GAP - 10, "available capacity", "axis-title", "start");
        var capPts = day.rec.map(function (r) { return [r.t, r.cap * 100]; });
        s += '<path d="' + path(capPts, x, yC) + ' L' + x(day.hours * 3600).toFixed(1) + ' ' + yC(0).toFixed(1) +
             ' L' + x(0).toFixed(1) + ' ' + yC(0).toFixed(1) + ' Z" fill="' + NS.blue + '" opacity="0.10"/>';
        s += '<path d="' + path(capPts, x, yC) + '" fill="none" stroke="' + NS.blue + '" stroke-width="2" stroke-linejoin="round"/>';
        s += line(m.l, yC(0).toFixed(1), W - m.r, yC(0).toFixed(1), AXIS);
        s += txt(W - m.r - 30, yC(80) + 16, "−20% at trigger", "anno", "end");

        // Shared x axis
        var ht = [];
        for (var h = 0; h <= day.hours; h++) ht.push(h * 3600);
        s += xTicks(ht, yC(0), x, function (t) { return (t / 3600) + "h"; });
        s += txt((m.l + W - m.r) / 2, H - 2, "hours of compressor runtime", "axis-title", "middle");

        document.getElementById("fig_day").innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Eight hour simulation: frost mass saw-tooths to the 2 kilogram trigger roughly every hour and a half; capacity falls to 80 percent then drops to zero during each defrost">' + s + '</svg>';

        // Caption stats
        var pmin = Math.round(day.period / 60), dmin = (day.duration / 60);
        document.getElementById("cap_day").innerHTML =
            "In these conditions the model frosts to 2&nbsp;kg in about <strong>" + pmin +
            " minutes</strong> and then defrosts for <strong>" + dmin.toFixed(1) +
            " minutes</strong>, giving " + day.starts.length + " cycles in " + day.hours +
            " hours. Each cycle draws " + Math.round(day.cycle_kj) + "&nbsp;kJ (" +
            (day.cycle_kj / 3600).toFixed(2) + "&nbsp;kWh) from the heating circuit. " +
            "Zanetti et&nbsp;al. measured trigger intervals of 100 to 113 minutes at 2 to 5&nbsp;&deg;C and 85% RH.";
        document.getElementById("tile_period").innerHTML =
            "~" + pmin + '<span class="unit">min</span>';
        document.getElementById("tile_duration").innerHTML =
            dmin.toFixed(1).replace(/\.0$/, "") + '<span class="unit">min</span>';
        document.getElementById("tile_duration_note").textContent =
            "drawing " + (CFG.defrost_power / 1000) + " kW from the heating circuit";

        // Table twin
        var rows = "<tr><th>Time</th><th>Frost kg</th><th>Capacity %</th><th>State</th></tr>";
        for (var i = 0; i < day.rec.length; i += 900 / TIMESTEP) {
            var r = day.rec[i];
            var hh = Math.floor(r.t / 3600), mm = Math.round((r.t % 3600) / 60);
            rows += "<tr><td>" + hh + ":" + (mm < 10 ? "0" : "") + mm + "</td><td>" + r.mass.toFixed(2) +
                "</td><td>" + Math.round(r.cap * 100) + "</td><td style='text-align:left'>" +
                (r.defrosting ? "defrost" : "frosting") + "</td></tr>";
        }
        document.getElementById("table_day").innerHTML = "<table>" + rows + "</table>";

        // Tooltip
        bindTooltip("fig_day", W, H, function (px) {
            if (px < m.l || px > W - m.r) return null;
            var t = x.invert(px);
            var i = Math.max(0, Math.min(day.rec.length - 1, Math.round(t / TIMESTEP)));
            var r = day.rec[i];
            var hh = Math.floor(r.t / 3600), mm = Math.round((r.t % 3600) / 60);
            return { html: '<div class="tt-title">' + hh + ":" + (mm < 10 ? "0" : "") + mm + " · " +
                (r.defrosting ? "defrosting" : "frosting") + "</div>" +
                "frost: " + r.mass.toFixed(2) + " kg<br>capacity: " + Math.round(r.cap * 100) + "%" };
        });
    })();

    // ==================================================================
    // Fig 5 - defrost efficiency vs trigger mass
    // ==================================================================
    (function () {
        var W = 800, H = 320, m = { l: 52, r: 20, t: 18, b: 40 };
        var x = scale(0, 4, m.l, W - m.r);
        var y = scale(0, 70, H - m.b, m.t);

        function eff(kg) {
            var melt = kg * 334;                          // kJ of useful latent heat
            var drawn = CFG.overhead_kj + kg * 334 / CFG.melt_eff;
            return 100 * melt / drawn;
        }

        var pts = [];
        for (var kg = 0.05; kg <= 4.001; kg += 0.05) pts.push([kg, eff(kg)]);

        var s = "";
        s += yGrid([0, 20, 40, 60], m.l, W - m.r, y, function (t) { return t + "%"; });
        s += xTicks([0, 1, 2, 3, 4], H - m.b, x, function (t) { return t; });
        s += line(m.l, y(0).toFixed(1), W - m.r, y(0).toFixed(1), AXIS);
        s += txt(m.l - 38, m.t - 4, "defrost efficiency", "axis-title", "start");
        s += txt((m.l + W - m.r) / 2, H - 6, "frost melted per cycle (kg)", "axis-title", "middle");

        // melt_eff ceiling
        s += '<line x1="' + m.l + '" y1="' + y(60).toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + y(60).toFixed(1) +
             '" stroke="' + AXIS + '" stroke-width="1" stroke-dasharray="4 4"/>';
        s += txt(W - m.r, y(60) - 6, "melt_eff ceiling · 60%", "anno", "end");

        s += '<path d="' + path(pts, x, y) + '" fill="none" stroke="' + NS.blue + '" stroke-width="2" stroke-linejoin="round"/>';

        // Anchors: light frost + default trigger
        var e05 = eff(0.5), e2 = eff(2);
        s += '<circle cx="' + x(0.5).toFixed(1) + '" cy="' + y(e05).toFixed(1) + '" r="5" fill="' + NS.blue + '" stroke="#fff" stroke-width="2"/>';
        s += txt(x(0.5) + 10, y(e05) + 18, "0.5 kg → " + e05.toFixed(0) + "%  (Ma 2023 measured ~30% for light frost)", "anno-strong", "start");
        s += '<circle cx="' + x(2).toFixed(1) + '" cy="' + y(e2).toFixed(1) + '" r="5" fill="' + NS.orange + '" stroke="#fff" stroke-width="2"/>';
        s += txt(x(2) + 10, y(e2) + 18, "default trigger: 2 kg → " + e2.toFixed(0) + "%", "anno-strong", "start");

        document.getElementById("fig_eff").innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Defrost efficiency rises with the amount of frost melted per cycle, from about 29 percent at half a kilogram towards the 60 percent ceiling">' + s + '</svg>';

        document.getElementById("cap_eff_light").textContent = e05.toFixed(0) + "%";
        var kj2 = CFG.overhead_kj + 2 * 334 / CFG.melt_eff;
        document.getElementById("cap_eff_cycle").textContent = Math.round(kj2) + " kJ (" + (kj2 / 3600).toFixed(2) + " kWh)";

        // Table twin
        var rows = "<tr><th>Frost melted (kg)</th><th>Heat drawn (kJ)</th><th>Efficiency</th></tr>";
        [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].forEach(function (kg) {
            var drawn = CFG.overhead_kj + kg * 334 / CFG.melt_eff;
            rows += "<tr><td>" + kg.toFixed(1) + "</td><td>" + Math.round(drawn) + "</td><td>" + eff(kg).toFixed(0) + "%</td></tr>";
        });
        document.getElementById("table_eff").innerHTML = "<table>" + rows + "</table>";

        bindTooltip("fig_eff", W, H, function (px) {
            if (px < m.l || px > W - m.r) return null;
            var kg = Math.max(0.05, Math.round(x.invert(px) * 20) / 20);
            if (kg > 4) kg = 4;
            var drawn = CFG.overhead_kj + kg * 334 / CFG.melt_eff;
            return { html: '<div class="tt-title">' + kg.toFixed(2) + " kg melted</div>" +
                "heat drawn: " + Math.round(drawn) + " kJ<br>efficiency: " + eff(kg).toFixed(0) + "%" };
        });
    })();

})();
</script>

</body>

</html>
