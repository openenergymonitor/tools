
<script src="https://cdn.jsdelivr.net/npm/vue@2"></script>
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>

<script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.time.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flot/0.8.3/jquery.flot.selection.min.js"></script>

<script src="<?php echo $path_lib; ?>feed.js?v=1"></script>
<script src="<?php echo $path_lib; ?>vis.helper.js?v=1"></script>

<script src="tools/solarmatching/model.js?v=2"></script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">

<style>
  #app{
    --ink:#10151b;
    --panel:#171e26;
    --panel2:#1e2731;
    --raise:#26313d;
    --line:#2c3742;
    --line2:#384654;
    --text:#e7edf3;
    --muted:#8a97a5;
    --faint:#5f6c79;
    --grid:#4aa3df;
    --solar:#f5c542;
    --solardim:#caa72f;
    --battery:#54c08a;
    --hp:#39b5ac;
    --ev:#8a86f5;
    --good:#54c08a;
    --bad:#d8694d;
  }

  /* full-bleed dark stage inside the light bootstrap shell */
  #app.sm-stage{
    background:
      radial-gradient(1200px 600px at 85% -10%, #1a2530 0%, rgba(26,37,48,0) 60%),
      var(--ink);
    color:var(--text);
    font-family:"Inter",system-ui,sans-serif;
    font-size:14px;line-height:1.5;
    -webkit-font-smoothing:antialiased;
    padding:30px 22px 70px;
  }
  #app .wrap{max-width:1180px;margin:0 auto;}
  #app .num{font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;}
  #app h1,#app h2,#app h3{font-family:"Space Grotesk",sans-serif;margin:0;}

  /* ---- masthead ---- */
  #app .masthead{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:24px;}
  #app .eyebrow{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--solar);margin:0 0 6px;}
  #app .masthead h1{font-size:30px;font-weight:700;letter-spacing:-.01em;}
  #app .masthead p{margin:8px 0 0;color:var(--muted);max-width:62ch;font-size:13px;}

  /* ---- hero ledger ---- */
  #app .hero{background:linear-gradient(180deg,var(--panel) 0%,#141b22 100%);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin-bottom:24px;}
  #app .hero-top{display:flex;justify-content:space-between;align-items:baseline;gap:18px;flex-wrap:wrap;margin-bottom:16px;}
  #app .hero-headline{font-family:"Space Grotesk";font-size:15px;font-weight:500;color:var(--muted);}
  #app .badge-stat{font-family:"JetBrains Mono";font-size:13px;font-weight:700;padding:7px 13px;border-radius:999px;border:1px solid var(--line2);white-space:nowrap;color:var(--good);border-color:rgba(84,192,138,.4);background:rgba(84,192,138,.08);}

  #app .ledger-row{display:grid;grid-template-columns:150px 1fr 110px;align-items:center;gap:14px;margin:11px 0;}
  #app .ledger-label{font-size:12px;color:var(--muted);}
  #app .ledger-label b{display:block;color:var(--text);font-family:"Space Grotesk";font-size:13px;font-weight:600;}
  #app .bar{height:34px;border-radius:7px;background:#0d1217;display:flex;overflow:hidden;border:1px solid var(--line);}
  #app .seg{height:100%;transition:flex-grow .55s cubic-bezier(.22,.61,.36,1), background .3s;}
  #app .ledger-total{font-family:"JetBrains Mono";font-weight:700;font-size:16px;text-align:right;}
  #app .ledger-total span{display:block;font-size:10px;color:var(--faint);font-weight:400;letter-spacing:.05em;}
  #app .legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:16px;padding-top:14px;border-top:1px dashed var(--line);}
  #app .legend .lg{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);}
  #app .dot{width:10px;height:10px;border-radius:3px;flex:none;}

  /* ---- stat cards ---- */
  #app .stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;}
  @media(max-width:820px){#app .stat-row{grid-template-columns:1fr 1fr 1fr;}}
  @media(max-width:480px){#app .stat-row{grid-template-columns:1fr 1fr;}}
  #app .stat{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px;border-top:3px solid var(--line2);}
  #app .stat.a-solar{border-top-color:var(--solar);}
  #app .stat.a-grid{border-top-color:var(--grid);}
  #app .stat.a-cost{border-top-color:var(--battery);}
  #app .stat.a-agile{border-top-color:var(--ev);}
  #app .stat .k{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);}
  #app .stat .v{font-family:"JetBrains Mono";font-weight:700;font-size:22px;margin-top:6px;color:var(--text);}
  #app .stat .v small{font-size:12px;font-weight:400;color:var(--muted);}
  #app .stat .s{font-size:11px;color:var(--muted);margin-top:3px;}

  /* ---- cards ---- */
  #app .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:22px;}
  #app .card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;}
  #app .card-head h2{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text);display:flex;align-items:center;gap:8px;}
  #app .card-head .hint{font-size:11px;color:var(--faint);}
  #app .tag-ico{font-family:"JetBrains Mono";font-weight:700;font-size:10px;color:#0d1217;border-radius:5px;padding:2px 6px;}

  /* ---- two column layout ---- */
  #app .cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;align-items:start;}
  @media(max-width:900px){#app .cols{grid-template-columns:1fr;}}

  /* ---- fields ---- */
  #app .field{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);}
  #app .field:first-child{border-top:none;}
  #app .field label{font-size:12.5px;color:var(--muted);flex:1;}
  #app .field .grp-in{display:flex;align-items:center;gap:6px;}
  #app .field .unit{font-size:11px;color:var(--faint);font-family:"JetBrains Mono";}
  #app .field input[type=text]{
    width:96px;background:var(--ink);border:1px solid var(--line2);color:var(--text);
    font-family:"JetBrains Mono";font-size:13px;font-weight:500;text-align:right;
    padding:7px 9px;border-radius:7px;
  }
  #app .field input.short{width:60px;}
  #app .field input:focus{outline:2px solid var(--grid);outline-offset:1px;border-color:var(--grid);}
  #app .field input.ro{background:#0d1217;color:var(--solar);border-style:dashed;}
  #app .subhead{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);margin:16px 0 2px;}

  /* toggle switch */
  #app .sw{position:relative;width:46px;height:26px;flex:none;cursor:pointer;}
  #app .sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;}
  #app .sw .track{position:absolute;inset:0;background:#2b3641;border-radius:999px;transition:background .2s;border:1px solid var(--line2);}
  #app .sw .knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#aab6c2;transition:transform .2s, background .2s;}
  #app .sw input:checked + .track{background:rgba(84,192,138,.32);border-color:var(--good);}
  #app .sw input:checked + .track + .knob{transform:translateX(20px);background:var(--good);}
  #app .chk{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;color:var(--muted);cursor:pointer;padding:8px 0;}
  #app .chk input{width:16px;height:16px;margin-top:1px;accent-color:var(--good);cursor:pointer;flex:none;}

  /* segmented control */
  #app .seg-ctl{display:inline-flex;background:var(--ink);border:1px solid var(--line2);border-radius:8px;padding:2px;}
  #app .seg-ctl label{font-family:"JetBrains Mono";font-size:11px;color:var(--muted);padding:5px 12px;border-radius:6px;cursor:pointer;transition:.15s;}
  #app .seg-ctl input{display:none;}
  #app .seg-ctl input:checked + label{background:var(--raise);color:var(--text);}

  /* toolbar buttons */
  #app .tbtn{background:var(--ink);border:1px solid var(--line2);color:var(--muted);font-family:"JetBrains Mono";font-size:11px;padding:6px 10px;border-radius:7px;cursor:pointer;transition:.15s;}
  #app .tbtn:hover{color:var(--text);border-color:var(--text);}
  #app .tbtn.prim{color:var(--grid);border-color:rgba(74,163,223,.4);}
  #app .tbar{display:flex;gap:6px;}

  /* chart */
  #app #graph{width:100%;height:360px;color:var(--muted);font-family:"JetBrains Mono";font-size:11px;}
  #app #graph .legendLabel{color:var(--text);padding-left:4px;}
  #app #graph .legendColorBox > div{border-color:transparent !important;}

  /* flows / tables */
  #app table.flows{width:100%;border-collapse:collapse;}
  #app table.flows td{padding:8px 0;border-top:1px solid var(--line);font-size:13px;color:var(--text);}
  #app table.flows td:last-child{text-align:right;font-family:"JetBrains Mono";font-weight:500;}
  #app table.flows tr:first-child td{border-top:none;}
  #app table.flows .tag{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:9px;vertical-align:baseline;}
  #app table.flows .grp{color:var(--faint);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding-top:16px;}
  #app table.flows .sub td{color:var(--muted);padding-left:18px;}
  #app table.flows .tot td{font-weight:700;border-top:1.5px solid var(--line2);}
  #app .credit{color:var(--good);}

  #app .table-wrap{overflow-x:auto;}
  #app table.months{width:100%;border-collapse:collapse;font-size:12.5px;}
  #app table.months thead th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--faint);font-weight:600;text-align:right;padding:8px 10px;border-bottom:1px solid var(--line2);white-space:nowrap;}
  #app table.months thead th:first-child{text-align:left;}
  #app table.months td{padding:7px 10px;border-top:1px solid var(--line);text-align:right;font-family:"JetBrains Mono";color:var(--text);white-space:nowrap;}
  #app table.months td:first-child{text-align:left;font-family:"Inter";color:var(--muted);}
  #app table.months tbody tr:hover td{background:var(--panel2);}
  #app table.months tfoot td{border-top:1.5px solid var(--line2);font-weight:700;}

  #app .foot{margin-top:8px;color:var(--faint);font-size:11.5px;line-height:1.65;}
  #app .foot b{color:var(--muted);}
</style>

<div class="sm-stage" id="app">
 <div class="wrap">

  <!-- masthead -->
  <header class="masthead">
    <div>
      <p class="eyebrow">Solar self-consumption · half-hourly model</p>
      <h1>Solar Matching</h1>
      <p>How much of your home's electric, heat-pump and EV demand can be met directly by solar and a battery &mdash; and what it costs on a flat-rate or Agile (half-hourly) tariff.</p>
    </div>
  </header>

  <!-- hero ledger -->
  <section class="hero">
    <div class="hero-top">
      <div class="hero-headline">Where your energy comes from &amp; goes</div>
      <div class="badge-stat">{{ annual.prc_from_solar | toFixed(0) }}% self-sufficient</div>
    </div>

    <div class="ledger-row">
      <div class="ledger-label"><b>Annual demand</b>met locally vs grid</div>
      <div class="bar">
        <div class="seg" :style="{flexGrow: Math.max(annual.demand_kwh - annual.import_kwh, 0), background:'var(--battery)'}" :title="'Self-supplied: '+(annual.demand_kwh-annual.import_kwh).toFixed(0)+' kWh'"></div>
        <div class="seg" :style="{flexGrow: Math.max(annual.import_kwh,0), background:'var(--grid)'}" :title="'Grid import: '+annual.import_kwh.toFixed(0)+' kWh'"></div>
      </div>
      <div class="ledger-total num">{{ annual.demand_kwh | toFixed(0) }}<span>kWh / year</span></div>
    </div>

    <div class="ledger-row">
      <div class="ledger-label"><b>Solar generation</b>self-used vs exported</div>
      <div class="bar">
        <div class="seg" :style="{flexGrow: Math.max(annual.solar_kwh - annual.export_kwh, 0), background:'var(--solar)'}" :title="'Self-used: '+(annual.solar_kwh-annual.export_kwh).toFixed(0)+' kWh'"></div>
        <div class="seg" :style="{flexGrow: Math.max(annual.export_kwh,0), background:'var(--solardim)'}" :title="'Exported: '+annual.export_kwh.toFixed(0)+' kWh'"></div>
      </div>
      <div class="ledger-total num">{{ annual.solar_kwh | toFixed(0) }}<span>kWh / year</span></div>
    </div>

    <div class="legend">
      <div class="lg"><span class="dot" style="background:var(--battery)"></span>Self-supplied demand</div>
      <div class="lg"><span class="dot" style="background:var(--grid)"></span>Grid import</div>
      <div class="lg"><span class="dot" style="background:var(--solar)"></span>Solar self-used</div>
      <div class="lg"><span class="dot" style="background:var(--solardim)"></span>Solar exported</div>
    </div>
  </section>

  <!-- headline stats -->
  <div class="stat-row">
    <div class="stat a-solar">
      <div class="k">Self-sufficiency</div>
      <div class="v">{{ annual.prc_from_solar | toFixed(0) }}<small>%</small></div>
      <div class="s">of {{ annual.demand_kwh | toFixed(0) }} kWh demand</div>
    </div>
    <div class="stat a-solar">
      <div class="k">Self-consumption</div>
      <div class="v">{{ annual.prc_self_consumption | toFixed(0) }}<small>%</small></div>
      <div class="s">of {{ annual.solar_kwh | toFixed(0) }} kWh solar</div>
    </div>
    <div class="stat a-grid">
      <div class="k">Grid import</div>
      <div class="v">{{ annual.import_kwh | toFixed(0) }}<small> kWh</small></div>
      <div class="s">export {{ annual.export_kwh | toFixed(0) }} kWh</div>
    </div>
    <div class="stat a-cost">
      <div class="k">Flat-rate cost</div>
      <div class="v">£{{ annual.cost | toFixed(0) }}</div>
      <div class="s">{{ annual.saving | toFixed(0) }}% saving</div>
    </div>
    <div class="stat a-agile">
      <div class="k">Agile cost</div>
      <div class="v">£{{ annual.agile_cost | toFixed(0) }}</div>
      <div class="s">{{ annual.agile_saving | toFixed(0) }}% saving</div>
    </div>
  </div>

  <!-- chart -->
  <div class="card">
    <div class="card-head">
      <h2>
        <span v-if="view=='monthly'">Monthly demand &amp; generation</span>
        <span v-if="view=='power'">Power view</span>
        <span class="hint" v-if="view=='monthly'">kWh &middot; click a month to zoom in</span>
        <span class="hint" v-if="view=='power'">watts &middot; drag to select a range</span>
      </h2>
      <div class="tbar">
        <button v-if="view=='monthly'" class="tbtn prim" @click="switch_to_power_view">⤢ power view</button>
        <template v-if="view=='power'">
          <button class="tbtn" @click="zoom_in" title="Zoom in">＋</button>
          <button class="tbtn" @click="zoom_out" title="Zoom out">－</button>
          <button class="tbtn" @click="pan_left" title="Pan left">‹</button>
          <button class="tbtn" @click="pan_right" title="Pan right">›</button>
          <button class="tbtn prim" @click="draw_monthly_view">▦ monthly</button>
        </template>
      </div>
    </div>
    <div id="graph"></div>
  </div>

  <div class="cols">

    <!-- LEFT: inputs -->
    <div>
      <div class="card">
        <div class="card-head"><h2><span class="tag-ico" style="background:var(--solar)">PV</span> Solar &amp; battery</h2></div>
        <div class="field"><label>Solar array size</label><div class="grp-in"><input type="text" v-model.number="solar_kWp" @change="update"><span class="unit">kWp</span></div></div>
        <div class="field"><label>Yield</label><div class="grp-in"><input type="text" v-model.number="solar_kWh_per_kWp" @change="update"><span class="unit">kWh/kWp</span></div></div>
        <div class="field"><label>Annual generation</label><div class="grp-in"><input type="text" class="ro" :value="annual.solar_kwh | toFixed(0)" disabled><span class="unit">kWh</span></div></div>
        <div class="field"><label>Battery capacity</label><div class="grp-in"><input type="text" v-model.number="battery.capacity" @change="update"><span class="unit">kWh</span></div></div>

        <template v-if="battery.capacity>0">
          <div class="subhead">Battery scheduling</div>
          <label class="chk"><input type="checkbox" true-value="optimal" false-value="greedy" v-model="battery.dispatch" @change="update">Optimal dispatch &mdash; cost-optimised against Agile prices (overrides manual scheduling below)</label>

          <template v-if="battery.dispatch!='optimal'">
            <label class="chk"><input type="checkbox" v-model="battery.force_discharge_enable" @change="update">Discharge remaining battery to load &amp; grid during peak window</label>
            <div class="field" v-if="battery.force_discharge_enable"><label>Discharge window</label><div class="grp-in"><input type="text" class="short" v-model.number="battery.force_discharge_start_hour" @change="update"><span class="unit">to</span><input type="text" class="short" v-model.number="battery.force_discharge_end_hour" @change="update"><span class="unit">h</span></div></div>

            <label class="chk"><input type="checkbox" v-model="battery.overnight_charge_enable" @change="update">Recharge from grid overnight up to a target state of charge</label>
            <div class="field" v-if="battery.overnight_charge_enable"><label>Charge window</label><div class="grp-in"><input type="text" class="short" v-model.number="battery.overnight_charge_start_hour" @change="update"><span class="unit">to</span><input type="text" class="short" v-model.number="battery.overnight_charge_end_hour" @change="update"><span class="unit">h</span></div></div>
            <div class="field" v-if="battery.overnight_charge_enable"><label>Target state of charge</label><div class="grp-in"><input type="text" class="short" v-model.number="battery.overnight_charge_target_pct" @change="update"><span class="unit">%</span></div></div>
          </template>
        </template>
      </div>

      <div class="card">
        <div class="card-head"><h2><span class="tag-ico" style="background:var(--hp)">HP</span> Demand &amp; heat pump</h2></div>
        <div class="field"><label>Standard electric</label><div class="grp-in"><input type="text" v-model.number="lac_demand" @change="update"><span class="unit">kWh</span></div></div>
        <div class="field"><label>Heat demand</label><div class="grp-in"><input type="text" v-model.number="heat_demand" @change="update"><span class="unit">kWh</span></div></div>
        <div class="field"><label>Heat pump SCOP</label><div class="grp-in"><input type="text" class="short" v-model.number="heatpump_scop" @change="update"></div></div>
        <div class="field"><label>Heat pump electric</label><div class="grp-in"><input type="text" class="ro" :value="annual.heatpump_elec_kwh | toFixed(0)" disabled><span class="unit">kWh</span></div></div>
        <div class="field"><label>Total electric demand</label><div class="grp-in"><input type="text" class="ro" :value="annual.total_elec_kwh | toFixed(0)" disabled><span class="unit">kWh</span></div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2><span class="tag-ico" style="background:var(--ev)">EV</span> Electric vehicle</h2>
          <div class="seg-ctl">
            <input type="radio" id="ev_sim" value="simulated" v-model="ev_mode" @change="update"><label for="ev_sim">Simulated</label>
            <input type="radio" id="ev_real" value="real" v-model="ev_mode" @change="update"><label for="ev_real">Measured</label>
          </div>
        </div>
        <template v-if="ev_mode=='simulated'">
          <div class="field"><label>Annual miles</label><div class="grp-in"><input type="text" v-model.number="ev_miles" @change="update"><span class="unit">mi</span></div></div>
          <div class="field"><label>Efficiency</label><div class="grp-in"><input type="text" v-model.number="ev_efficiency" @change="update"><span class="unit">mi/kWh</span></div></div>
          <div class="field"><label>Charge power</label><div class="grp-in"><input type="text" v-model.number="ev_charge_power" @change="update"><span class="unit">kW</span></div></div>
          <div class="field"><label>Charge window</label><div class="grp-in"><input type="text" class="short" v-model.number="ev_charge_start_hour" @change="update"><span class="unit">to</span><input type="text" class="short" v-model.number="ev_charge_end_hour" @change="update"><span class="unit">h</span></div></div>
        </template>
        <p v-else style="color:var(--muted);font-size:12.5px;margin:4px 0 8px;">Using measured half-hourly EV charging data from the monitored home.</p>
        <div class="field"><label>EV electric demand</label><div class="grp-in"><input type="text" class="ro" :value="annual.ev_elec_kwh | toFixed(0)" disabled><span class="unit">kWh</span></div></div>
      </div>

      <div class="card">
        <div class="card-head"><h2><span class="tag-ico" style="background:var(--battery)">£</span> Tariff rates</h2></div>
        <div class="subhead">Flat-rate tariff</div>
        <div class="field"><label>Import rate</label><div class="grp-in"><input type="text" v-model.number="import_rate" @change="update"><span class="unit">p/kWh</span></div></div>
        <div class="field"><label>Export rate</label><div class="grp-in"><input type="text" v-model.number="export_rate" @change="update"><span class="unit">p/kWh</span></div></div>
        <div class="subhead">Agile (half-hourly) &middot; inc. VAT</div>
        <div class="field"><label>Avg import rate</label><div class="grp-in"><input type="text" class="ro" :value="annual.avg_agile_import_rate | toFixed(1)" disabled><span class="unit">p/kWh</span></div></div>
        <div class="field"><label>Avg export rate</label><div class="grp-in"><input type="text" class="ro" :value="annual.avg_agile_export_rate | toFixed(1)" disabled><span class="unit">p/kWh</span></div></div>
      </div>
    </div>

    <!-- RIGHT: results -->
    <div>
      <div class="card">
        <div class="card-head"><h2>Annual cost</h2><span class="hint">flat-rate vs agile</span></div>
        <table class="flows">
          <tr><td class="grp" colspan="2">Flat-rate tariff</td></tr>
          <tr><td><span class="tag" style="background:var(--grid)"></span>Import @ {{ import_rate }}p</td><td class="num">£{{ (annual.import_kwh*import_rate*0.01) | toFixed(0) }}</td></tr>
          <tr class="sub"><td>Export credit @ {{ export_rate }}p</td><td class="num credit">−£{{ (annual.export_kwh*export_rate*0.01) | toFixed(0) }}</td></tr>
          <tr class="tot"><td>Flat-rate net</td><td class="num">£{{ annual.cost | toFixed(0) }}</td></tr>

          <tr><td class="grp" colspan="2">Agile (half-hourly) tariff</td></tr>
          <tr><td><span class="tag" style="background:var(--ev)"></span>Import cost</td><td class="num">£{{ annual.agile_import_cost | toFixed(0) }}</td></tr>
          <tr class="sub"><td>Export earnings</td><td class="num credit">−£{{ annual.agile_export_earnings | toFixed(0) }}</td></tr>
          <tr class="tot"><td>Agile net</td><td class="num">£{{ annual.agile_cost | toFixed(0) }}</td></tr>
        </table>
        <p class="foot" style="margin-top:14px;">
          Agile net <b>£{{ annual.agile_cost | toFixed(0) }}</b> vs flat-rate <b>£{{ annual.cost | toFixed(0) }}</b>
          &mdash; a {{ (annual.cost - annual.agile_cost) | toFixed(0) }} £ difference.
          Avg agile import {{ annual.avg_agile_import_rate | toFixed(1) }}p (inc. VAT), export {{ annual.avg_agile_export_rate | toFixed(1) }}p per kWh.
        </p>
      </div>

      <div class="card">
        <div class="card-head"><h2>Electricity flows</h2></div>
        <table class="flows">
          <tr><td>Total demand</td><td class="num">{{ annual.demand_kwh | toFixed(0) }} kWh</td></tr>
          <tr><td><span class="tag" style="background:var(--solar)"></span>Solar generated</td><td class="num">{{ annual.solar_kwh | toFixed(0) }} kWh</td></tr>
          <tr class="sub"><td>self-used ({{ annual.prc_self_consumption | toFixed(0) }}%)</td><td class="num credit">{{ (annual.solar_kwh - annual.export_kwh) | toFixed(0) }} kWh</td></tr>
          <tr class="sub"><td>exported</td><td class="num">{{ annual.export_kwh | toFixed(0) }} kWh</td></tr>
          <tr class="tot"><td>Grid import</td><td class="num">{{ annual.import_kwh | toFixed(0) }} kWh</td></tr>
        </table>
        <div class="bar" style="height:8px;margin-top:14px;">
          <div class="seg" :style="{flexGrow: Math.max(annual.solar_kwh - annual.export_kwh, 0.001), background:'var(--battery)'}"></div>
          <div class="seg" :style="{flexGrow: Math.max(annual.export_kwh, 0.001), background:'var(--solar)'}"></div>
        </div>
        <p class="foot" style="margin-top:10px;">
          {{ annual.prc_self_consumption | toFixed(0) }}% of your solar is used at home. Adding load or battery capacity pushes this up &mdash; every self-consumed kWh avoids the {{ import_rate }}p import rate versus {{ export_rate }}p if exported.
        </p>
      </div>
    </div>
  </div>

  <!-- monthly breakdown -->
  <div class="card">
    <div class="card-head"><h2>Monthly breakdown</h2></div>
    <div class="table-wrap">
      <table class="months">
        <thead>
          <tr>
            <th>Month</th><th>Solar</th><th>Demand</th><th>Import</th><th>Export</th>
            <th>From solar</th><th>Agile imp</th><th>Agile exp</th><th>Agile net</th><th>Flat net</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="month in monthly.table">
            <td>{{month.month}}</td>
            <td>{{month.solar_kwh | toFixed(0)}}</td>
            <td>{{month.demand_kwh | toFixed(0)}}</td>
            <td>{{month.import_kwh | toFixed(0)}}</td>
            <td>{{month.export_kwh | toFixed(0)}}</td>
            <td>{{100 * (month.demand_kwh - month.import_kwh) / month.demand_kwh | toFixed(0)}}%</td>
            <td>£{{month.agile_import_cost | toFixed(2)}}</td>
            <td>£{{month.agile_export_earnings | toFixed(2)}}</td>
            <td>£{{month.agile_cost | toFixed(2)}}</td>
            <td>£{{month.flat_cost | toFixed(2)}}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{{annual.solar_kwh | toFixed(0)}}</td>
            <td>{{annual.demand_kwh | toFixed(0)}}</td>
            <td>{{annual.import_kwh | toFixed(0)}}</td>
            <td>{{annual.export_kwh | toFixed(0)}}</td>
            <td>{{100 * (annual.demand_kwh - annual.import_kwh) / annual.demand_kwh | toFixed(0)}}%</td>
            <td>£{{annual.agile_import_cost | toFixed(2)}}</td>
            <td>£{{annual.agile_export_earnings | toFixed(2)}}</td>
            <td>£{{annual.agile_cost | toFixed(2)}}</td>
            <td>£{{annual.cost | toFixed(2)}}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

 </div>
</div>


<script>
// This file is the Vue *view* only. The simulation lives in model.js (the
// `model` global), which loads the data, prepares it and runs the model,
// returning a results object. The view collects inputs into a params object,
// calls model.run(params) and renders the result.
//
// The timeseries data is stored as values-only arrays (no timestamps) to keep
// the data file small. The fixed start time and interval are enough to derive
// the time of any sample; timestamps are only added to the series that are
// handed to Flot for plotting (see timeseries() and draw_*_view()).

// Start time / time-of-sample helpers delegate to the model so both stay in sync.
var data_start_time = model.data_start_time; // ms
function time_at(i) {
    return model.time_at(i);
}

// Power series for the power view, copied out of the latest model result so the
// plotting helpers (timeseries(), draw_power_view()) can reach them.
var solar_data = [];
var demand_data = [];
var soc_data = [];

var month_timestamps = [];

// Dark-theme Flot grid styling shared by both views
var flot_grid = {
    hoverable: true,
    clickable: true,
    color: "#2c3742",
    tickColor: "#1e2731",
    borderColor: "#2c3742"
};
var flot_legend = {
    backgroundColor: "transparent",
    backgroundOpacity: 0,
    labelBoxBorderColor: "transparent"
};

var app = new Vue({
    el: '#app',
    data: {
        // inputs
        solar_kWp: 4,
        solar_kWh_per_kWp: 870,

        // demand
        lac_demand: 2120,
        heat_demand: 9610,
        heatpump_scop: 4.0,

        ev_mode: 'simulated',  // 'simulated' charging profile or 'real' measured data
        ev_miles: 16000,    // miles per year
        ev_efficiency: 3.8, // miles per kWh
        ev_battery_capacity: 64, // kWh
        ev_charge_power: 7,      // kW charge rate
        ev_charge_start_hour: 0, // start charging overnight (midnight)
        ev_charge_end_hour: 7,   // latest hour charging can continue to

        battery: {
            capacity: 0,
            soc: 0,
            soc_start: 0,
            charge_kwh: 0,
            discharge_kwh: 0,
            charge_max: 3.5,
            discharge_max: 3.5,
            charge_efficiency: 0.9,
            discharge_efficiency: 0.9,
            // Dispatch: 'greedy' (manual scheduling below) or 'optimal'
            // (cost-optimised against Agile prices; see model.js optimiseBatteryDP)
            dispatch: 'greedy',
            soc_levels: 100,
            cycle_cost: 0,
            // Forced peak discharge: empty remaining charge to load + grid in the window
            force_discharge_enable: false,
            force_discharge_start_hour: 16, // 4pm
            force_discharge_end_hour: 19,   // 7pm
            // Overnight recharge from grid up to a target state of charge
            overnight_charge_enable: false,
            overnight_charge_start_hour: 0, // midnight
            overnight_charge_end_hour: 5,   // 5am
            overnight_charge_target_pct: 80
        },

        import_rate: 26,
        export_rate: 10,

        // outputs from the model: annual scalars and monthly breakdown.
        // Populated by model.run() in update() - see model.js result object.
        annual: {
            // derived demand
            heatpump_elec_kwh: 0,
            ev_elec_kwh: 0,
            total_elec_kwh: 0,
            // energy
            solar_kwh: 0,
            demand_kwh: 0,
            import_kwh: 0,
            export_kwh: 0,
            prc_from_solar: 0,
            prc_self_consumption: 0,
            // flat-rate tariff
            cost: 0,
            saving: 0,
            // agile tariff
            agile_import_cost: 0,
            agile_export_earnings: 0,
            agile_cost: 0,
            agile_saving: 0,
            avg_agile_import_rate: 0,
            avg_agile_export_rate: 0
        },

        monthly: {
            table: [],
            timestamps: []
        },

        interval: 900,

        view: "monthly" // or "power"
    },
    methods: {
        update: function () {
            console.log("---- Update ----");

            // Collect the view inputs into a params object for the model.
            var params = {
                solar_kWp: app.solar_kWp,
                solar_kWh_per_kWp: app.solar_kWh_per_kWp,

                lac_demand: app.lac_demand,
                heat_demand: app.heat_demand,
                heatpump_scop: app.heatpump_scop,

                ev_mode: app.ev_mode,
                ev_miles: app.ev_miles,
                ev_efficiency: app.ev_efficiency,
                ev_charge_power: app.ev_charge_power,
                ev_charge_start_hour: app.ev_charge_start_hour,
                ev_charge_end_hour: app.ev_charge_end_hour,

                battery: app.battery,

                import_rate: app.import_rate,
                export_rate: app.export_rate
            };

            // Run the model and map the result onto the view. Annual scalars and
            // the monthly breakdown are exposed wholesale as app.annual / app.monthly.
            var result = model.run(params);
            app.annual = result.annual;
            app.monthly = result.monthly;

            // half-hourly power series + month boundaries for the plotting helpers
            solar_data = result.solar_data;
            demand_data = result.demand_data;
            soc_data = result.soc_data;
            month_timestamps = result.monthly.timestamps;

            if (app.view == "monthly") {
                app.draw_monthly_view();
            } else {
                app.draw_power_view();
            }
        },
        draw_monthly_view: function () {

            app.view = "monthly";

            // Plot series are derived from the monthly table rows ([m, value],
            // with m the month number). Self use = solar - export; export is
            // plotted negative (below the axis).
            var rows = app.monthly.table;
            var plot_series = [
                {
                    data: rows.map(function (r) { return [r.m, r.demand_kwh]; }),
                    label: "Demand",
                    color: "#4aa3df",
                    bars: { show: true, align: "center", fill: 0.85, lineWidth:0, barWidth: 0.8}
                },{
                    data: rows.map(function (r) { return [r.m, r.solar_kwh - r.export_kwh]; }),
                    label: "Self use",
                    color: "#f5c542",
                    bars: { show: true, align: "center", fill: 0.65, lineWidth:0, barWidth: 0.8}
                },
                {
                    data: rows.map(function (r) { return [r.m, -r.export_kwh]; }),
                    label: "Export",
                    color: "#caa72f",
                    bars: { show: true, align: "center", fill: 0.85, lineWidth:0, barWidth: 0.8}
                }
            ];

            if (app.battery.capacity>100) {
                plot_series.push({
                    data: rows.map(function (r) { return [r.m, r.soc]; }),
                    label: "SOC",
                    color: "#e7edf3",
                    yaxis: 2,
                    lines: { show: true, fill: false, lineWidth: 1}
                });
            }

            var options = {
                xaxis: {
                    // time
                    // mode: "time",
                },
                yaxis: {
                },
                selection: {
                    mode: "x"
                },
                grid: flot_grid,
                legend: flot_legend
            };

            $.plot("#graph", plot_series, options);

        },
        draw_power_view: function () {

            app.view = "power";

            var plot_series = [
                {
                    data: timeseries(demand_data),
                    label: "Demand",
                    color: "#4aa3df",
                    lines: { show: true, fill: 0.85, lineWidth: 0}
                },{
                    data: timeseries(solar_data),
                    label: "Solar",
                    color: "#f5c542",
                    lines: { show: true, fill: 0.8, lineWidth: 0}
                }
            ];

            if (app.battery.capacity>0) {
                plot_series.push({
                    data: timeseries(soc_data),
                    label: "SOC",
                    color: "#e7edf3",
                    yaxis: 2,
                    lines: { show: true, fill: false, lineWidth: 1}
                });
            }

            var options = {
                xaxis: {
                    mode: "time",
                },
                yaxis: {
                    min: 0
                },
                selection: {
                    mode: "x"
                },
                grid: flot_grid,
                legend: flot_legend
            };

            $.plot("#graph", plot_series, options);

        },
        switch_to_power_view: function () {
            app.view = "power";
            view.start = data_start_time;
            view.end = time_at(model.series[0].data.length-1);
            view.calc_interval(2400, 900);
            app.draw_power_view();
        },
        zoom_out: function () {
            view.zoomout();
            view.calc_interval(2400, 900);
            app.draw_power_view();
        },
        zoom_in: function () {
            view.zoomin();
            view.calc_interval(2400, 900);
            app.draw_power_view();
        },
        pan_left: function () {
            view.panleft();
            app.draw_power_view();
        },
        pan_right: function () {
            view.panright();
            app.draw_power_view();
        }
    },
    filters: {
        toFixed: function (val, dp) {
            if (isNaN(val)) {
                return val;
            } else {
                return val.toFixed(dp)
            }
        }
    },
    mounted: function () {

        // 542264: solarpv
        // 542259 + 542261 + 542263: lac demand (appliance + cooker + lighting)
        // 542262: heatpump demand
        // 518378: agile import p/kwh
        // 399363: agile export p/kwh

        // New feeds:
        // appliance demand: 542259
        // cooker demand:    542261
        // lighting demand:  542263
        // heatpump demand:  542262
        // ev demand:        542260
        // solar             542264
        // agile import      518378
        // agile export      399363

        // we need heatpump space and water heating demand split out.
        // we need electric vehicle demand.

        // interval 900 = 15 mins

        // The model loads, remaps and normalises the data file; once ready we
        // set up the plot view window and run the first simulation.
        model.load("tools/solarmatching/solarmatching_data.json", function () {
            view.start = data_start_time;
            view.end = time_at(model.series[0].data.length - 1);
            view.calc_interval(2400, 900);

            app.update();
        });
    }
});

// return subset of data for power view - keeps things snappy
// data is a values-only array; timestamps are added here for plotting
function timeseries(data)
{
    if (data==undefined) return [];
    var len = data.length;
    var ts = [];

    for (var time=view.start; time<view.end; time+=view.interval*1000) {
        let pos = Math.floor((time-data_start_time)/(app.interval*1000));
        if (pos>=0 && pos<len) {
            ts.push([time_at(pos), data[pos]]);
        }
    }
    return ts;
}

$("#graph").bind("plotselected", function (event, ranges)
{
    if (app.view == "monthly") {
        return;
    }

    view.start = ranges.xaxis.from;
    view.end = ranges.xaxis.to;
    view.calc_interval(2400, 900);
    app.draw_power_view();
});

// Auto click through to power graph
$('#graph').bind("plotclick", function (event, pos, item) {
    if (item && app.view == "monthly") {
        var month_index = item.dataIndex;

        view.start = month_timestamps[month_index][0];
        view.end = month_timestamps[month_index][1];
        view.calc_interval(2400, 900);
        app.view = "power";
        app.draw_power_view();
    }
});

</script>
