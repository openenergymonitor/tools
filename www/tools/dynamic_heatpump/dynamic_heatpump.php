<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo $title; ?></title>
    <meta name="description" content="<?php echo $description; ?>">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
</head>

<body>

<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>

<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/fontawesome.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/solid.min.css">
<script src="<?php echo $path_lib;?>ecodan.js?v=1"></script>
<script src="<?php echo $path_lib;?>vaillant.js?v=11"></script>

<style>
    /* Hide the raw template until Vue has mounted */
    [v-cloak] { display: none !important; }

    /* ====================================================================
       Dynamic heat pump simulator — app shell
       Wide (>=992px): three columns (group rail | parameters | results),
       each scrolling internally within the viewport. Narrow: one page
       scroller — the rail sits beside the parameter fields as a
       collapsible sidebar, and the run bar + headline KPI strip stick to
       the bottom of the screen while the config is edited, settling into
       their natural position once scrolled past.
       (Layout reference: heat-pump-simulator-vue-reference.html)
       ==================================================================== */
    .hp-app {
        --hp-bg: #f6f4f0;
        --hp-surface: #fff;
        --hp-rail-bg: #faf8f5;
        --hp-border: #e3e0da;
        --hp-border-soft: #e9e5df;
        --hp-dark: #1f1d1a;
        --hp-oem: #45a2c9;
        --hp-ink: #000;
        --hp-muted: #33302b;
        --hp-accent: #f0c400;
        --hp-good: #1e7a43;
        --hp-bad: #a8281a;
        --hp-strip-h: 56px;   /* mobile KPI strip height = run bar offset */
        display: flex;
        flex-direction: column;
        background: var(--hp-bg);
        color: var(--hp-ink);
    }
    /* Narrow: a wrapping flex row — rail and panel share the first line,
       the KPI strip and results each take a full line below. Wide: the
       classic three-column row. */
    .hp-body {
        display: flex;
        flex-flow: row wrap;
    }
    @media (max-width: 991.98px) {
        /* Non-zero basis so the panel keeps a usable width beside the
           145px rail on narrow phones. */
        .hp-body > .hp-panel { flex: 1 1 160px; min-width: 0; }
        .hp-body > .hp-kpi-strip,
        .hp-body > .hp-results { flex: 0 0 100%; }
    }
    @media (min-width: 992px) {
        .hp-app { height: 100vh; }
        .hp-body { flex: 1 1 auto; flex-wrap: nowrap; min-height: 0; }
    }

    /* --- Header bar ----------------------------------------------------- */
    .hp-header {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .75rem;
        flex-wrap: wrap;
        padding: .6rem 1.25rem;
        background: var(--hp-oem);
    }
    .hp-title {
        font-size: 1.02rem;
        font-weight: 600;
        color: #fff;
    }
    .hp-subtitle {
        font-size: .83rem;
        color: rgba(255, 255, 255, .85);
        margin-left: .5rem;
    }
    /* Header buttons: outlined in the header's own colour rather than a fixed
       shade, so they stay legible if --hp-oem changes */
    .hp-btn-dark {
        color: #fff;
        border: 1px solid rgba(255, 255, 255, .55);
        background: rgba(255, 255, 255, .12);
    }
    .hp-btn-dark:hover,
    .hp-btn-dark:focus {
        color: #fff;
        border-color: #fff;
        background: rgba(255, 255, 255, .24);
    }
    .hp-btn-dark:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 1px;
        box-shadow: none;
    }

    /* --- Parameter group rail ------------------------------------------- */
    /* A vertical list at every width. On narrow screens it sits beside the
       parameter fields and slides away via the toggle in the panel header
       (.hp-rail-toggle) to give the fields the full width. */
    .hp-rail {
        flex: 0 0 145px;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: .4rem 0;
        background: var(--hp-rail-bg);
        border-right: 1px solid var(--hp-border);
    }
    .hp-rail-btn {
        display: flex;
        align-items: center;
        gap: .5rem;
        border: 0;
        background: transparent;
        text-align: left;
        font-size: .84rem;
        line-height: 1.3;
        color: #1f1d1a;
        padding: .5rem .75rem;
        border-left: 3px solid transparent;
    }
    .hp-rail-btn.active {
        color: var(--hp-ink);
        font-weight: 600;
        background: var(--hp-surface);
        border-left-color: #0d6efd;
    }
    .hp-rail-btn-essentials.active { border-left-color: var(--hp-accent); }
    .hp-rail-btn .hp-dot {
        flex: none;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--hp-accent);
        display: block;
    }
    .hp-rail-heading {
        font-size: .71rem;
        font-weight: 600;
        letter-spacing: .08em;
        color: #44403a;
        padding: .15rem 1rem .4rem;
    }
    .hp-rail-divider {
        margin: .6rem 1rem .4rem;
        border-top: 1px solid var(--hp-border-soft);
    }
    .hp-rail-footer {
        margin-top: auto;
        padding: .75rem 1rem;
        border-top: 1px solid var(--hp-border-soft);
        font-size: .73rem;
        line-height: 1.6;
        color: #44403a;
    }
    @media (max-width: 991.98px) {
        .hp-rail-btn { min-height: 44px; }   /* comfortable touch target */
        .hp-rail.hp-rail-closed { display: none; }
    }
    @media (min-width: 992px) {
        .hp-rail { flex-basis: 200px; padding: .6rem 0; }
        .hp-rail-btn { font-size: .87rem; padding: .5rem 1rem; }
    }

    /* Narrow-only button that slides the group rail away / back */
    .hp-rail-toggle {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        font-family: var(--bs-font-monospace);
        font-size: .97rem;
        color: #000;
        background: var(--hp-rail-bg);
        border: 1px solid #ddd8d1;
        border-radius: .375rem;
    }

    /* --- Parameter panel ------------------------------------------------- */
    .hp-panel {
        display: flex;
        flex-direction: column;
        background: var(--hp-surface);
    }
    @media (max-width: 991.98px) {
        .hp-panel-header,
        .hp-panel-fields,
        .hp-runbar { padding-left: .9rem; padding-right: .9rem; }
    }
    @media (min-width: 992px) {
        .hp-panel {
            flex: 0 1 470px;
            min-width: 380px;
            border-right: 1px solid var(--hp-border);
        }
        .hp-panel-fields {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
        }
    }
    .hp-panel-header { padding: 1rem 1.25rem .5rem; }
    .hp-panel-title {
        margin: 0;
        font-size: 1.02rem;
        font-weight: 600;
    }
    .hp-panel-desc {
        margin: .25rem 0 0;
        font-size: .83rem;
        line-height: 1.55;
        color: var(--hp-muted);
    }
    .hp-panel-fields { padding: .5rem 1.25rem 1.25rem; }
    .hp-badge-essentials {
        font-size: .71rem;
        font-weight: 500;
        color: #4d3c00;
        background: #fff5cc;
        border-radius: 3px;
        padding: 2px 6px;
        white-space: nowrap;
    }
    .hp-subheading {
        font-size: .87rem;
        font-weight: 600;
        margin: 1.25rem 0 .5rem;
        padding-top: .75rem;
        border-top: 1px solid var(--hp-border-soft);
    }

    /* Field grid: two columns of labelled inputs */
    .hp-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: .75rem .9rem;
        align-content: start;
    }
    .hp-field-wide { grid-column: 1 / -1; }
    @media (max-width: 575.98px) {
        /* minmax(0, 1fr) so the track can shrink below the steppers'
           min-content width when the group rail is open beside the panel */
        .hp-field-grid { grid-template-columns: minmax(0, 1fr); }
    }
    .hp-field {
        display: flex;
        flex-direction: column;
        gap: .25rem;
    }
    .hp-field-label {
        font-size: .81rem;
        color: #1f1d1a;
    }
    .hp-field-label small { color: #44403a; }

    /* Stepper input: [-] value unit [+] */
    .hp-stepper {
        display: flex;
        align-items: center;
        border: 1px solid #aaa49b;
        border-radius: .375rem;
        background: var(--hp-surface);
        overflow: hidden;
    }
    .hp-stepper.disabled { background: #f4f2ee; }
    .hp-stepper button {
        border: 0;
        background: transparent;
        color: #1f1d1a;
        font-family: var(--bs-font-monospace);
        padding: .25rem .6rem;
        line-height: 1.5;
    }
    .hp-stepper button:hover:not(:disabled) { background: #f4f2ee; }
    .hp-stepper button:first-child { border-right: 1px solid var(--hp-border-soft); }
    .hp-stepper button:last-child { border-left: 1px solid var(--hp-border-soft); }
    .hp-stepper input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        text-align: right;
        font-family: var(--bs-font-monospace);
        font-size: .88rem;
        font-weight: 500;
        padding: .3rem .3rem;
    }
    .hp-stepper .hp-unit {
        font-size: .73rem;
        font-family: var(--bs-font-monospace);
        color: #44403a;
        padding-right: .4rem;
        white-space: nowrap;
    }

    /* Read-only stat rows */
    .hp-stats { margin-top: .75rem; }
    .hp-stat {
        display: flex;
        justify-content: space-between;
        gap: .75rem;
        font-size: .84rem;
        color: #000;
        padding: .3rem 0;
        border-top: 1px dashed var(--hp-border-soft);
    }
    .hp-stat-value {
        font-family: var(--bs-font-monospace);
        color: var(--hp-ink);
        white-space: nowrap;
    }
    .hp-switch { font-size: .84rem; }

    /* Run bar at the bottom of the parameter panel. On narrow screens it
       sticks just above the KPI strip while the config is edited, then
       settles into its natural place at the end of the panel. */
    .hp-runbar {
        flex: none;
        display: flex;
        align-items: center;
        gap: .6rem;
        /* Bottom of the panel's flex column — on narrow screens the panel
           stretches to the open rail's height, and without this the bar
           would sit mid-panel right after the fields */
        margin-top: auto;
        padding: .7rem 1.25rem;
        background: #fbfaf7;
        border-top: 1px solid var(--hp-border-soft);
    }
    @media (max-width: 991.98px) {
        .hp-runbar {
            position: sticky;
            bottom: var(--hp-strip-h);
            z-index: 10;
            flex-wrap: wrap;
            border-bottom: 1px solid var(--hp-border-soft);
            box-shadow: 0 -3px 10px rgba(0, 0, 0, .05);
        }
        /* When the group rail is open beside the panel, bleed the bar left
           under the rail's 145px column so it spans the full screen width */
        .hp-rail:not(.hp-rail-closed) ~ .hp-panel .hp-runbar {
            margin-left: -145px;
        }
    }

    /* Narrow-only headline results strip: sticks to the bottom edge below
       the run bar. 1px grid gaps over the border colour draw the
       separators between cells. */
    .hp-kpi-strip {
        position: sticky;
        bottom: 0;
        z-index: 9;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1px;
        height: var(--hp-strip-h);
        background: var(--hp-border);
        border-top: 1px solid #d8d3cb;
        border-bottom: 1px solid #d8d3cb;
    }
    .hp-kpi-strip-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        padding: .25rem;
        overflow: hidden;
        background: var(--hp-surface);
    }
    .hp-kpi-strip-label {
        font-size: .66rem;
        color: var(--hp-muted);
    }
    .hp-kpi-strip-value {
        font-family: var(--bs-font-monospace);
        font-size: .92rem;
        font-weight: 600;
        white-space: nowrap;
    }
    .hp-kpi-strip .hp-kpi-delta { font-size: .66rem; }
    .hp-badge-unrun {
        font-size: .79rem;
        font-weight: 500;
        color: #5c4400;
        background: #fff8e1;
        border: 1px solid #f0e2b0;
        border-radius: 4px;
        padding: 3px 9px;
        white-space: nowrap;
    }
    .hp-run-hint {
        font-size: .79rem;
        color: var(--hp-muted);
    }
    .hp-run-progress { flex: 1; }

    /* --- Results column -------------------------------------------------- */
    .hp-results {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    @media (min-width: 992px) {
        .hp-results { flex: 1 1 560px; }
        .hp-results-scroll {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
        }
    }
    .hp-results-toolbar {
        flex: none;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: .6rem;
        padding: .5rem 1.1rem;
        background: var(--hp-surface);
        border-bottom: 1px solid var(--hp-border);
    }
    .hp-results-scroll { padding: .9rem 1.1rem 1.5rem; }
    .hp-tabs {
        display: inline-flex;
        background: #f2efea;
        border-radius: .45rem;
        padding: 2px;
    }
    .hp-tab {
        border: 0;
        background: transparent;
        font-size: .87rem;
        font-weight: 500;
        color: var(--hp-muted);
        padding: .25rem .9rem;
        border-radius: .35rem;
    }
    .hp-tab.active {
        background: var(--hp-surface);
        color: var(--hp-ink);
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
    }
    .hp-mode-select { width: auto; }
    .hp-run-indicator {
        display: flex;
        align-items: center;
        gap: .45rem;
        font-size: .81rem;
        color: var(--hp-muted);
    }
    .hp-run-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--hp-good);
        display: block;
    }
    .hp-run-dot.stale { background: #b8860b; }

    /* KPI cards. On narrow screens the sticky strip is the results line,
       so the full cards are wide-only (the tables view has every value). */
    .hp-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: .75rem;
        margin-bottom: .9rem;
    }
    @media (max-width: 991.98px) {
        .hp-kpi-grid { display: none; }
    }
    .hp-kpi {
        background: var(--hp-surface);
        border: 1px solid var(--hp-border);
        border-radius: .4rem;
        padding: .6rem .75rem;
    }
    .hp-kpi-label {
        font-size: .77rem;
        color: var(--hp-muted);
        margin-bottom: .15rem;
        white-space: nowrap;
    }
    .hp-kpi-value {
        font-family: var(--bs-font-monospace);
        font-size: 1.25rem;
        font-weight: 600;
    }
    .hp-kpi-delta {
        font-size: .77rem;
        font-family: var(--bs-font-monospace);
    }
    .hp-kpi-delta.good { color: var(--hp-good); }
    .hp-kpi-delta.bad { color: var(--hp-bad); }
    .hp-kpi-delta.neutral { color: var(--hp-muted); }

    /* Result cards & tables */
    .hp-card {
        background: var(--hp-surface);
        border: 1px solid var(--hp-border);
        border-radius: .4rem;
        padding: .7rem .9rem;
        margin-bottom: .9rem;
    }
    .hp-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: .5rem;
        font-size: .88rem;
        font-weight: 600;
        margin-bottom: .5rem;
    }
    .hp-card .table {
        font-size: .84rem;
        margin-bottom: 0;
    }
    .hp-card .table td, .hp-card .table th { padding: .3rem .5rem; }
    .hp-note {
        font-size: .81rem;
        color: var(--hp-muted);
        margin: .5rem 0 0;
    }
    .hp-table-panel { font-size: .84rem; }
    .hp-table-panel td, .hp-table-panel th { padding: .25rem .3rem; vertical-align: middle; }

    /* Chart nav: segmented pan / zoom / reset control, sharing the tab
       strip's recessed-track look (soft track, segments lift to white) */
    .hp-chart-nav {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: #f2efea;
        border-radius: .45rem;
        padding: 2px;
    }
    .hp-nav-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 30px;
        height: 26px;
        border: 0;
        background: transparent;
        border-radius: .35rem;
        font-size: .78rem;
        color: var(--hp-muted);
        padding: 0 .4rem;
    }
    .hp-nav-btn:hover:not(:disabled) {
        background: var(--hp-surface);
        color: var(--hp-ink);
        box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
    }
    .hp-nav-btn:active:not(:disabled) {
        background: #e7e3dc;
        box-shadow: none;
    }
    .hp-nav-btn:focus-visible {
        outline: 2px solid #0d6efd;
        outline-offset: 1px;
    }
    .hp-nav-btn:disabled {
        color: #b3ada3;
        cursor: default;
    }
    /* Selected segment in a nav group used as a toggle (chart resolution,
       daily energy split) — lifts out of the track like the active tab */
    .hp-nav-btn.active {
        background: var(--hp-surface);
        color: var(--hp-ink);
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
    }
    .hp-nav-btn-text {
        font-weight: 500;
        padding: 0 .55rem;
    }
    .hp-nav-sep {
        width: 1px;
        height: 15px;
        margin: 0 2px;
        background: #ddd8d1;
    }
    .hp-nav-range {
        font-family: var(--bs-font-monospace);
        font-size: .74rem;
        color: var(--hp-muted);
        white-space: nowrap;
    }
    @media (max-width: 991.98px) {
        /* Comfortable touch targets on phones */
        .hp-nav-btn { min-width: 38px; height: 32px; }
    }

    /* Chart legend: clickable series pills with colour dots */
    .hp-legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .35rem;
    }
    .hp-legend-pill {
        display: inline-flex;
        align-items: center;
        gap: .38rem;
        border: 1px solid var(--hp-border);
        border-radius: 999px;
        background: var(--hp-surface);
        font-size: .78rem;
        line-height: 1.4;
        color: var(--hp-ink);
        padding: .14rem .6rem .14rem .45rem;
        cursor: pointer;
        white-space: nowrap;
    }
    .hp-legend-pill:hover { border-color: #b5afa6; }
    .hp-legend-pill.off {
        color: #8a857d;
        background: var(--hp-bg);
        border-style: dashed;
    }
    .hp-legend-dot {
        flex: none;
        display: block;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        /* Hidden series: hollow dot (no inline background set) */
        border: 1.5px solid #b5afa6;
    }
    .hp-legend-pill:not(.off) .hp-legend-dot { border: 0; }

    /* Chart */
    .hp-graph-bound {
        width: 100%;
        height: 400px;
        position: relative;
    }
    #spinner-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    #spinner-overlay.active { display: flex; }
    .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>

<div id="app" class="hp-app" v-cloak>

    <!-- ================= Header bar ================= -->
    <header class="hp-header">
        <div class="d-flex align-items-baseline flex-wrap">
            <button type="button" class="btn btn-sm hp-btn-dark me-2" data-bs-toggle="offcanvas" data-bs-target="#sidebar" aria-controls="sidebar" aria-label="Open tools menu"><i class="fa-solid fa-bars"></i></button>
            <span class="hp-title">Dynamic heat pump simulator</span>
            <span class="hp-subtitle">{{ mode == 'day' ? 'single day' : 'full year' }} &middot; run {{ simulation_index }}<span v-if="baseline_enabled"> &middot; vs baseline</span></span>
        </div>
        <div class="d-flex gap-2">
            <div class="dropdown">
                <button type="button" class="btn btn-sm hp-btn-dark dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">Docs</button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="<?php echo $path; ?>docs/frost.html">How the frost &amp; defrost model works</a></li>
                </ul>
            </div>
            <button type="button" class="btn btn-sm hp-btn-dark d-none d-lg-inline-block" @click="import_config">Import</button>
            <button type="button" class="btn btn-sm hp-btn-dark d-none d-lg-inline-block" @click="export_config">Export</button>
        </div>
    </header>

    <div class="hp-body">

        <!-- ================= Parameter group rail ================= -->
        <!-- Narrow: sits beside the parameter fields; the panel header
             toggle adds hp-rail-closed to give the fields full width -->
        <nav class="hp-rail" :class="{'hp-rail-closed': !ui.rail_open}">
            <button type="button" class="hp-rail-btn hp-rail-btn-essentials"
                :class="{active: ui.group == 'essentials'}" @click="select_group('essentials')">
                <span class="hp-dot"></span>Essentials
            </button>
            <div class="d-none d-lg-block">
                <div class="hp-rail-divider"></div>
                <div class="hp-rail-heading">ALL PARAMETERS</div>
            </div>
            <button type="button" v-for="g in group_list" :key="g.id" class="hp-rail-btn"
                :class="{active: ui.group == g.id}" @click="select_group(g.id)">{{ g.label }}</button>
            <div class="hp-rail-footer d-none d-lg-block">
                Sim {{ results.sim_time_ms | toFixed(0) }} ms &middot; run {{ simulation_index }}<br>
                Frost model {{ frost.enabled ? 'on' : 'off' }}<br>
                <a href="https://github.com/openenergymonitor/tools/tree/main/www/tools/dynamic_heatpump" target="_blank" rel="noopener">Open source: help improve</a>
            </div>
        </nav>

        <!-- ================= Parameter panel ================= -->
        <section class="hp-panel">
            <div class="hp-panel-header">
                <div class="d-flex align-items-center gap-2">
                    <button type="button" class="hp-rail-toggle d-lg-none"
                        :aria-expanded="ui.rail_open ? 'true' : 'false'"
                        :aria-label="ui.rail_open ? 'Hide group list' : 'Show group list'"
                        @click="ui.rail_open = !ui.rail_open">{{ ui.rail_open ? '&lsaquo;' : '&rsaquo;' }}</button>
                    <h2 class="hp-panel-title">{{ group_info[ui.group].title }}</h2>
                    <span v-if="ui.group == 'essentials'" class="hp-badge-essentials">most-changed</span>
                </div>
                <p class="hp-panel-desc">{{ group_info[ui.group].desc }}</p>
            </div>

            <div class="hp-panel-fields">

                <!-- Essentials -->
                <div v-show="ui.group == 'essentials'" class="hp-field-grid">
                    <param-field label="Heat loss" unit="W" :step="100" :min="0"
                        v-model="building.heat_loss" @change="simulate"></param-field>
                    <param-field label="Heat pump capacity" unit="W" :step="500" :min="0"
                        :disabled="heatpump.cop_model == 'vaillant5' || heatpump.cop_model == 'vaillant12'"
                        v-model="heatpump.capacity" @change="simulate"></param-field>
                    <param-field label="Design flow temperature" unit="&deg;C" :step="1" :min="21" :max="75"
                        v-model="heatpump.design_flowT" @change="simulate"></param-field>
                    <div class="hp-field">
                        <label class="hp-field-label">Heat emitter output at DT{{ heatpump.radiatorRatedDT }}</label>
                        <div class="input-group input-group-sm">
                            <input type="text" class="form-control" :value="emitter_rated_output | toFixed(0)" disabled>
                            <span class="input-group-text">W</span>
                        </div>
                    </div>
                    <param-field label="Flow rate" unit="L/min" :step="1" :min="1" :max="40"
                        v-model="heatpump.flow_rate" @change="simulate"></param-field>
                    <param-field label="Cylinder volume" unit="L" :step="10" :min="0"
                        v-model="dhw.cylinder_volume" @change="simulate"></param-field>
                    <param-field label="Hot water use per day" unit="L" :step="10" :min="0"
                        v-model="dhw.daily_volume" @change="simulate"></param-field>
                    <div class="hp-field">
                        <label class="hp-field-label">COP model</label>
                        <select class="form-select form-select-sm" v-model="heatpump.cop_model" @change="simulate">
                            <option value="carnot_fixed">Carnot (fixed offsets)</option>
                            <option value="carnot_variable">Carnot (variable offsets)</option>
                            <option value="ecodan">Ecodan datasheet</option>
                            <option value="vaillant5">Vaillant datasheet 5kW</option>
                            <option value="vaillant12">Vaillant datasheet 12kW</option>
                        </select>
                    </div>
                    <div class="hp-field">
                        <label class="hp-field-label">Control mode</label>
                        <select class="form-select form-select-sm" v-model="control.mode" @change="simulate">
                            <option :value="0">Single PI</option>
                            <option :value="2">Cascade PI</option>
                            <option :value="1">Weather compensation</option>
                            <option :value="3">Fixed speed compressor</option>
                        </select>
                    </div>
                </div>

                <!-- Room thermostat schedule -->
                <div v-show="ui.group == 'schedule'">
                    <div class="table-responsive">
                        <table class="table table-sm hp-table-panel">
                            <tr>
                                <th>Time</th>
                                <th>Set point</th>
                                <th>Price</th>
                                <th class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" @click="add_space"><i class="fas fa-plus"></i></button></th>
                            </tr>
                            <tr v-for="(item, index) in schedule">
                                <td><input type="text" class="form-control form-control-sm" style="width:70px"
                                    v-model="item.start" @change="simulate"></td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="item.set_point" @change="simulate">
                                        <span class="input-group-text">&deg;C</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="item.price" @change="simulate">
                                        <span class="input-group-text">p</span>
                                    </div>
                                </td>
                                <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" @click="delete_space(index)"><i class="fas fa-trash"></i></button></td>
                            </tr>
                        </table>
                    </div>

                    <div class="hp-stats">
                        <div class="hp-stat">
                            <span>Degree hours above set point (heat pump running)</span>
                            <span class="hp-stat-value">{{ stats.degree_hours_above_setpoint.toFixed(1) }} Kh</span>
                        </div>
                        <div class="hp-stat">
                            <span>Degree hours below set point</span>
                            <span class="hp-stat-value">{{ stats.degree_hours_below_setpoint.toFixed(1) }} Kh</span>
                        </div>
                        <div class="hp-stat">
                            <span>Max room temperature</span>
                            <span class="hp-stat-value">{{ max_room_temp | toFixed(2) }} &deg;C</span>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2 mt-3">
                        <button type="button" class="btn btn-sm btn-outline-secondary" @click="load_octopus_cosy">Load Octopus Cosy example</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" @click="set_schedule_max">Set all to {{ Math.max(...schedule.map(s => s.set_point)) }} &deg;C</button>
                    </div>
                </div>

                <!-- DHW schedule -->
                <div v-show="ui.group == 'dhw_schedule'">
                    <div class="table-responsive">
                        <table class="table table-sm hp-table-panel">
                            <tr>
                                <th>Time</th>
                                <th>Set point</th>
                                <th>Duration</th>
                                <th>Mod. limit</th>
                            </tr>
                            <tr v-for="(item, index) in dhw_schedule">
                                <td><input type="text" class="form-control form-control-sm" style="width:70px"
                                    v-model="item.start" @change="simulate"></td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="item.set_point" @change="simulate">
                                        <span class="input-group-text">&deg;C</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="item.duration" @change="simulate">
                                        <span class="input-group-text">s</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="item.modulation" @change="simulate">
                                        <span class="input-group-text">%</span>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </div>
                    <p class="hp-note">Set duration to 0 to disable a window. Modulation limits below the
                        heat pump minimum modulation ({{ heatpump.minimum_modulation }}%) are raised to it.</p>
                </div>

                <!-- Hot water cylinder -->
                <div v-show="ui.group == 'cylinder'">
                    <div class="hp-field-grid">
                        <param-field label="Cylinder volume" unit="L" :step="10" :min="0"
                            v-model="dhw.cylinder_volume" @change="simulate"></param-field>
                        <param-field label="Cylinder height" unit="m" :step="0.1" :min="0.5"
                            v-model="dhw.cylinder_height" @change="simulate"></param-field>
                        <param-field label="Hot water use per day (mixed)" unit="L" :step="10" :min="0"
                            v-model="dhw.daily_volume" @change="simulate"></param-field>
                        <param-field label="Mixed delivery temperature" unit="&deg;C" :step="1"
                            v-model="dhw.mixed_draw_temp" @change="simulate"></param-field>
                        <param-field label="Coil UA" unit="W/K" :step="100" :min="0"
                            v-model="dhw.coil_UA" @change="simulate"></param-field>
                        <param-field label="Coil volume (bottom of tank)" unit="L" :step="5" :min="0"
                            v-model="dhw.coil_volume" @change="simulate"></param-field>
                        <param-field label="Cold feed temperature" unit="&deg;C" :step="1"
                            v-model="dhw.cold_feed_temp" @change="simulate"></param-field>
                        <param-field label="Reheat hysteresis" unit="K" :step="1" :min="0"
                            v-model="dhw.reheat_hysteresis" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Stratification nodes</label>
                            <select class="form-select form-select-sm" v-model.number="dhw.node_count" @change="simulate">
                                <option :value="4">4</option>
                                <option :value="8">8</option>
                                <option :value="12">12</option>
                                <option :value="20">20</option>
                                <option :value="40">40</option>
                            </select>
                        </div>
                        <param-field label="Thermostat height (0 bottom - 1 top)" :step="0.05" :min="0" :max="1"
                            v-model="dhw.stat_height" @change="simulate"></param-field>
                        <param-field label="Insulation U value" unit="W/m&sup2;K" :step="0.1" :min="0"
                            v-model="dhw.wall_U" @change="simulate"></param-field>
                        <param-field label="Effective vertical conductivity" unit="W/mK" :step="0.1" :min="0"
                            v-model="dhw.k_eff" @change="simulate"></param-field>
                        <param-field label="Max primary flow temperature" unit="&deg;C" :step="1"
                            v-model="dhw.flow_max" @change="simulate"></param-field>
                    </div>

                    <p class="hp-note">Draw profile: showers 07:00 ({{ (dhw.daily_volume*0.4).toFixed(0) }} L),
                        bath 19:00 ({{ (dhw.daily_volume*0.3).toFixed(0) }} L),
                        3&times; washing up ({{ (dhw.daily_volume*0.1).toFixed(0) }} L each), mixed volumes.</p>

                    <div class="hp-stats">
                        <div class="hp-stat">
                            <span>Hot water heat / electric / COP</span>
                            <span class="hp-stat-value">{{ results.dhw_heat_kwh | toFixed(2) }} / {{ results.dhw_elec_kwh | toFixed(2) }} kWh &middot; {{ results.dhw_elec_kwh > 0 ? (results.dhw_heat_kwh / results.dhw_elec_kwh).toFixed(2) : '-' }}</span>
                        </div>
                        <div class="hp-stat">
                            <span>Hot water delivered</span>
                            <span class="hp-stat-value">{{ results.dhw_delivered_kwh | toFixed(2) }} kWh</span>
                        </div>
                        <div class="hp-stat">
                            <span>Cylinder standing loss</span>
                            <span class="hp-stat-value">{{ results.cylinder_loss_kwh | toFixed(2) }} kWh</span>
                        </div>
                        <div class="hp-stat">
                            <span>Minimum cylinder top temperature</span>
                            <span class="hp-stat-value">{{ results.min_cylinder_top_temp | toFixed(1) }} &deg;C</span>
                        </div>
                    </div>
                </div>

                <!-- Heat pump & control -->
                <div v-show="ui.group == 'heatpump'">
                    <div class="hp-field-grid">
                        <param-field label="Heat pump capacity" unit="W" :step="500" :min="0"
                            :disabled="heatpump.cop_model == 'vaillant5' || heatpump.cop_model == 'vaillant12'"
                            v-model="heatpump.capacity" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">COP model</label>
                            <select class="form-select form-select-sm" v-model="heatpump.cop_model" @change="simulate">
                                <option value="carnot_fixed">Carnot (fixed offsets flow+2, outside-6)</option>
                                <option value="carnot_variable">Carnot (variable offsets &prop; heat)</option>
                                <option value="ecodan">Ecodan datasheet</option>
                                <option value="vaillant5">Vaillant datasheet 5kW</option>
                                <option value="vaillant12">Vaillant datasheet 12kW</option>
                            </select>
                        </div>
                        <param-field v-if="heatpump.cop_model != 'ecodan' && heatpump.cop_model != 'vaillant5' && heatpump.cop_model != 'vaillant12'"
                            label="Practical COP factor" unit="%" :step="1" :min="0" :max="100"
                            v-model="heatpump.prc_carnot" @change="simulate"></param-field>
                        <param-field label="Minimum modulation" unit="%" :step="5" :min="0" :max="100"
                            v-model="heatpump.minimum_modulation" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Minimum output</label>
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control" :value="heatpump.minimum_modulation * heatpump.capacity / 100 | toFixed(0)" disabled>
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                        <param-field label="Ramp rate (modulating modes)" unit="%/step" :step="0.5" :min="0"
                            v-model="heatpump.ramp_rate" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Ramp rate</label>
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control" :value="heatpump.ramp_rate * heatpump.capacity / 100 | toFixed(0)" disabled>
                                <span class="input-group-text">W/step</span>
                            </div>
                        </div>
                        <param-field label="System volume (after point 2)" unit="L" :step="10" :min="0"
                            v-model="heatpump.system_water_volume" @change="simulate"></param-field>
                        <param-field label="Standby / controls" unit="W" :step="1" :min="0"
                            v-model="heatpump.standby" @change="simulate"></param-field>
                        <param-field label="Pump power" unit="W" :step="1" :min="0"
                            v-model="heatpump.pumps" @change="simulate"></param-field>
                    </div>

                    <div class="hp-subheading">Heat emitters</div>
                    <div class="hp-field-grid">
                        <param-field label="Design flow temperature" unit="&deg;C" :step="1" :min="21" :max="75"
                            v-model="heatpump.design_flowT" @change="simulate"></param-field>
                        <param-field label="Design room temperature" unit="&deg;C" :step="0.5"
                            v-model="heatpump.design_roomT" @change="simulate"></param-field>
                        <param-field label="Emitter rated DT" unit="&deg;K" :step="5" :min="5"
                            v-model="heatpump.radiatorRatedDT" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Design system DT</label>
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control" :value="design_system_dT | toFixed(1)" disabled>
                                <span class="input-group-text">&deg;K</span>
                            </div>
                        </div>
                        <div class="hp-field">
                            <label class="hp-field-label">Heat emitter output at DT{{ heatpump.radiatorRatedDT }}</label>
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control" :value="emitter_rated_output | toFixed(0)" disabled>
                                <span class="input-group-text">W</span>
                            </div>
                        </div>
                    </div>
                    <p class="hp-note">The emitter spec is sized from the design flow temperature with the
                        radiator equation: emitters big enough to emit the design heat loss
                        ({{ building.heat_loss }} W) into a room at the design room temperature, when supplied
                        at the design flow temperature. The design system DT is the drop across the emitters
                        when the flow rate carries the whole design heat loss.</p>

                    <div class="hp-subheading">Control</div>
                    <div class="hp-field-grid">
                        <div class="hp-field hp-field-wide">
                            <label class="hp-field-label">Control mode</label>
                            <select class="form-select form-select-sm" v-model="control.mode" @change="simulate">
                                <option :value="0">Single PI (room temp &rarr; heat demand)</option>
                                <option :value="2">Cascade PI (room temp &rarr; flow temp &rarr; heat demand)</option>
                                <option :value="1">Weather compensation with parallel shift</option>
                                <option :value="3">Fixed speed compressor (on/off thermostat)</option>
                            </select>
                        </div>

                        <!-- Single PI -->
                        <template v-if="control.mode == 0">
                            <param-field label="Proportional (Kp)" :step="100"
                                v-model="control.Kp" @change="simulate"></param-field>
                            <param-field label="Integral (Ki)" :step="0.01"
                                v-model="control.Ki" @change="simulate"></param-field>
                        </template>

                        <!-- Cascade PI -->
                        <template v-if="control.mode == 2">
                            <param-field label="Outer Kp (room &rarr; flow target)" :step="0.5"
                                v-model="control.cascade_outer_Kp" @change="simulate"></param-field>
                            <param-field label="Outer Ki" :step="0.001"
                                v-model="control.cascade_outer_Ki" @change="simulate"></param-field>
                            <param-field label="Max flow temperature" unit="&deg;C" :step="1"
                                v-model="control.cascade_outer_max_flowT" @change="simulate"></param-field>
                            <param-field label="Inner Kp (flow &rarr; heat demand)" :step="50"
                                v-model="control.cascade_inner_Kp" @change="simulate"></param-field>
                            <param-field label="Inner Ki" :step="0.01"
                                v-model="control.cascade_inner_Ki" @change="simulate"></param-field>
                        </template>

                        <!-- Weather compensation -->
                        <template v-if="control.mode == 1">
                            <param-field label="Weather compensation curve" :step="0.02"
                                v-model="control.curve" @change="simulate"></param-field>
                            <div class="hp-field" v-if="days == 1">
                                <label class="hp-field-label">Outside temperature response</label>
                                <select class="form-select form-select-sm" v-model.number="control.wc_use_outside_mean" @change="simulate">
                                    <option :value="0">Instantaneous</option>
                                    <option :value="1">Average temperature for the day</option>
                                </select>
                            </div>
                            <param-field label="Inner Kp (flow &rarr; heat demand)" :step="50"
                                v-model="control.cascade_inner_Kp" @change="simulate"></param-field>
                            <param-field label="Inner Ki" :step="0.01"
                                v-model="control.cascade_inner_Ki" @change="simulate"></param-field>
                        </template>

                        <!-- Fixed speed -->
                        <template v-if="control.mode == 3">
                            <param-field label="Compressor speed" unit="%" :step="5" :min="0" :max="100"
                                v-model="control.fixed_compressor_speed" @change="simulate"></param-field>
                        </template>

                        <!-- Room limit (weather comp & fixed speed) -->
                        <template v-if="control.mode == 1 || control.mode == 3">
                            <div class="hp-field">
                                <label class="hp-field-label">Limit by room set point</label>
                                <div class="form-check form-switch hp-switch pt-1">
                                    <input class="form-check-input" type="checkbox" id="limit_by_roomT"
                                        v-model="control.limit_by_roomT" @change="simulate">
                                    <label class="form-check-label" for="limit_by_roomT">Enabled</label>
                                </div>
                            </div>
                            <param-field label="Room temperature hysteresis" unit="&deg;C" :step="0.1" :min="0"
                                v-model="control.roomT_hysteresis" @change="simulate"></param-field>
                        </template>
                    </div>
                    <p class="hp-note" v-if="control.mode == 1">Curve automatically selected based on building
                        heat loss, internal gains and heat emitter spec.</p>
                </div>

                <!-- Primary pipework -->
                <div v-show="ui.group == 'pipework'">
                    <div class="hp-field-grid">
                        <div class="hp-field">
                            <label class="hp-field-label">Pipework model</label>
                            <select class="form-select form-select-sm" v-model="primary.mode" @change="simulate">
                                <option value="simple">Simple: uniform pipe in outside air</option>
                                <option value="segmented">Segmented: per-stage material &amp; environment</option>
                            </select>
                        </div>
                        <param-field label="Flow rate" unit="L/min" :step="1" :min="1" :max="40"
                            v-model="heatpump.flow_rate" @change="simulate"></param-field>
                    </div>

                    <div v-if="primary.mode != 'segmented'" class="hp-field-grid mt-2">
                        <param-field label="Length (one way)" unit="m" :step="1" :min="0"
                            v-model="primary.length" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Pipe size</label>
                            <select class="form-select form-select-sm" v-model="primary.pipe" @change="simulate">
                                <option value="22">22 mm copper</option>
                                <option value="28">28 mm copper</option>
                                <option value="35">35 mm copper</option>
                            </select>
                        </div>
                        <div class="hp-field hp-field-wide">
                            <label class="hp-field-label">Insulation</label>
                            <select class="form-select form-select-sm" v-model="primary.insulation" @change="simulate">
                                <option v-for="o in insul_options" :value="o.value">{{ o.label }}</option>
                            </select>
                        </div>
                    </div>
                    <p class="hp-note" v-if="primary.mode != 'segmented'">Simple mode pipework is exposed to
                        the live outside air temperature.</p>

                    <div v-if="primary.mode == 'segmented'" class="mt-2">
                        <div class="table-responsive">
                            <table class="table table-sm hp-table-panel">
                                <tr>
                                    <th>Stage</th>
                                    <th>Length m</th>
                                    <th>Construction</th>
                                    <th>Ambient &deg;C</th>
                                    <th class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" @click="add_segment"><i class="fas fa-plus"></i></button></th>
                                </tr>
                                <tr v-for="(sg, index) in primary.segments">
                                    <td><input type="text" class="form-control form-control-sm" style="min-width:80px" v-model="sg.name" @change="simulate"></td>
                                    <td><input type="text" class="form-control form-control-sm" style="width:60px" v-model.number="sg.len" @change="simulate"></td>
                                    <td>
                                        <select class="form-select form-select-sm" style="min-width:140px" v-model="sg.type" @change="simulate">
                                            <option v-for="(t, k) in pw_segtypes" :value="k">{{ t.label }} &middot; {{ t.u.toFixed(3) }} W/K per m</option>
                                        </select>
                                    </td>
                                    <td><input type="text" class="form-control form-control-sm" style="width:60px" v-model.number="sg.amb" @change="simulate"></td>
                                    <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" @click="delete_segment(index)"><i class="fas fa-trash"></i></button></td>
                                </tr>
                            </table>
                        </div>
                        <p class="hp-note">Stage order = heat pump &rarr; building. Stage ambients are fixed
                            (e.g. ground temperature around buried MDPE); the heat pump itself sits in the
                            first stage's environment.</p>
                        <button type="button" class="btn btn-sm btn-outline-secondary" @click="load_buried_example">Load example: buried MDPE run</button>
                    </div>

                    <div class="hp-field-grid mt-3">
                        <param-field label="Water volume inside the heat pump" unit="L" :step="0.5" :min="0"
                            v-model="primary.unit_volume" @change="simulate"></param-field>
                        <param-field label="Pump overrun after stop" unit="min" :step="1" :min="0"
                            v-model="primary.pump_overrun" @change="simulate"></param-field>
                    </div>

                    <div class="hp-stats">
                        <div class="hp-stat">
                            <span>Primary pipework + unit volume standing loss</span>
                            <span class="hp-stat-value">{{ results.primary_loss_kwh | toFixed(2) }} kWh</span>
                        </div>
                    </div>
                </div>

                <!-- Building fabric -->
                <div v-show="ui.group == 'fabric'">
                    <div class="hp-field-grid">
                        <param-field label="Heat loss" unit="W" :step="100" :min="0"
                            v-model="building.heat_loss" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Heat loss coefficient</label>
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control" :value="building.fabric_WK | toFixed(0)" disabled>
                                <span class="input-group-text">W/K</span>
                            </div>
                        </div>
                    </div>

                    <p class="hp-note"><b>Layer 1:</b> external, <b>Layer 3:</b> internal.</p>

                    <div class="table-responsive">
                        <table class="table table-sm hp-table-panel">
                            <tr>
                                <th>Layer</th>
                                <th>Proportion</th>
                                <th>W/K</th>
                                <th>kWh/K</th>
                            </tr>
                            <tr v-for="(layer, index) in building.fabric">
                                <td>{{ index + 1 }}</td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="layer.proportion" @change="simulate" :disabled="index == 0">
                                        <span class="input-group-text">%</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" :value="layer.WK | toFixed(0)" disabled>
                                        <span class="input-group-text">W/K</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input type="text" class="form-control" v-model.number="layer.kWhK" @change="simulate">
                                        <span class="input-group-text">kWh/K</span>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>

                <!-- Evaporator frosting & defrost -->
                <div v-show="ui.group == 'frost'">
                    <div class="d-flex flex-column gap-1 mb-3">
                        <div class="form-check form-switch hp-switch">
                            <input class="form-check-input" type="checkbox" id="frost_enabled"
                                v-model="frost.enabled" @change="simulate">
                            <label class="form-check-label" for="frost_enabled">Enable frosting &amp; defrost model</label>
                        </div>
                        <div class="form-check form-switch hp-switch">
                            <input class="form-check-input" type="checkbox" id="frost_csv_humidity"
                                v-model="frost.use_csv_humidity" @change="simulate">
                            <label class="form-check-label" for="frost_csv_humidity">Use measured humidity from dataset (annual mode)</label>
                        </div>
                    </div>

                    <div class="hp-field-grid">
                        <param-field label="Relative humidity (day mode / no data)" unit="%RH" :step="5" :min="0" :max="100"
                            v-model="frost.humidity" @change="simulate"></param-field>
                        <param-field label="Evaporator airflow" unit="m&sup3;/h" :step="100" :min="0"
                            v-model="frost.airflow" @change="simulate"></param-field>
                        <param-field label="Capture efficiency (calibration)" :step="0.05" :min="0" :max="1"
                            v-model="frost.capture_eff" @change="simulate"></param-field>
                        <param-field label="Coil below outside air" unit="K" :step="0.5" :min="0"
                            v-model="frost.coil_dt" @change="simulate"></param-field>
                        <param-field label="Defrost trigger threshold" unit="kg" :step="0.5" :min="0"
                            v-model="frost.threshold" @change="simulate"></param-field>
                        <param-field label="Max derating at trigger" unit="%" :step="5" :min="0" :max="100"
                            v-model="frost.derate_max" @change="simulate"></param-field>
                        <param-field label="Defrost heat draw" unit="W" :step="500" :min="0"
                            v-model="frost.defrost_power" @change="simulate"></param-field>
                        <param-field label="Defrost electric draw" unit="W" :step="100" :min="0"
                            v-model="frost.defrost_elec" @change="simulate"></param-field>
                        <param-field label="Melt efficiency" :step="0.05" :min="0" :max="1"
                            v-model="frost.melt_eff" @change="simulate"></param-field>
                        <param-field label="Per-cycle overhead" unit="kJ" :step="50" :min="0"
                            v-model="frost.overhead_kj" @change="simulate"></param-field>
                    </div>

                    <div class="hp-stats">
                        <div class="hp-stat">
                            <span>Defrost cycles</span>
                            <span class="hp-stat-value">{{ results.defrost_cycles }}</span>
                        </div>
                        <div class="hp-stat">
                            <span>Heat drawn / electric</span>
                            <span class="hp-stat-value">{{ results.defrost_heat_kwh | toFixed(2) }} / {{ results.defrost_elec_kwh | toFixed(2) }} kWh</span>
                        </div>
                        <div class="hp-stat">
                            <span>Defrost loss</span>
                            <span class="hp-stat-value">{{ results.heat_kwh > 0 ? (100 * results.defrost_heat_kwh / results.heat_kwh).toFixed(2) : '0.00' }} % of heat delivered</span>
                        </div>
                    </div>
                </div>

                <!-- Internal gains, solar & PV -->
                <div v-show="ui.group == 'gains'">
                    <div class="hp-field-grid">
                        <param-field label="Body heat (~60 W/person occupied)" unit="W" :step="10" :min="0"
                            v-model="building.metabolic_gains" @change="simulate"></param-field>
                        <param-field label="Lights, appliances &amp; cooking" unit="W" :step="10" :min="0"
                            v-model="building.lac_gains" @change="simulate"></param-field>
                        <template v-if="mode == 'year'">
                            <param-field label="Solar gains scale (PV dataset)" unit="kW" :step="0.5" :min="0"
                                v-model="building.solar_gains_scale" @change="simulate"></param-field>
                            <param-field label="Solar PV electrical output" unit="kW" :step="0.5" :min="0"
                                v-model="building.pv_scale" @change="simulate"></param-field>
                            <param-field label="Battery storage capacity" unit="kWh" :step="1" :min="0"
                                v-model="battery.capacity_kwh" @change="simulate"></param-field>
                            <div class="hp-field">
                                <label class="hp-field-label">Include lighting &amp; appliances in cost</label>
                                <div class="form-check form-switch hp-switch pt-1">
                                    <input class="form-check-input" type="checkbox" id="include_lac"
                                        v-model="building.include_lac_gains_in_elec_demand" @change="simulate">
                                    <label class="form-check-label" for="include_lac">Enabled</label>
                                </div>
                            </div>
                        </template>
                    </div>

                    <div class="hp-stats" v-if="mode == 'year'">
                        <div class="hp-stat">
                            <span>Solar gains utilisation (useful / total)</span>
                            <span class="hp-stat-value">{{ results.utilised_solar_gains_kwh.toFixed(0) }} / {{ results.solar_gains_kwh.toFixed(0) }} kWh</span>
                        </div>
                    </div>
                    <p class="hp-note" v-if="mode == 'day'">Solar gains, PV output and battery storage use the
                        annual dataset, switch to full year mode to explore them.</p>
                </div>

                <!-- Outside temperature -->
                <div v-show="ui.group == 'outside'">
                    <div v-if="mode == 'day'" class="hp-field-grid">
                        <param-field label="Outside temperature" unit="&deg;C" :step="1"
                            v-model="external.mid" @change="simulate"></param-field>
                        <param-field label="Outside temperature swing" unit="&deg;C" :step="0.5" :min="0"
                            v-model="external.swing" @change="simulate"></param-field>
                        <div class="hp-field">
                            <label class="hp-field-label">Time of minimum</label>
                            <input type="text" class="form-control form-control-sm" v-model="external.min_time" @change="simulate">
                        </div>
                        <div class="hp-field">
                            <label class="hp-field-label">Time of maximum</label>
                            <input type="text" class="form-control form-control-sm" v-model="external.max_time" @change="simulate">
                        </div>
                    </div>

                    <div v-if="mode == 'year'">
                        <p class="hp-note mt-0">Annual mode replays the Llanberis 2024 dataset (temperature,
                            humidity, solar and Agile prices). Use the design temperatures below when choosing
                            a design flow temperature for heat emitters.</p>
                        <div class="hp-stats">
                            <div class="hp-stat">
                                <span>99.6th percentile outside temperature</span>
                                <span class="hp-stat-value">{{ outsideT_996.toFixed(1) }} &deg;C</span>
                            </div>
                            <div class="hp-stat">
                                <span>99.0th percentile outside temperature</span>
                                <span class="hp-stat-value">{{ outsideT_990.toFixed(1) }} &deg;C</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Run bar -->
            <div class="hp-runbar">
                <div v-if="progress.running" class="hp-run-progress">
                    <div class="progress" style="height:26px">
                        <div class="progress-bar progress-bar-striped progress-bar-animated"
                            :style="{ width: (100 * progress.day / progress.total) + '%' }">
                            day {{ progress.day }} of {{ progress.total }}
                        </div>
                    </div>
                </div>
                <template v-else>
                    <select class="form-select form-select-sm hp-mode-select" v-model="mode" @change="change_mode" :disabled="progress.running">
                        <option value="day">Single day</option>
                        <option value="year">Full year</option>
                    </select>
                    <span v-if="needs_run" class="hp-badge-unrun">{{ pending_changes }} unrun change{{ pending_changes == 1 ? '' : 's' }}</span>
                    <span v-else class="hp-run-hint">{{ mode == 'day' ? 'runs automatically on change' : 'results up to date' }}</span>
                    <button type="button" class="btn btn-sm btn-outline-secondary ms-auto"
                        :disabled="!needs_run || !last_run_config" @click="revert">Revert</button>
                    <button type="button" class="btn btn-sm px-3"
                        :class="needs_run ? 'btn-warning' : 'btn-primary'" @click="run_model">Run model</button>
                </template>
            </div>
        </section>

        <!-- ================= Headline results strip (narrow only) ================= -->
        <!-- Sticks to the bottom edge with the run bar just above it, so the
             edit -> run -> read loop stays on screen while scrolled up in the
             config; settles here, above the results, once scrolled past -->
        <div class="hp-kpi-strip d-lg-none">
            <div class="hp-kpi-strip-cell" v-for="k in kpis.slice(0, 4)">
                <span class="hp-kpi-strip-label">{{ k.short }}</span>
                <span class="hp-kpi-strip-value">{{ k.value }}</span>
                <span v-if="k.delta" class="hp-kpi-delta" :class="k.cls">{{ k.delta }}</span>
            </div>
        </div>

        <!-- ================= Results column ================= -->
        <section class="hp-results">
            <div class="hp-results-toolbar">
                <div class="hp-tabs">
                    <button type="button" class="hp-tab" :class="{active: ui.view == 'chart'}" @click="select_view('chart')">Chart</button>
                    <button type="button" class="hp-tab" :class="{active: ui.view == 'tables'}" @click="select_view('tables')">Tables</button>
                </div>
                <span class="hp-run-indicator ms-auto">
                    <span class="hp-run-dot" :class="{stale: needs_run}"></span>
                    {{ needs_run ? 'inputs changed — run to update' : 'results from run ' + simulation_index }}
                </span>
            </div>

            <div class="hp-results-scroll">

                <!-- KPI cards -->
                <div class="hp-kpi-grid">
                    <div class="hp-kpi" v-for="k in kpis">
                        <div class="hp-kpi-label">{{ k.label }}</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <span class="hp-kpi-value">{{ k.value }}</span>
                            <span v-if="k.delta" class="hp-kpi-delta" :class="k.cls">{{ k.delta }}</span>
                        </div>
                    </div>
                </div>

                <!-- Chart view -->
                <div v-show="ui.view == 'chart'">
                    <div class="hp-card">
                        <div class="hp-card-header">
                            <div class="d-flex align-items-baseline flex-wrap gap-2">
                                <span>{{ ui.chart == 'daily' ? 'Daily energy' : 'Timeseries' }}</span>
                                <span v-if="ui.chart != 'daily'" class="hp-note m-0 fw-normal">Window: {{ stats.window_heat_kwh | toFixed(1) }} kWh heat &middot;
                                    {{ stats.window_elec_kwh | toFixed(1) }} kWh elec &middot;
                                    COP {{ stats.window_cop > 0 ? stats.window_cop.toFixed(2) : '—' }}</span>
                                <span v-else class="hp-note m-0 fw-normal">{{ daily_stats.days }} days &middot;
                                    {{ daily_stats.heat_kwh | toFixed(0) }} kWh heat &middot;
                                    {{ daily_stats.elec_kwh | toFixed(0) }} kWh elec &middot;
                                    COP {{ daily_stats.cop > 0 ? daily_stats.cop.toFixed(2) : '—' }}</span>
                            </div>
                            <!-- Chart nav: pan / zoom / reset as one segmented
                                 control; each control greys out at its limit -->
                            <div class="d-flex align-items-center gap-2 ms-auto">
                                <!-- Resolution: 30 s power view or daily bars.
                                     Only offered on multi-day runs -->
                                <div v-if="days > 1" class="hp-chart-nav" role="group" aria-label="Chart resolution">
                                    <button type="button" class="hp-nav-btn hp-nav-btn-text"
                                        :class="{active: ui.chart == 'power'}" @click="select_chart('power')"
                                        title="Power timeseries">Power</button>
                                    <button type="button" class="hp-nav-btn hp-nav-btn-text"
                                        :class="{active: ui.chart == 'daily'}" @click="select_chart('daily')"
                                        title="Daily energy bars">Daily</button>
                                </div>
                                <!-- Daily bars: all / space heating / hot water -->
                                <div v-if="ui.chart == 'daily'" class="hp-chart-nav" role="group" aria-label="Daily energy split">
                                    <button type="button" class="hp-nav-btn hp-nav-btn-text"
                                        v-for="m in bargraph_modes" :key="m.id"
                                        :class="{active: bargraph_mode == m.id}"
                                        @click="select_bargraph_mode(m.id)" :title="m.title">{{ m.label }}</button>
                                </div>
                                <span class="hp-nav-range">{{ view_range_label }}</span>
                                <div class="hp-chart-nav" role="group" aria-label="Chart navigation">
                                    <button type="button" class="hp-nav-btn" @click="pan_left"
                                        :disabled="!can_pan_left" title="Pan left" aria-label="Pan left">
                                        <i class="fa-solid fa-chevron-left"></i></button>
                                    <button type="button" class="hp-nav-btn" @click="pan_right"
                                        :disabled="!can_pan_right" title="Pan right" aria-label="Pan right">
                                        <i class="fa-solid fa-chevron-right"></i></button>
                                    <span class="hp-nav-sep"></span>
                                    <button type="button" class="hp-nav-btn" @click="zoom_out"
                                        :disabled="!can_zoom_out" title="Zoom out" aria-label="Zoom out">
                                        <i class="fa-solid fa-magnifying-glass-minus"></i></button>
                                    <button type="button" class="hp-nav-btn" @click="zoom_in"
                                        :disabled="!can_zoom_in" title="Zoom in" aria-label="Zoom in">
                                        <i class="fa-solid fa-magnifying-glass-plus"></i></button>
                                    <span class="hp-nav-sep"></span>
                                    <button type="button" class="hp-nav-btn hp-nav-btn-text" @click="reset"
                                        :disabled="!can_reset" title="Reset to the full simulation range">Reset</button>
                                </div>
                            </div>
                        </div>
                        <div id="graph_bound" class="hp-graph-bound">
                            <div id="graph"></div>
                            <div id="spinner-overlay">
                                <div class="spinner"></div>
                            </div>
                        </div>
                        <!-- Daily legend: same pills, plus the hint that bars
                             open the day in the power view -->
                        <div class="hp-legend mt-2" v-if="ui.chart == 'daily'">
                            <button type="button" v-for="(s, key) in daily_series" :key="key"
                                class="hp-legend-pill" :class="{off: !s.show}"
                                :aria-pressed="s.show ? 'true' : 'false'"
                                @click="toggle_daily_series(key)">
                                <span class="hp-legend-dot" :style="s.show ? {background: s.color} : {}"></span>{{ s.label }}
                            </button>
                            <span class="hp-note m-0 ms-auto">Click a bar to open that day &middot; drag to zoom</span>
                        </div>

                        <!-- Interactive legend: one pill per series, click to
                             show/hide. Dots share the plot colours; hidden
                             series render dimmed with a hollow dot. -->
                        <div class="hp-legend mt-2" v-else>
                            <template v-for="(s, key) in chart_series">
                                <button type="button" v-if="key != 'solar_pv' || mode == 'year'" :key="key"
                                    class="hp-legend-pill" :class="{off: !s.show}"
                                    :aria-pressed="s.show ? 'true' : 'false'"
                                    @click="toggle_series(key)">
                                    <span class="hp-legend-dot" :style="s.show ? {background: s.color} : {}"></span>{{ s.label }}
                                </button>
                            </template>
                            <div class="form-check form-check-inline hp-switch m-0 ms-auto">
                                <input class="form-check-input" type="checkbox" id="show_negative_heat" v-model="show_negative_heat" @change="replot">
                                <label class="form-check-label" for="show_negative_heat">Negative heat during defrosts</label>
                            </div>
                        </div>
                    </div>

                    <div class="hp-card">
                        <div class="hp-card-header">Performance by metering point</div>
                        <div class="table-responsive">
                            <table class="table">
                                <tr>
                                    <th>Metering point</th>
                                    <th>Heat</th>
                                    <th>SPF/COP</th>
                                    <th>vs source</th>
                                </tr>
                                <tr>
                                    <td>At source (condenser, pre unit volume)</td>
                                    <td>{{ results.heat_kwh | toFixed(3) }} kWh</td>
                                    <td>{{ (results.heat_kwh / results.elec_kwh) | toFixed(2) }}</td>
                                    <td>100 %</td>
                                </tr>
                                <tr>
                                    <td>Point 1 &middot; heat pump connections</td>
                                    <td>{{ results.heat_kwh_m1 | toFixed(3) }} kWh</td>
                                    <td>{{ (results.heat_kwh_m1 / results.elec_kwh) | toFixed(2) }}</td>
                                    <td>{{ (100 * results.heat_kwh_m1 / results.heat_kwh) | toFixed(1) }} %</td>
                                </tr>
                                <tr class="table-success">
                                    <td>Point 2 &middot; building entry, after primaries (main)</td>
                                    <td>{{ results.heat_kwh_m2 | toFixed(3) }} kWh</td>
                                    <td>{{ (results.heat_kwh_m2 / results.elec_kwh) | toFixed(2) }}</td>
                                    <td>{{ (100 * results.heat_kwh_m2 / results.heat_kwh) | toFixed(1) }} %</td>
                                </tr>
                            </table>
                        </div>
                        <p class="hp-note">Primary pipework + heat pump volume standing loss:
                            {{ results.primary_loss_kwh | toFixed(3) }} kWh.
                            The source &rarr; point 1 gap is the unit's own standing loss; the
                            point 1 &rarr; point 2 gap is heat lost from the primary pipework
                            (while flowing, plus stranded loop charge that cools between cycles).</p>
                    </div>
                </div>

                <!-- Tables view -->
                <div v-show="ui.view == 'tables'">
                    <div class="hp-card">
                        <div class="hp-card-header">
                            <span>Results{{ baseline_enabled ? ' vs baseline' : '' }}</span>
                            <button type="button" class="btn btn-sm btn-outline-secondary" @click="save_baseline">Save as baseline</button>
                        </div>
                        <div class="table-responsive">
                            <table class="table">
                                <tr>
                                    <th>Name</th>
                                    <th>Mean temp</th>
                                    <th>Max temp</th>
                                    <th>Electric</th>
                                    <th>Heat @ M2</th>
                                    <th>COP @ M2</th>
                                    <th>Cost</th>
                                    <th v-if="mode == 'year' && building.pv_scale > 0">Solar offset</th>
                                    <th v-if="mode == 'year' && building.pv_scale > 0">Solar saving</th>
                                    <th v-if="mode == 'year'">Agile (2024)</th>
                                </tr>
                                <tr v-if="baseline_enabled" style="background-color:#f0f0f0">
                                    <td>Baseline</td>
                                    <td>{{ baseline.mean_room_temp | toFixed(2) }} &deg;C</td>
                                    <td>{{ baseline.max_room_temp | toFixed(2) }} &deg;C</td>
                                    <td>{{ baseline.elec_kwh | toFixed(3) }} kWh</td>
                                    <td>{{ baseline.heat_kwh_m2 | toFixed(3) }} kWh</td>
                                    <td>{{ (baseline.heat_kwh_m2 / baseline.elec_kwh) | toFixed(2) }}</td>
                                    <td>&pound;{{ baseline.total_cost | toFixed(2) }}</td>
                                    <td v-if="mode == 'year' && building.pv_scale > 0">{{ baseline.solar_elec_kwh | toFixed(3) }} kWh</td>
                                    <td v-if="mode == 'year' && building.pv_scale > 0">&pound;{{ baseline.solar_cost | toFixed(2) }}</td>
                                    <td v-if="mode == 'year'">&pound;{{ baseline.agile_cost | toFixed(2) }}</td>
                                </tr>
                                <tr class="table-success">
                                    <td>Current</td>
                                    <td>{{ results.mean_room_temp | toFixed(2) }} &deg;C</td>
                                    <td>{{ results.max_room_temp | toFixed(2) }} &deg;C</td>
                                    <td>{{ results.elec_kwh | toFixed(3) }} kWh</td>
                                    <td>{{ results.heat_kwh_m2 | toFixed(3) }} kWh</td>
                                    <td>{{ (results.heat_kwh_m2 / results.elec_kwh) | toFixed(2) }}</td>
                                    <td>&pound;{{ results.total_cost | toFixed(2) }}</td>
                                    <td v-if="mode == 'year' && building.pv_scale > 0">{{ results.solar_elec_kwh | toFixed(3) }} kWh</td>
                                    <td v-if="mode == 'year' && building.pv_scale > 0">&pound;{{ results.solar_cost | toFixed(2) }}</td>
                                    <td v-if="mode == 'year'">&pound;{{ results.agile_cost | toFixed(2) }}</td>
                                </tr>
                                <tr v-if="baseline_enabled" class="table-info">
                                    <td>Saving</td>
                                    <td>{{ (results.mean_room_temp - baseline.mean_room_temp) | toFixed(2) }} &deg;C</td>
                                    <td>{{ (results.max_room_temp - baseline.max_room_temp) | toFixed(2) }} &deg;C</td>
                                    <td>{{ (results.elec_kwh - baseline.elec_kwh) * -1 | toFixed(3) }} kWh ({{ ((results.elec_kwh - baseline.elec_kwh) / baseline.elec_kwh * -100) | toFixed(1) }}%)</td>
                                    <td>{{ (results.heat_kwh_m2 - baseline.heat_kwh_m2) * -1 | toFixed(3) }} kWh ({{ ((results.heat_kwh_m2 - baseline.heat_kwh_m2) / baseline.heat_kwh_m2 * -100) | toFixed(1) }}%)</td>
                                    <td>{{ ((results.heat_kwh_m2 / results.elec_kwh) - (baseline.heat_kwh_m2 / baseline.elec_kwh)) | toFixed(2) }}</td>
                                    <td>&pound;{{ (results.total_cost - baseline.total_cost) * -1 | toFixed(2) }}</td>
                                    <td v-if="mode == 'year' && building.pv_scale > 0">{{ (results.solar_elec_kwh - baseline.solar_elec_kwh) | toFixed(3) }} kWh</td>
                                    <td v-if="mode == 'year' && building.pv_scale > 0">&pound;{{ (results.solar_cost - baseline.solar_cost) | toFixed(2) }}</td>
                                    <td v-if="mode == 'year'">&pound;{{ (results.agile_cost - baseline.agile_cost) * -1 | toFixed(2) }}</td>
                                </tr>
                            </table>
                        </div>
                        <p class="hp-note" v-if="!baseline_enabled">Use <b>Save as baseline</b> (above) to
                            keep the current results for comparison as you change parameters.</p>
                    </div>

                    <div class="hp-card">
                        <div class="hp-card-header">Weighted averages (heat weighted)</div>
                        <div class="table-responsive">
                            <table class="table">
                                <tr>
                                    <th></th>
                                    <th>Flow temperature</th>
                                    <th>Outside temperature</th>
                                    <th>FlowT &minus; outsideT</th>
                                    <th>% Carnot</th>
                                </tr>
                                <tr>
                                    <td>Full simulation</td>
                                    <td>{{ stats.flowT_weighted | toFixed(2) }} &deg;C</td>
                                    <td>{{ stats.outsideT_weighted | toFixed(2) }} &deg;C</td>
                                    <td>{{ stats.flowT_minus_outsideT_weighted | toFixed(2) }} &deg;C</td>
                                    <td>{{ stats.wa_prc_carnot * 100 | toFixed(1) }} %</td>
                                </tr>
                                <tr>
                                    <td>Selected window only</td>
                                    <td>{{ stats.window_flowT_weighted | toFixed(2) }} &deg;C</td>
                                    <td>{{ stats.window_outsideT_weighted | toFixed(2) }} &deg;C</td>
                                    <td>{{ stats.window_flowT_minus_outsideT_weighted | toFixed(2) }} &deg;C</td>
                                    <td></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </section>

    </div>
</div>

<script src="<?php echo $path; ?>model/pipework.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>model/cylinder.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>model/controller.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>model/building.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>model/frost.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>model/simulator.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>plot.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>bargraph.js?v=<?php echo time(); ?>"></script>
<script src="<?php echo $path; ?>dynamic_heatpump.js?v=<?php echo time(); ?>"></script>

<!-- Shared tool navigation sidebar, pulled in from the core -->
<?php echo view("components/tool_sidebar.php", array('menu' => $menu)); ?>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>

</body>

</html>
