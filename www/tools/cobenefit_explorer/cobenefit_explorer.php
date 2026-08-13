<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title><?php echo $title; ?></title>
<meta name="description" content="<?php echo $description; ?>">
<link rel="stylesheet" href="<?php echo $path; ?>cobenefit_explorer.css?v=4">
<script>
// Theme, applied before the first paint so the page never flashes the palette
// the visitor is about to switch away from. A stored choice wins; with none,
// default to light. The switch itself is wired up in
// cobenefit_explorer.js, which writes the same key.
(function () {
  var stored = null;
  try { stored = localStorage.getItem('oem-theme'); } catch (e) { /* private mode */ }
  var light = stored ? stored === 'light' : true;
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
})();
</script>
</head>
<body>

<!-- ================= Site nav ================= -->
<header class="topbar">
  <div class="topbar-left">
    <button type="button" class="btn-bar icon-only" data-bs-toggle="offcanvas" data-bs-target="#sidebar"
            aria-controls="sidebar" aria-label="Open tools menu">
      <span class="icon-bars" aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
    <div class="topbar-titles">
      <!-- Tool urls are one level deep (/tools/cobenefit_explorer), so "./"
           is the site home and the menu's own 'case' values resolve as-is -->
      <a class="topbar-brand" href="./">OpenEnergyMonitor.org Tools</a>
      <span class="topbar-here">&middot; <?php echo $title; ?></span>
    </div>
  </div>
  <div class="topbar-right">
    <!-- Both glyphs are in the markup; the stylesheet draws the one for the
         theme you would switch to. -->
    <button type="button" class="btn-bar icon-only theme-toggle" id="theme-toggle"
            aria-label="Switch to light theme" title="Switch to light theme">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.4v2.3M12 19.3v2.3M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.4 12h2.3M19.3 12h2.3M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
      </svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.8 14.7A8.7 8.7 0 0 1 9.3 3.2 8.7 8.7 0 1 0 20.8 14.7z" />
      </svg>
    </button>
    <a class="btn-bar" href="<?php echo $github; ?>">Source</a>
  </div>
</header>

<!-- Shared tool navigation sidebar, pulled in from the core -->
<?php echo view("components/tool_sidebar.php", array('menu' => $menu)); ?>

<div id="app" class="wrap" v-cloak>

  <header class="masthead">
    <div class="brand">
      <h1>Household Co-benefit Explorer</h1>
      <p>Start from a fossil-fueled baseline, then switch on low carbon technologies in any order. Running costs <em>and</em> the assets you would replace anyway are tracked together, so each step is compared fairly.</p>
    </div>
    <div class="masthead-actions">
      <div class="modeseg" role="group" aria-label="Metric basis">
        <button :class="{on:costMode==='running'}" @click="costMode='running'">Running costs only</button>
        <button :class="{on:costMode==='allin'}" @click="costMode='allin'">Running costs + assets</button>
        <button :class="{on:costMode==='carbon'}" @click="costMode='carbon'">Carbon</button>
      </div>
      <button class="reset" @click="resetAll">↺ Reset assumptions</button>
    </div>
  </header>

  <!-- HERO LEDGER -->
  <section class="hero" v-if="!isCarbon">
    <div class="hero-top">
      <div class="hero-headline">{{ costModeLabel }} annual cost: fossil fueled status quo vs your current build</div>
      <div class="saving-badge" :class="saving>=0?'pos':'neg'">
        {{ saving>=0 ? '▼ saves ' : '▲ costs ' }}{{ gbp(Math.abs(saving)) }}/yr
      </div>
    </div>

    <div class="ledger-row">
      <div class="ledger-label"><b>Status quo</b>petrol + gas boiler</div>
      <div class="bar">
        <div v-if="costNegMax>0" class="zero-line" :style="{left:zeroFrac(costPosMax,costNegMax)*100+'%'}"></div>
        <div class="barfill" :class="{credit:costOf(statusQuo)<0}" :style="barFill(costOf(statusQuo),costPosMax,costNegMax)" :title="costOf(statusQuo)<0?'Net credit: '+gbp(costOf(statusQuo)):null">
          <template v-if="costOf(statusQuo)>=0">
            <div v-for="s in costSegments(statusQuo)" :key="s.key" class="seg"
                 :style="{flexGrow:Math.max(s.value,0), background:s.color}" :title="s.label+': '+gbp(s.value)"></div>
          </template>
        </div>
      </div>
      <div class="ledger-total num">{{ gbp(costOf(statusQuo)) }}<span>/year</span></div>
    </div>

    <div class="ledger-row">
      <div class="ledger-label"><b>This build</b>{{ buildName }}</div>
      <div class="bar">
        <div v-if="costNegMax>0" class="zero-line" :style="{left:zeroFrac(costPosMax,costNegMax)*100+'%'}"></div>
        <div class="barfill" :class="{credit:costOf(current)<0}" :style="barFill(costOf(current),costPosMax,costNegMax)" :title="costOf(current)<0?'Net credit: '+gbp(costOf(current)):null">
          <template v-if="costOf(current)>=0">
            <div v-for="s in costSegments(current)" :key="s.key" class="seg"
                 :style="{flexGrow:Math.max(s.value,0), background:s.color}" :title="s.label+': '+gbp(s.value)"></div>
          </template>
        </div>
      </div>
      <div class="ledger-total num">{{ gbp(costOf(current)) }}<span>/year</span></div>
    </div>

    <div class="legend">
      <div class="lg" v-for="l in legend" :key="l.label"><span class="dot" :style="{background:l.color}"></span>{{ l.label }}</div>
    </div>
  </section>

  <!-- CARBON HERO LEDGER -->
  <section class="hero" v-if="isCarbon">
    <div class="hero-top">
      <div class="hero-headline">Carbon: fossil status quo vs your current build <span class="pill" style="margin-left:8px;">operational + embodied</span></div>
      <div class="saving-badge" :class="carbonSaving>=0?'pos':'neg'">
        {{ carbonSaving>=0 ? '▼ cuts ' : '▲ adds ' }}{{ co2(Math.abs(carbonSaving)) }} CO₂e/yr
      </div>
    </div>

    <div class="ledger-row">
      <div class="ledger-label"><b>Status quo</b>petrol + gas boiler</div>
      <div class="bar">
        <div v-if="carbonNegMax>0" class="zero-line" :style="{left:zeroFrac(carbonPosMax,carbonNegMax)*100+'%'}"></div>
        <div class="barfill" :class="{credit:statusQuo.totalCO2<0}" :style="barFill(statusQuo.totalCO2,carbonPosMax,carbonNegMax)" :title="statusQuo.totalCO2<0?'Net carbon credit: '+co2(statusQuo.totalCO2):null">
          <template v-if="statusQuo.totalCO2>=0">
            <div v-for="s in statusQuo.carbonSegments" :key="s.key" class="seg"
                 :style="{flexGrow:Math.max(s.value,0), background:s.color}" :title="s.label+': '+co2(s.value)"></div>
          </template>
        </div>
      </div>
      <div class="ledger-total num">{{ co2(statusQuo.totalCO2) }}<span>CO₂e/yr</span></div>
    </div>

    <div class="ledger-row">
      <div class="ledger-label"><b>This build</b>{{ buildName }}</div>
      <div class="bar">
        <div v-if="carbonNegMax>0" class="zero-line" :style="{left:zeroFrac(carbonPosMax,carbonNegMax)*100+'%'}"></div>
        <div class="barfill" :class="{credit:current.totalCO2<0}" :style="barFill(current.totalCO2,carbonPosMax,carbonNegMax)" :title="current.totalCO2<0?'Net carbon credit: '+co2(current.totalCO2):null">
          <template v-if="current.totalCO2>=0">
            <div v-for="s in current.carbonSegments" :key="s.key" class="seg"
                 :style="{flexGrow:Math.max(s.value,0), background:s.color}" :title="s.label+': '+co2(s.value)"></div>
          </template>
        </div>
      </div>
      <div class="ledger-total num">{{ co2(current.totalCO2) }}<span>CO₂e/yr</span></div>
    </div>

    <div class="legend">
      <div class="lg"><span class="dot" style="background:var(--petrol)"></span>Petrol</div>
      <div class="lg"><span class="dot" style="background:var(--gas)"></span>Gas (incl. upstream)</div>
      <div class="lg"><span class="dot" style="background:var(--grid)"></span>Grid electricity</div>
      <div class="lg"><span class="dot" style="background:var(--ev)"></span>Vehicle embodied</div>
      <div class="lg"><span class="dot" style="background:var(--hp)"></span>Heat plant embodied</div>
      <div class="lg"><span class="dot" style="background:var(--solar)"></span>Solar embodied</div>
      <div class="lg"><span class="dot" style="background:var(--battery)"></span>Battery embodied</div>
    </div>
  </section>

  <div class="grid">

    <!-- LEFT: configuration -->
    <div>
      <div class="card builder">
        <div class="card-head"><h2>Build your home</h2></div>

        <div class="tech">
          <div class="icon" style="background:var(--ev)">EV</div>
          <div class="tx"><b>Electric vehicle</b><small>replaces the petrol car</small></div>
          <div class="mg">
            <div class="mgtop"><span class="val">{{ marginalPrimary('ev') }}</span><span class="infotip" tabindex="0" role="img" aria-label="Step breakdown"><span class="ic">i</span><span class="tipcard" v-html="marginalTipHtml('ev')"></span></span></div>
            <span>{{ marginalCaption() }}</span>
          </div>
          <label class="sw"><input type="checkbox" v-model="cfg.ev"><span class="track"></span><span class="knob"></span></label>
        </div>

        <div class="tech">
          <div class="icon" style="background:var(--hp)">HP</div>
          <div class="tx"><b>Heat pump</b><small>replaces the gas boiler</small></div>
          <div class="mg">
            <div class="mgtop"><span class="val">{{ marginalPrimary('hp') }}</span><span class="infotip" tabindex="0" role="img" aria-label="Step breakdown"><span class="ic">i</span><span class="tipcard" v-html="marginalTipHtml('hp')"></span></span></div>
            <span>{{ marginalCaption() }}</span>
          </div>
          <label class="sw"><input type="checkbox" v-model="cfg.hp"><span class="track"></span><span class="knob"></span></label>
        </div>

        <div class="tech">
          <div class="icon" style="background:var(--solar)">PV</div>
          <div class="tx"><b>Solar PV</b><small>{{ p.solarKwp }} kWp on the roof</small></div>
          <div class="mg">
            <div class="mgtop"><span class="val">{{ marginalPrimary('solar') }}</span><span class="infotip" tabindex="0" role="img" aria-label="Step breakdown"><span class="ic">i</span><span class="tipcard" v-html="marginalTipHtml('solar')"></span></span></div>
            <span>{{ marginalCaption() }}</span>
          </div>
          <label class="sw"><input type="checkbox" v-model="cfg.solar"><span class="track"></span><span class="knob"></span></label>
        </div>

        <div class="tech">
          <div class="icon" style="background:var(--battery)">B</div>
          <div class="tx"><b>Home battery</b><small>{{ p.batteryKwh }} kWh storage</small></div>
          <div class="mg">
            <div class="mgtop"><span class="val">{{ marginalPrimary('battery') }}</span><span class="infotip" tabindex="0" role="img" aria-label="Step breakdown"><span class="ic">i</span><span class="tipcard" v-html="marginalTipHtml('battery')"></span></span></div>
            <span>{{ marginalCaption() }}</span>
          </div>
          <label class="sw"><input type="checkbox" v-model="cfg.battery"><span class="track"></span><span class="knob"></span></label>
        </div>

        <div class="subcard" v-if="cfg.battery && useHHModel">
          <label class="chk"><input type="checkbox" v-model="optimalDispatch"><b>Optimal battery dispatch</b> <span class="pill warn" v-if="optimalDispatch">slower</span></label>
          <p class="subcard-note">Schedules the battery to minimise cost against the half-hourly prices (charging when cheap, discharging or exporting when expensive, with perfect foresight) rather than following the simple solar-surplus rule.<template v-if="!timeVaryingPricing"> With flat import and export prices there is nothing to arbitrage, so this makes little difference.</template></p>
        </div>

        <div class="tech" :class="{disabled: !useHHModel}">
          <div class="icon" style="background:var(--grid)">⚡</div>
          <div class="tx"><b>Tariff</b><small v-if="useHHModel">flat rate, half-hourly Agile, or your own time-of-day schedule</small><small v-else>time-varying tariffs need the 15-minute model · enable it under Advanced</small></div>
          <div class="mg" v-if="useHHModel && cfg.agile">
            <div class="mgtop"><span class="val">{{ marginalPrimary('agile') }}</span><span class="infotip" tabindex="0" role="img" aria-label="Step breakdown"><span class="ic">i</span><span class="tipcard" v-html="marginalTipHtml('agile')"></span></span></div>
            <span>{{ marginalCaption() }}</span>
          </div>
          <div class="tseg" role="group" aria-label="Tariff type">
            <button :class="{on: tariffSel==='flat'}" @click="tariffSel='flat'">Flat</button>
            <button :class="{on: tariffSel==='agile'}" @click="tariffSel='agile'" :disabled="!useHHModel">Agile</button>
            <button :class="{on: tariffSel==='custom'}" @click="tariffSel='custom'" :disabled="!useHHModel">Custom</button>
          </div>
        </div>

        <div class="subcard tariff-card">
          <!-- flat import rate -->
          <div class="subcard-row" v-if="tariffSel==='flat'">
            <label>Import rate <span class="unit">p/kWh inc. VAT</span></label>
            <input class="num-in" type="number" step="0.01" v-model.number="p.elecRate">
          </div>

          <!-- custom schedule builder -->
          <div v-if="tariffSel==='custom' && useHHModel">
            <div class="tsched-head">
              <b>Schedule</b>
              <span class="tsched-presets">
                <span class="preset-lbl">presets</span>
                <button v-for="(pr,key) in tariffPresets" :key="key" class="presetbtn" @click="applyTariffPreset(key)" :title="'Load '+pr.label">{{ pr.label }}</button>
              </span>
            </div>
            <div class="tsched">
              <div class="tsched-row tsched-labels">
                <span>From</span>
                <span class="r">Import</span>
                <span class="r" :class="{strike: cfg.exportMode!=='schedule'}">Export</span>
                <span></span>
              </div>
              <div class="tsched-row" v-for="(row,i) in p.tariffSchedule" :key="i">
                <input type="time" v-model="row.start">
                <input type="number" step="0.01" v-model.number="row.price">
                <input type="number" step="0.01" v-model.number="row.export" :disabled="cfg.exportMode!=='schedule'" :title="cfg.exportMode!=='schedule' ? 'Export set by Agile Outgoing' : ''">
                <button class="iconbtn" @click="removeTariffRow(i)" :disabled="p.tariffSchedule.length<=1" title="Remove">🗑</button>
              </div>
            </div>
            <button class="addband" @click="addTariffRow" title="Add time band">+ add band</button>
            <p class="subcard-note">Prices (p/kWh) apply from each band's start until the next, wrapping past midnight.</p>
          </div>

          <!-- export source selector -->
          <div class="subcard-row" v-if="useHHModel">
            <label>Export</label>
            <div class="tseg" role="group" aria-label="Export tariff">
              <button v-if="tariffSel==='custom'" :class="{on: exportSel==='schedule'}" @click="exportSel='schedule'">Schedule</button>
              <button v-else :class="{on: exportSel==='flat'}" @click="exportSel='flat'">Flat</button>
              <button :class="{on: exportSel==='agile'}" @click="exportSel='agile'">Agile&nbsp;Out</button>
            </div>
          </div>

          <!-- flat export rate -->
          <div class="subcard-row" v-if="cfg.exportMode==='flat'">
            <label>Export rate <span class="unit">{{ tariffSel==='flat' ? 'SEG · ' : '' }}p/kWh</span></label>
            <input class="num-in" type="number" step="0.01" v-model.number="p.segRate">
          </div>

          <!-- standing charge (applies to every tariff) -->
          <div class="subcard-row">
            <label>Standing charge <span class="unit">p/day inc. VAT</span></label>
            <input class="num-in" type="number" step="0.01" v-model.number="p.elecStanding">
          </div>

          <p class="subcard-note" v-if="useHHModel && timeVaryingPricing">Average across this build: <b>{{ current.avgAgileImport==null ? Number(p.elecRate).toFixed(1) : current.avgAgileImport.toFixed(1) }}p</b> import / <b>{{ current.avgAgileExport==null ? Number(p.segRate).toFixed(1) : current.avgAgileExport.toFixed(1) }}p</b> export.</p>
        </div>

        <div class="tech" :class="{disabled: !useHHModel}">
          <div class="icon neutral">CO₂</div>
          <div class="tx"><b>Grid carbon</b><small v-if="useHHModel">flat factors, or the measured half-hourly grid intensity</small><small v-else>half-hourly carbon needs the 15-minute model · enable it under Advanced</small></div>
          <div class="tseg" role="group" aria-label="Grid carbon basis">
            <button :class="{on: !hhCarbon}" @click="hhCarbon=false">Flat</button>
            <button :class="{on: hhCarbon}" @click="hhCarbon=true" :disabled="!useHHModel">Half-hourly</button>
          </div>
        </div>

        <div class="subcard" v-if="hhCarbon && useHHModel">
          <p class="subcard-note" v-if="current.hhCarbon">Each interval's grid import and export is valued at the national grid carbon intensity at that time. Across this build: average import intensity <b>{{ current.avgImportIntensity==null ? '–' : Math.round(current.avgImportIntensity) + ' g/kWh' }}</b> · average export intensity <b>{{ current.avgExportIntensity==null ? '–' : Math.round(current.avgExportIntensity) + ' g/kWh' }}</b>.</p>
          <p class="subcard-note" v-else>Carbon intensity data unavailable in the loaded dataset — using the flat factors.</p>
        </div>

        <div class="tech">
          <div class="icon neutral">◆</div>
          <div class="tx"><b>Hyundai Kona preset</b><small>loads real new and used petrol car / EV figures into the car assumptions</small></div>
          <select v-model="konaChoice" @change="applyKona" class="kona-select">
            <option value="">Select a car</option>
            <option value="petrol-new">Petrol · new (~£27k · 48mpg)</option>
            <option value="petrol-used">Petrol · used 30k mi (~£12.5k)</option>
            <option value="ev-new">Electric · new 65kWh (~£33.5k)</option>
            <option value="ev-used">Electric · used 64kWh (~£13.5k)</option>
          </select>
        </div>

        <div class="subtoggle" v-if="cfg.hp">
          <label class="chk"><input type="checkbox" v-model="cfg.disconnectGas">Disconnect gas entirely</label>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Assumptions</h2><span class="hint">all editable · mid-2026 figures</span></div>

        <details open>
          <summary>Energy prices <span class="unit">inc. VAT</span> <span class="chev">›</span></summary>
          <div class="fields">
            <p style="font-size:11px;color:var(--faint);margin:0 2px 6px;">Electricity import, export &amp; standing charge are set under <em>Build your home · Tariff</em> (flat, Agile or a custom schedule).</p>
            <div class="field"><label>Gas unit rate <span class="unit">p/kWh</span></label><input type="number" step="0.01" v-model.number="p.gasRate"></div>
            <div class="field"><label>Gas standing charge <span class="unit">p/day</span></label><input type="number" step="0.01" v-model.number="p.gasStanding"></div>
          </div>
        </details>

        <details>
          <summary>Discounting · time-value of money <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Real discount rate <span class="unit">%/yr</span></label><input type="number" step="0.5" v-model.number="p.discountRate"></div>
            <p style="font-size:11px;color:var(--faint);margin:6px 2px 0;">Lumpy purchases (car, boiler, heat pump, solar, battery) are turned into an equivalent annual cost with a capital-recovery (annuity) factor at this <em>real</em> (above-inflation) rate, so cash spent today weighs more than cash spent years out; resale values, received at end of life, are discounted back the same way. Set to <b>0</b> for plain straight-line spreading. Running costs (energy, fuel, maintenance) are level year-on-year, so a constant annual figure already is their discounted equivalent.</p>
            <div class="field"><label>Shares-ISA real return <span class="unit">%/yr</span></label><input type="number" step="0.5" v-model.number="p.isaReturn"></div>
            <div class="field"><label>Investment horizon <span class="unit">yrs</span></label><input type="number" v-model.number="p.investHorizon"></div>
            <p style="font-size:11px;color:var(--faint);margin:6px 2px 0;">Used by the payback / IRR / ISA-crossover metrics in <em>This build · the numbers</em>: the <b>extra upfront</b> is treated as the investment and the drop in <b>running costs</b> as the annual return over this horizon. The <b>crossover</b> compares putting that same money in a shares ISA growing at the rate above against spending it now and reinvesting each year's bill saving.</p>
          </div>
        </details>

        <details>
          <summary>Home energy use <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Annual gas use <span class="unit">kWh</span></label><input type="number" v-model.number="p.gasTotal"></div>
            <div class="field"><label>Share for space heating <span class="unit">%</span></label><input type="number" step="1" v-model.number="p.heatingPct"></div>
            <div class="field"><label>Share for hot water <span class="unit">%</span></label><input type="number" step="1" v-model.number="p.waterPct"></div>
            <div class="field"><label>Share for cooking <span class="unit">%</span></label><input type="number" step="1" v-model.number="p.cookingPct"></div>
            <div class="field"><label>Gas boiler efficiency <span class="unit">0–1</span></label><input type="number" step="0.01" v-model.number="p.boilerEff"></div>
            <div class="field"><label>Electricity baseload <span class="unit">kWh</span></label><input type="number" v-model.number="p.elecBaseload"></div>
          </div>
        </details>

        <details>
          <summary>Petrol car <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Annual mileage <span class="unit">mi</span></label><input type="number" v-model.number="p.mileage"></div>
            <div class="field"><label>Fuel economy <span class="unit">mpg</span></label><input type="number" v-model.number="p.mpg"></div>
            <div class="field"><label>Petrol price <span class="unit">£/L</span></label><input type="number" step="0.01" v-model.number="p.petrolPrice"></div>
            <div class="field"><label>Purchase price <span class="unit">£</span></label><input type="number" v-model.number="p.carPrice"></div>
            <div class="field"><label>Ownership period <span class="unit">yrs</span></label><input type="number" v-model.number="p.carLife"></div>
            <div class="field"><label>Resale value at end <span class="unit">£</span></label><input type="number" v-model.number="p.carResidual"></div>
            <div class="field"><label>Maintenance / tax <span class="unit">£/yr</span></label><input type="number" v-model.number="p.carMaint"></div>
          </div>
        </details>

        <details>
          <summary>Gas boiler <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Replacement cost <span class="unit">£</span></label><input type="number" v-model.number="p.boilerPrice"></div>
            <div class="field"><label>Lifespan <span class="unit">yrs</span></label><input type="number" v-model.number="p.boilerLife"></div>
            <div class="field"><label>Annual service <span class="unit">£/yr</span></label><input type="number" v-model.number="p.boilerService"></div>
            <div class="field"><label>Repairs allowance <span class="unit">£/yr</span></label><input type="number" v-model.number="p.boilerRepairs"></div>
          </div>
        </details>

        <details>
          <summary>Electric vehicle <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Efficiency <span class="unit">mi/kWh</span></label><input type="number" step="0.1" v-model.number="p.evEfficiency"></div>
            <div class="field"><label>Charge window start <span class="unit">h · 0.5 = 00:30</span></label><input type="number" step="0.5" min="0" max="23.5" v-model.number="p.evChargeStart"></div>
            <div class="field"><label>Charge window end <span class="unit">h</span></label><input type="number" step="0.5" min="0.5" max="24" v-model.number="p.evChargeEnd"></div>
            <div class="field"><label>Purchase price <span class="unit">£</span></label><input type="number" v-model.number="p.evPrice"></div>
            <div class="field"><label>Ownership period <span class="unit">yrs</span></label><input type="number" v-model.number="p.evLife"></div>
            <div class="field"><label>Resale value at end <span class="unit">£</span></label><input type="number" v-model.number="p.evResidual"></div>
            <div class="field"><label>Maintenance / tax <span class="unit">£/yr</span></label><input type="number" v-model.number="p.evMaint"></div>
            <div class="field"><label>Battery capacity <span class="unit">kWh</span></label><input type="number" v-model.number="p.evBatteryKwh"></div>
          </div>
        </details>

        <details>
          <summary>Heat pump <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Seasonal COP <span class="unit">SCOP</span></label><input type="number" step="0.1" v-model.number="p.scop"></div>
            <div class="field"><label>Install cost (gross) <span class="unit">£</span></label><input type="number" v-model.number="p.hpPrice"></div>
            <div class="field"><label>Grant (BUS) <span class="unit">£</span></label><input type="number" v-model.number="p.busGrant"></div>
            <div class="field"><label>Lifespan <span class="unit">yrs</span></label><input type="number" v-model.number="p.hpLife"></div>
            <div class="field"><label>Service + repairs <span class="unit">£/yr</span></label><input type="number" v-model.number="p.hpUpkeep"></div>
            <div class="field"><label>Induction-hob efficiency factor <span class="unit">×</span></label><input type="number" step="0.05" v-model.number="p.inductionEff"></div>
          </div>
        </details>

        <details>
          <summary>Solar PV <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>System size <span class="unit">kWp</span></label><input type="number" step="0.5" v-model.number="p.solarKwp"></div>
            <div class="field"><label>Yield <span class="unit">kWh/kWp/yr</span></label><input type="number" v-model.number="p.genPerKwp"></div>
            <div class="field"><label>Base install <span class="unit">£</span></label><input type="number" v-model.number="p.solarFixed"></div>
            <div class="field"><label>Marginal <span class="unit">£/kWp</span></label><input type="number" v-model.number="p.solarPerKwp"></div>
            <div class="field"><label>Install cost <span class="unit">£</span></label><input type="number" :value="Math.round(solarCapital)" disabled></div>
            <div class="field"><label>Lifespan <span class="unit">yrs</span></label><input type="number" v-model.number="p.solarLife"></div>
            <div class="field"><label>Upkeep (inverter etc.) <span class="unit">£/yr</span></label><input type="number" v-model.number="p.solarMaint"></div>
          </div>
        </details>

        <details>
          <summary>Battery <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Usable capacity <span class="unit">kWh</span></label><input type="number" step="0.5" v-model.number="p.batteryKwh"></div>
            <div class="field"><label>Max power <span class="unit">kW</span></label><input type="number" step="0.1" v-model.number="p.batteryMaxPowerKw"></div>
            <div class="field"><label>Round-trip efficiency <span class="unit">0–1</span></label><input type="number" step="0.01" v-model.number="p.batteryRoundTrip"></div>
            <div class="field"><label>Base install <span class="unit">£</span></label><input type="number" v-model.number="p.batteryFixed"></div>
            <div class="field"><label>Marginal <span class="unit">£/kWh</span></label><input type="number" v-model.number="p.batteryPerKwh"></div>
            <div class="field"><label>Install cost <span class="unit">£</span></label><input type="number" :value="Math.round(batteryCapital)" disabled></div>
            <div class="field"><label>Lifespan <span class="unit">yrs</span></label><input type="number" v-model.number="p.batteryLife"></div>
          </div>
        </details>

        <details>
          <summary>Advanced · solar matching <span class="chev">›</span></summary>
          <div class="fields">
            <label class="chk" style="padding:8px 0;"><input type="checkbox" v-model="useHHModel">15-minute simulation <span v-if="useHHModel && !modelReady" class="pill" style="margin-left:8px;">loading…</span><span v-else-if="useHHModel && usingSynthetic" class="pill" style="margin-left:8px;">demo data</span></label>

            <template v-if="useHHModel">
              <p style="font-size:11px;color:var(--faint);margin:6px 2px 0;">Dispatches solar, battery and EV charging across a real year of 15-minute data (from the solar-matching dataset). Self-consumption, import and export emerge from the timing rather than a fixed ratio. The EV charge window is set under <em>Electric vehicle</em>. The <b>Agile tariff</b> switch always uses this simulation, since it prices each interval against the dataset's half-hourly wholesale-linked rates. <em>Optimal battery dispatch</em> is set under <em>Build your home</em>, alongside the home battery.</p>
            </template>
            <template v-else>
              <div class="field"><label>Daytime share of demand <span class="unit">0–1</span></label><input type="number" step="0.05" v-model.number="p.daytimeFrac"></div>
              <div class="field"><label>Hour-by-hour match factor <span class="unit">0–1</span></label><input type="number" step="0.05" v-model.number="p.directMatch"></div>
              <div class="field"><label>Battery cycling utilisation <span class="unit">0–1</span></label><input type="number" step="0.05" v-model.number="p.batteryUtil"></div>
              <p style="font-size:11px;color:var(--faint);margin:6px 2px 0;">Simple annualised estimate: a fixed daytime-match plus battery shift, with no time-of-day detail. Useful as a rough comparison against the 15-minute simulation.</p>
            </template>
          </div>
        </details>

        <details>
          <summary>Carbon · operational factors <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Petrol (well-to-wheel) <span class="unit">kg/L</span></label><input type="number" step="0.05" v-model.number="p.petrolKgPerL"></div>
            <div class="field"><label>Gas combustion <span class="unit">kg/kWh</span></label><input type="number" step="0.001" v-model.number="p.gasCombustionKg"></div>
            <div class="field"><label>Gas upstream uplift <span class="unit">%</span></label><input type="number" step="1" v-model.number="p.gasUpstreamPct"></div>
            <template v-if="!current.hhCarbon">
              <div class="field"><label>Grid intensity (average) <span class="unit">g/kWh</span></label><input type="number" v-model.number="p.gridIntensity"></div>
              <div class="field"><label>Exported solar displaces <span class="unit">g/kWh</span></label><input type="number" v-model.number="p.marginalIntensity"></div>
            </template>
            <p v-else style="font-size:11px;color:var(--faint);margin:6px 2px 0;">
              Grid import and export carbon follow the national half-hourly intensity dataset — set under <em>Build your home · Grid carbon</em>.
            </p>
          </div>
        </details>

        <details>
          <summary>Carbon · embodied factors <span class="chev">›</span></summary>
          <div class="fields">
            <div class="field"><label>Car glider (ex-battery) <span class="unit">kgCO₂e</span></label><input type="number" v-model.number="p.gliderEmbodied"></div>
            <div class="field"><label>Battery cell <span class="unit">kg/kWh</span></label><input type="number" v-model.number="p.batteryCO2PerKwh"></div>
            <div class="field"><label>Vehicle carbon amortised over <span class="unit">yrs</span></label><input type="number" v-model.number="p.vehicleLifeCarbon"></div>
            <div class="field"><label>Gas boiler manufacture <span class="unit">kgCO₂e</span></label><input type="number" v-model.number="p.boilerEmbodied"></div>
            <div class="field"><label>Heat pump manufacture <span class="unit">kgCO₂e</span></label><input type="number" v-model.number="p.hpEmbodied"></div>
            <div class="field"><label>Solar lifecycle intensity <span class="unit">g/kWh</span></label><input type="number" v-model.number="p.solarLifecycleCO2"></div>
          </div>
        </details>
      </div>
    </div>

    <!-- RIGHT: results -->
    <div>
      <div class="card" v-if="!isCarbon">
        <div class="card-head"><h2>This build · the numbers</h2></div>
        <div class="stat-row">
          <div class="stat"><div class="k">{{ costModeLabel }} / yr</div><div class="v">{{ gbp(costOf(current)) }}</div><div class="s">{{ costModeSub }}</div></div>
          <div class="stat"><div class="k">vs status quo / yr</div><div class="v" :style="{color: saving>=0?'var(--good)':'var(--bad)'}">{{ saving>=0?'−':'+' }}{{ gbp(Math.abs(saving)) }}</div><div class="s">{{ costModeSub }}</div></div>
          <div class="stat"><div class="k">Extra upfront</div><div class="v">{{ gbp(extraUpfront) }}</div><div class="s">{{ likeForLike>0 ? 'above '+kgbp(likeForLike)+' '+likeForLikeLabel : 'all additional kit' }}</div></div>
        </div>

        <div class="stat-row" style="margin-top:10px;">
          <div class="stat"><div class="k">Simple payback</div><div class="v">{{ paybackLabel }}</div><div class="s">extra upfront ÷ bill saving</div></div>
          <div class="stat"><div class="k">IRR · real</div><div class="v" :style="{color: investIRR!==null && investIRR > p.isaReturn/100 ? 'var(--good)':''}">{{ irrLabel }}</div><div class="s">tax-free, over {{ p.investHorizon }} yrs</div></div>
          <div class="stat"><div class="k">Crossover vs ISA</div><div class="v">{{ crossoverLabel }}</div><div class="s">vs {{ p.isaReturn }}% shares ISA</div></div>
        </div>

        <table class="flows">
          <tr><td class="grp" colspan="2">Running costs</td></tr>
          <tr v-if="!cfg.ev"><td><span class="tag" style="background:var(--petrol)"></span>Petrol</td><td class="num">{{ gbp(current.petrol) }}</td></tr>
          <tr><td><span class="tag" style="background:var(--gas)"></span>Gas{{ cfg.hp && !cfg.disconnectGas ? ' (cooking only)' : '' }}</td><td class="num">{{ gbp(current.gas) }}</td></tr>
          <tr><td><span class="tag" style="background:var(--grid)"></span>Electricity import{{ cfg.agile ? ' ('+tariffLabel+')' : '' }}</td><td class="num">{{ gbp(current.importCost) }}</td></tr>
          <tr v-if="current.exportRevenue>0"><td class="sub"><span class="tag" style="background:var(--solar)"></span>{{ cfg.exportMode==='agile' ? 'Agile export credit' : 'Solar export credit' }}</td><td class="num credit">−{{ gbp(current.exportRevenue) }}</td></tr>
          <tr><td class="sub">Electricity standing charge</td><td class="num">{{ gbp(current.elecStandingCost) }}</td></tr>
          <tr class="tot"><td>Running subtotal</td><td class="num">{{ gbp(current.running) }}</td></tr>

          <tr><td class="grp" colspan="2">Annualised assets</td></tr>
          <tr><td><span class="tag" :style="{background: cfg.ev?'var(--ev)':'var(--petrol)'}"></span>{{ cfg.ev?'EV':'Petrol car' }}</td><td class="num">{{ gbp(current.carAsset) }}</td></tr>
          <tr><td><span class="tag" :style="{background: cfg.hp?'var(--hp)':'var(--gas)'}"></span>{{ cfg.hp?'Heat pump':'Gas boiler' }}</td><td class="num">{{ gbp(current.heatAsset) }}</td></tr>
          <tr v-if="cfg.solar"><td><span class="tag" style="background:var(--solar)"></span>Solar PV</td><td class="num">{{ gbp(current.solarAsset) }}</td></tr>
          <tr v-if="cfg.battery"><td><span class="tag" style="background:var(--battery)"></span>Battery</td><td class="num">{{ gbp(current.batteryAsset) }}</td></tr>
          <tr class="tot"><td>Assets subtotal</td><td class="num">{{ gbp(current.assets) }}</td></tr>

          <tr class="tot"><td>All-in total</td><td class="num">{{ gbp(current.allIn) }}</td></tr>
        </table>
      </div>

      <div class="card" v-if="isCarbon">
        <div class="card-head"><h2>This build · carbon</h2><span class="hint">kgCO₂e per year</span></div>
        <div class="stat-row">
          <div class="stat"><div class="k">CO₂e / yr</div><div class="v">{{ co2(current.totalCO2) }}</div><div class="s">operational + embodied</div></div>
          <div class="stat"><div class="k">vs status quo</div><div class="v" :style="{color: carbonSaving>=0?'var(--good)':'var(--bad)'}">{{ carbonSaving>=0?'−':'+' }}{{ co2(Math.abs(carbonSaving)) }}</div><div class="s">per year</div></div>
          <div class="stat"><div class="k">Carbon payback</div><div class="v">{{ carbonPayback===null ? 'never' : carbonPayback.toFixed(1) }}<span v-if="carbonPayback!==null" style="font-size:12px;color:var(--faint);"> yrs</span></div><div class="s">debt vs operational saving</div></div>
        </div>

        <table class="flows">
          <tr><td class="grp" colspan="2">Operational</td></tr>
          <tr v-if="!cfg.ev"><td><span class="tag" style="background:var(--petrol)"></span>Petrol</td><td class="num">{{ co2(current.petrolCO2) }}</td></tr>
          <tr><td><span class="tag" style="background:var(--gas)"></span>Gas{{ cfg.hp && !cfg.disconnectGas ? ' (cooking)' : '' }}</td><td class="num">{{ co2(current.gasCO2) }}</td></tr>
          <tr><td><span class="tag" style="background:var(--grid)"></span>Grid electricity</td><td class="num">{{ co2(current.gridCO2) }}</td></tr>
          <tr v-if="current.exportCO2Credit>0"><td class="sub"><span class="tag" style="background:var(--solar)"></span>Exported solar (displaces gas)</td><td class="num credit">−{{ co2(current.exportCO2Credit) }}</td></tr>
          <tr class="tot"><td>Operational subtotal</td><td class="num">{{ co2(current.opCO2) }}</td></tr>

          <tr><td class="grp" colspan="2">Embodied (annualised)</td></tr>
          <tr><td><span class="tag" :style="{background: cfg.ev?'var(--ev)':'var(--petrol)'}"></span>{{ cfg.ev?'EV (glider + battery)':'Petrol car' }}</td><td class="num">{{ co2(current.carCO2) }}</td></tr>
          <tr><td><span class="tag" :style="{background: cfg.hp?'var(--hp)':'var(--gas)'}"></span>{{ cfg.hp?'Heat pump':'Gas boiler' }}</td><td class="num">{{ co2(current.heatCO2) }}</td></tr>
          <tr v-if="cfg.solar"><td><span class="tag" style="background:var(--solar)"></span>Solar PV</td><td class="num">{{ co2(current.solarCO2) }}</td></tr>
          <tr v-if="cfg.battery"><td><span class="tag" style="background:var(--battery)"></span>Battery</td><td class="num">{{ co2(current.batteryCO2) }}</td></tr>
          <tr class="tot"><td>Embodied subtotal</td><td class="num">{{ co2(current.embCO2) }}</td></tr>

          <tr class="tot"><td>Total CO₂e</td><td class="num">{{ co2(current.totalCO2) }}</td></tr>
        </table>

        <div class="card-head" style="margin-top:20px;"><h2>Cost of carbon abated</h2><span class="hint">private vs societal</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
          <div class="stat">
            <div class="k">To the household</div>
            <div class="v" :style="{color: abatementCost===null ? 'var(--faint)' : (abatementCost<0?'var(--good)':'var(--text)')}">{{ abatementCost===null ? 'n/a' : (abatementCost<0?'−':'')+gbp(Math.abs(abatementCost)) }}<span v-if="abatementCost!==null" style="font-size:12px;color:var(--faint);">/t</span></div>
            <div class="s">{{ abatementCost===null ? 'no carbon cut' : (abatementCost<0 ? 'net of grant · paid to abate' : 'net of grant') }}</div>
          </div>
          <div class="stat">
            <div class="k">To society</div>
            <div class="v" :style="{color: societalAbatementCost===null ? 'var(--faint)' : (societalAbatementCost<0?'var(--good)':'var(--text)')}">{{ societalAbatementCost===null ? 'n/a' : (societalAbatementCost<0?'−':'')+gbp(Math.abs(societalAbatementCost)) }}<span v-if="societalAbatementCost!==null" style="font-size:12px;color:var(--faint);">/t</span></div>
            <div class="s">{{ grantAnnualised>0 ? 'grant counted as real cost' : 'same, no grant in this build' }}</div>
          </div>
        </div>
        <p v-if="grantAnnualised>0" style="font-size:11.5px;color:var(--muted);margin:12px 2px 2px;">
          The household figure is net of the {{ gbp(p.busGrant) }} BUS grant, so it can read as a saving: privately the homeowner may be paid to decarbonise. The societal figure adds the grant back, because it is a transfer from taxpayers, a real resource cost rather than a saving the measure creates, so the true cost of abatement to society is higher. For context, UK government appraisal currently values carbon at roughly £250/tCO₂e.
        </p>

        <p v-if="extraEmbodiedTotal>0" style="font-size:11.5px;color:var(--muted);margin:12px 2px 2px;">
          Switching adds about {{ co2(extraEmbodiedTotal) }} of one-off manufacturing carbon (the carbon debt).
          <template v-if="carbonPayback!==null">Lower running emissions repay it in <b>{{ carbonPayback.toFixed(1) }} years</b>, after which every year is a net saving.</template>
          <template v-else>Running emissions do not fall in this build, so that debt is never repaid.</template>
        </p>
      </div>

      <div class="card">
        <div class="card-head"><h2>Electricity flows</h2><span class="hint">the co-benefit engine</span></div>
        <table class="flows">
          <tr><td>Total electricity demand</td><td class="num">{{ kwh(current.demand) }}</td></tr>
          <tr class="sub"><td>Household baseload</td><td class="num">{{ kwh(p.elecBaseload) }}</td></tr>
          <tr class="sub" v-if="current.cookingElec>0"><td>Cooking (induction)</td><td class="num">{{ kwh(current.cookingElec) }}</td></tr>
          <tr class="sub" v-if="cfg.ev"><td>EV charging</td><td class="num">{{ kwh(current.evElec) }}</td></tr>
          <tr class="sub" v-if="cfg.hp"><td>Heat pump</td><td class="num">{{ kwh(current.hpElec) }}</td></tr>
          <tr v-if="cfg.solar"><td><span class="tag" style="background:var(--solar)"></span>Solar generated</td><td class="num">{{ kwh(current.solarGen) }}</td></tr>
          <tr v-if="cfg.solar"><td class="sub">Self-consumed ({{ current.selfPct }}%)</td><td class="num credit">{{ kwh(current.solarSelf) }}</td></tr>
          <tr v-if="cfg.solar"><td class="sub">Exported</td><td class="num">{{ kwh(current.solarExport) }}</td></tr>
          <tr class="tot"><td>Grid import</td><td class="num">{{ kwh(current.gridImport) }}</td></tr>
          <tr v-if="cfg.agile && current.avgAgileImport!=null"><td class="sub">Average {{ tariffLabel }} import price</td><td class="num">{{ current.avgAgileImport.toFixed(1) }} p/kWh</td></tr>
        </table>
        <div v-if="cfg.solar" class="bartrack" :title="'Self-consumed vs exported'">
          <div class="seg" :style="{flexGrow:current.solarSelf, background:'var(--battery)'}"></div>
          <div class="seg" :style="{flexGrow:Math.max(current.solarExport,0.001), background:'var(--solar)'}"></div>
        </div>
        <p v-if="cfg.solar" style="font-size:11.5px;color:var(--muted);margin:10px 2px 4px;">
          {{ current.selfPct }}% of your solar is used at home. Adding load (EV, heat pump) or a battery pushes this up, because every self-consumed kWh is worth the
          {{ current.avgAgileImport!=null ? current.avgAgileImport.toFixed(1) : Number(p.elecRate).toFixed(1) }}p {{ current.avgAgileImport!=null ? 'average ' : '' }}import rate you avoid, against only {{ current.avgAgileExport!=null ? current.avgAgileExport.toFixed(1) : Number(p.segRate).toFixed(1) }}p {{ current.avgAgileExport!=null ? 'average ' : '' }}if it is exported.
        </p>

        <template v-if="current.elecRates">
          <div class="subhead">Effective electricity rate by use</div>
          <table class="ucost">
            <tr>
              <th>Use</th><th class="n">kWh/yr</th>
              <th class="n">cash</th><th class="n">all-in</th>
            </tr>
            <tr v-for="row in elecCostRows" :key="row.key">
              <td><span class="tag" :style="{background:row.color}"></span>{{ row.label }}</td>
              <td class="n">{{ kwh(row.r.kwh) }}</td>
              <td class="n">{{ row.r.cashRate.toFixed(1) }}p</td>
              <td class="n lev">{{ row.r.levRate.toFixed(1) }}p</td>
            </tr>
          </table>
          <p style="font-size:11.5px;color:var(--muted);margin:9px 2px 2px;">
            What each use actually pays per kWh once solar and battery are mixed in. <b>Cash</b> prices home-generated power at what it gives up: self-used solar at the {{ current.elecRates.forgoneExport.toFixed(1) }}p export you forgo, battery at the {{ current.elecRates.batUnitCash.toFixed(1) }}p it cost to charge. <b>All-in</b> prices it at its own capital cost: solar at its {{ current.elecRates.solarLcoe.toFixed(1) }}p levelised cost, battery at {{ current.elecRates.batUnitLev.toFixed(1) }}p including the storage hardware. This is a diagnostic view only; the capital is already in the asset lines, so it is not added again to the all-in total.
          </p>
        </template>

        <div v-if="current.sparkGap" class="sparkgap">
          <h3>Heat pump vs gas: closing the spark gap</h3>
          <p>
            The heat pump's electricity effectively costs
            <b>{{ current.elecRates.hp.cashRate.toFixed(1) }}p</b><template v-if="hpRateSpread">–<b>{{ current.elecRates.hp.levRate.toFixed(1) }}p</b></template>/kWh
            (grid {{ Math.round(current.elecRates.hp.gridKwh/current.elecRates.hp.kwh*100) }}%<template v-if="current.elecRates.hp.solarKwh>1">, solar {{ Math.round(current.elecRates.hp.solarKwh/current.elecRates.hp.kwh*100) }}%</template><template v-if="current.elecRates.hp.batteryKwh>1">, battery {{ Math.round(current.elecRates.hp.batteryKwh/current.elecRates.hp.kwh*100) }}%</template>)<template v-if="!cfg.solar && !cfg.battery">, at the flat grid rate, before any solar or battery</template>.
          </p>
          <p>
            At SCOP {{ p.scop }} that is <b>{{ current.sparkGap.hpHeatCash.toFixed(1) }}p</b><template v-if="hpRateSpread">–<b>{{ current.sparkGap.hpHeatLev.toFixed(1) }}p</b></template> per kWh of <em>heat</em>, versus gas at <b>{{ current.sparkGap.gasHeat.toFixed(1) }}p</b>/kWh ({{ p.gasRate }}p ÷ {{ Math.round(p.boilerEff*100) }}% boiler).
          </p>
          <div class="sparkbar" :title="'Cost of useful heat: heat pump vs gas'">
            <div class="seg" :style="{flexGrow:current.sparkGap.hpHeatCash, background:'var(--hp)'}"></div>
            <div class="seg" :style="{flexGrow:Math.max(current.sparkGap.gasHeat-current.sparkGap.hpHeatCash,0.001), background:'var(--gas)'}"></div>
          </div>
          <p class="verdict">
            <template v-if="current.sparkGap.hpHeatLev < current.sparkGap.gasHeat">
              A unit of heat is <b>{{ Math.round((1-current.sparkGap.hpHeatLev/current.sparkGap.gasHeat)*100) }}–{{ Math.round((1-current.sparkGap.hpHeatCash/current.sparkGap.gasHeat)*100) }}% cheaper</b> from the heat pump than from gas.
              <template v-if="cfg.solar || cfg.battery"> Solar and battery widen that gap by cutting the heat pump's unit rate.</template>
            </template>
            <template v-else-if="current.sparkGap.hpHeatCash < current.sparkGap.gasHeat">
              Heat is cheaper from the heat pump on a cash basis, but once the solar and battery capital is priced in it is roughly level with gas. More solar or battery capacity, or a cheaper tariff, tips it further in the heat pump's favour.
            </template>
            <template v-else>
              At these rates a unit of heat costs more from the heat pump than from gas. A higher SCOP, a cheaper tariff (Agile), or self-supply from solar and battery would close the gap.
            </template>
          </p>
        </div>
      </div>

      <div class="foot">
        <p><b>How to read this.</b> Lumpy purchases (a car, a boiler) are spread over their life as an equivalent annual cost, using an annuity at a real {{ p.discountRate }}% discount rate (editable under <em>Assumptions · Discounting</em>; set it to 0 for plain straight-line spreading). This lets options compare like-for-like, and means cash spent today weighs more than costs and resale values years away. The fossil status quo already carries a car and a boiler you would replace anyway, so switching to an EV or heat pump swaps one asset cost for another rather than adding to it. ‘Extra upfront’ is the cash needed today beyond a like-for-like petrol car or boiler replacement.</p>
        <p style="margin-top:10px;"><b>The model.</b> A real year of 15-minute data is simulated interval by interval (<code>model.js</code>): solar, battery and EV charging are dispatched through the year, so self-consumption and the import / export split emerge from the timing rather than a fixed ratio. The <b>Agile tariff</b> switch re-costs the same dispatch against the dataset's half-hourly wholesale-linked prices; with it off, flat import and export rates apply. The EV charges within the window set under <em>Electric vehicle</em>; a simple annualised estimate is available under <em>Advanced · solar matching</em> for comparison. <span class="pill">v2 · 15-minute</span></p>
        <p style="margin-top:10px;"><b>Simplifications.</b> Insurance is treated as roughly neutral between petrol and EV. All prices include VAT: flat rates default to the price cap, and Agile import comes from the region-D dataset grossed up by 5%. Prices are a mid-2026 snapshot and unusually high.</p>
        <p style="margin-top:10px;"><b>Carbon basis.</b> Petrol ~2.9 kgCO₂e/L well-to-wheel; gas 0.183 kgCO₂e/kWh burned plus an upstream and methane uplift (default +20%, GWP100, and likely a floor rather than a ceiling). Grid electricity defaults to the measured national <em>half-hourly</em> carbon intensity dataset: each interval's import and export is valued at the grid intensity at that time, so overnight EV charging, battery arbitrage and midday solar export each carry their true carbon weight. Note this is an <em>average</em>-intensity basis on both sides — export is credited with the grid mix it displaces at that moment, not the marginal plant. Switching <em>Build your home · Grid carbon</em> to <em>Flat</em> uses two fixed factors instead: imports at ~75 gCO₂/kWh (a deliberately conservative forward average — 2024-25 actual is ~125, falling towards ~50 by 2030) and exported solar credited with the marginal gas (CCGT) generation it backs out, at ~400 gCO₂/kWh — a much larger export credit than the average basis gives. Expect both the price and the carbon value of export to fall as more solar joins the grid (daytime prices decline, curtailment rises). Both flat factors are editable under <em>Carbon · operational factors</em>. Embodied carbon follows the Hoekstra framing: the car glider is roughly equal for petrol and EV, the battery is the main difference (~75 kgCO₂e/kWh of cell), and ‘carbon payback’ is that one-off extra manufacturing carbon divided by the annual operational saving. <span class="pill">factors editable</span></p>
        <p style="margin-top:10px;"><b>Abatement cost.</b> The change in all-in annual cost divided by the tonnes of CO₂e cut per year (whole build vs status quo, or per step given the rest of the build). A <b>negative</b> figure means the measure cuts carbon <em>and</em> saves money, so the household is effectively paid to decarbonise. A positive figure is the cost per tonne avoided (for context, UK government appraisal values carbon at roughly £250/tCO₂e). The <b>household</b> figure is net of any grant; the <b>societal</b> figure adds the BUS grant back, since a grant is a transfer from taxpayers rather than a saving the measure creates. Steps that do not cut carbon show ‘n/a’.</p>
      </div>
    </div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.21/vue.global.prod.min.js"></script>
<script src="<?php echo $path; ?>model/model.js?v=7"></script>
<script src="<?php echo $path; ?>model/ledger.js?v=10"></script>
<script>
// Url prefix for this tool's own assets, so the javascript below can find the
// dataset without being templated by php.
const TOOL_PATH = '<?php echo $path; ?>';
</script>
<script src="<?php echo $path; ?>cobenefit_explorer.js?v=5"></script>
</body>
</html>
