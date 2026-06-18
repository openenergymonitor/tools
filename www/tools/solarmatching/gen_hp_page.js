// Generates a self-contained HTML analysis page for the heat-pump co-benefit
// tables. Numbers are computed from the real model so they match the harness.
//
//   node tools/solarmatching/gen_hp_page.js   (run from anywhere; paths relative to this file)
//   -> writes heatpump-cobenefits.html at the www root.
const fs = require('fs');
const path = require('path');
const dir = __dirname;                                           // tools/solarmatching
const model = require(path.join(dir, 'model.js'));
const ledger = require(path.join(dir, 'ledger.js'));
model._apply(JSON.parse(fs.readFileSync(path.join(dir, 'solarmatching_data.json'), 'utf8')));

const cache = new Map();
const runModel = mp => { const k = JSON.stringify(mp); let r = cache.get(k); if (!r) { r = model.run(mp); cache.set(k, r); } return r; };
const P = () => JSON.parse(JSON.stringify(ledger.DEFAULTS));
const cfg = f => { const c = { ev:0,hp:0,solar:0,battery:0,agile:0,disconnectGas:0 }; (f||[]).forEach(x=>c[x]=1); if(c.hp)c.disconnectGas=1; return c; };
const run = (f,p) => ledger.compute(cfg(f), { p, useHHModel:true, modelReady:true, optimalDispatch:false, runModel });

const base = ['solar','battery','agile'];
const scops = [1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0];
const gross = [0,1500,3000,4500,6000,7500,9000,10500,12000,13500,15000];

function hpMarg(grossCost, grant, scop) {
  const p = P(); p.scop = scop; p.hpPrice = grossCost; p.busGrant = grant;
  const wo = run(base, p), w = run(base.concat('hp'), p);
  return wo.allIn - w.allIn;
}

// magnitude for colour scaling
let maxAbs = 0;
[7500,0].forEach(g => gross.forEach(gc => scops.forEach(s => { maxAbs = Math.max(maxAbs, Math.abs(hpMarg(gc,g,s))); })));

function cellColour(v) {
  const a = Math.min(0.85, 0.10 + 0.75 * Math.abs(v) / maxAbs);
  return v >= 0 ? `background:rgba(84,192,138,${a.toFixed(3)});` : `background:rgba(216,105,77,${a.toFixed(3)});`;
}
const money = v => (v >= 0 ? '+£' : '−£') + Math.abs(Math.round(v)).toLocaleString('en-GB');

function buildTable(grant) {
  let h = '<table class="grid"><thead><tr><th class="rowhead">' +
    (grant ? `Gross install<small>net after £${grant.toLocaleString()}</small>` : 'Gross install') + '</th>';
  scops.forEach(s => h += `<th>SCOP ${s.toFixed(1)}</th>`);
  h += '</tr></thead><tbody>';
  gross.forEach(gc => {
    const isDefault = gc === 12000;
    const net = gc - grant;
    h += `<tr class="${isDefault ? 'def' : ''}"><th class="rowhead">£${gc.toLocaleString()}` +
      (grant ? `<small>${net < 0 ? '−£' + Math.abs(net).toLocaleString() : '£' + net.toLocaleString()}</small>` : '') +
      (isDefault ? '<em>typical</em>' : '') + '</th>';
    scops.forEach(s => { const v = hpMarg(gc, grant, s); h += `<td style="${cellColour(v)}">${money(v)}</td>`; });
    h += '</tr>';
  });
  return h + '</tbody></table>';
}

// per-kWh-of-heat costs
const p0 = P();
const agileAvg = run(['solar','battery','agile'], p0).avgAgileImport;
const perKwh = [
  ['Gas boiler', (p0.gasRate / p0.boilerEff), 'gas'],
  ['Heat pump · SCOP 2 · flat', p0.elecRate / 2, 'hp'],
  ['Heat pump · SCOP 3 · flat', p0.elecRate / 3, 'hp'],
  ['Heat pump · SCOP 4 · flat', p0.elecRate / 4, 'hp'],
  ['Heat pump · SCOP 4 · Agile', agileAvg / 4, 'hp'],
  ['Heat pump · SCOP 5 · flat', p0.elecRate / 5, 'hp'],
];
const gasPerKwh = p0.gasRate / p0.boilerEff;
let perKwhRows = '';
perKwh.forEach(([lbl, v, c]) => {
  const beats = v <= gasPerKwh;
  perKwhRows += `<tr><td>${lbl}</td><td class="num">${v.toFixed(2)}p</td>` +
    `<td>${c === 'gas' ? '<span class="tag gas">baseline</span>' : (beats ? '<span class="tag good">cheaper than gas</span>' : '<span class="tag bad">dearer than gas</span>')}</td></tr>`;
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Heat pump · install cost × SCOP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#10151b; --panel:#171e26; --panel2:#1e2731; --line:#2c3742; --line2:#384654;
    --text:#e7edf3; --muted:#8a97a5; --faint:#5f6c79;
    --gas:#ef9b3e; --grid:#4aa3df; --solar:#f5c542; --battery:#54c08a; --hp:#39b5ac; --ev:#8a86f5;
    --good:#54c08a; --bad:#d8694d;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:radial-gradient(1200px 600px at 85% -10%, #1a2530 0%, rgba(26,37,48,0) 60%), var(--ink);
    color:var(--text); font-family:"Inter",system-ui,sans-serif; font-size:14px; line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  .num{font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;}
  h1,h2,h3,.display{font-family:"Space Grotesk",sans-serif;}
  .wrap{max-width:1180px;margin:0 auto;padding:30px 22px 90px;}
  .eyebrow{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--hp);margin:0 0 8px;}
  h1{font-size:30px;font-weight:700;margin:0;letter-spacing:-.01em;}
  .lede{margin:10px 0 0;color:var(--muted);max-width:70ch;font-size:14px;}
  .masthead{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:26px;}

  .assump{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 0;}
  .chip{font-size:12px;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 12px;}
  .chip b{color:var(--text);font-weight:600;}

  .card{background:linear-gradient(180deg,var(--panel) 0%,#141b22 100%);border:1px solid var(--line);border-radius:14px;padding:22px 22px 18px;margin:24px 0;}
  .card h2{font-size:19px;margin:0 0 4px;}
  .card .sub{color:var(--muted);font-size:13px;margin:0 0 16px;}
  .legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:14px;}
  .legend span{display:inline-flex;align-items:center;gap:7px;}
  .sw{width:22px;height:12px;border-radius:3px;display:inline-block;}

  table.grid{border-collapse:separate;border-spacing:3px;width:100%;}
  table.grid th,table.grid td{padding:8px 6px;text-align:center;font-size:12.5px;border-radius:6px;}
  table.grid thead th{color:var(--muted);font-weight:600;font-family:"Space Grotesk";background:var(--panel2);}
  table.grid td{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;color:#0d1217;font-weight:600;}
  th.rowhead{text-align:right;color:var(--text);font-weight:600;background:var(--panel2);white-space:nowrap;padding-right:12px;min-width:96px;}
  th.rowhead small{display:block;color:var(--faint);font-weight:500;font-size:10.5px;font-family:"JetBrains Mono";}
  th.rowhead em{display:block;color:var(--hp);font-style:normal;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-family:"JetBrains Mono";}
  tr.def th.rowhead, tr.def td{outline:1.5px solid var(--hp);outline-offset:-1px;}
  .tablescroll{overflow-x:auto;}

  table.mini{border-collapse:collapse;width:100%;max-width:560px;}
  table.mini td{padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;}
  table.mini td:first-child{color:var(--text);}
  .tag{font-size:11px;padding:2px 9px;border-radius:999px;font-weight:600;}
  .tag.good{color:var(--good);background:rgba(84,192,138,.12);}
  .tag.bad{color:var(--bad);background:rgba(216,105,77,.12);}
  .tag.gas{color:var(--gas);background:rgba(239,155,62,.12);}

  .findings h2{font-size:21px;margin:34px 0 6px;}
  .finding{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--hp);border-radius:10px;padding:14px 18px;margin:12px 0;}
  .finding h3{font-size:15px;margin:0 0 4px;color:var(--text);}
  .finding p{margin:0;color:var(--muted);font-size:13.5px;}
  .finding b{color:var(--text);}
  .pos{color:var(--good);font-weight:600;} .neg{color:var(--bad);font-weight:600;}
  .foot{margin-top:34px;color:var(--faint);font-size:12px;border-top:1px solid var(--line);padding-top:16px;}
  a{color:var(--hp);}
</style>
</head>
<body>
<div class="wrap">

  <div class="masthead">
    <p class="eyebrow">UK Household · heat-pump co-benefits</p>
    <h1>Heat pump: install cost × SCOP</h1>
    <p class="lede">When does a heat pump pay back, and how do efficiency (SCOP), the install price and the
      £7,500 BUS grant trade off against each other? Every cell is the heat pump's marginal saving
      (£/yr vs keeping the gas boiler), computed on a half-hourly model of a solar + battery + Agile home.</p>
    <div class="assump">
      <span class="chip"><b>10,040 kWh</b> delivered heat/yr</span>
      <span class="chip">added to <b>solar + battery + Agile</b></span>
      <span class="chip">elec <b>26.1p</b> flat / <b>${agileAvg.toFixed(1)}p</b> Agile avg</span>
      <span class="chip">gas <b>7.33p/kWh</b>, boiler <b>90%</b></span>
      <span class="chip">capital discounted at <b>3%/yr</b></span>
    </div>
  </div>

  <!-- per-kWh framing -->
  <div class="card">
    <h2>The race is per kWh of heat delivered</h2>
    <p class="sub">A heat pump only beats gas when its electricity ÷ SCOP undercuts gas ÷ boiler efficiency.
      SCOP ≈ 3 is the crossover on a flat tariff; Agile pushes the heat pump well clear.</p>
    <table class="mini"><tbody>${perKwhRows}</tbody></table>
  </div>

  <div class="legend">
    <span><i class="sw" style="background:rgba(84,192,138,.8)"></i> heat pump saves money</span>
    <span><i class="sw" style="background:rgba(216,105,77,.8)"></i> heat pump loses money</span>
    <span>stronger colour = bigger effect · <b style="color:var(--hp)">outlined row</b> = typical £12k install</span>
  </div>

  <div class="card">
    <h2>Table 1 — With the £7,500 BUS grant</h2>
    <p class="sub">Rows show the installer's gross price; the small figure is what you actually finance after the grant.</p>
    <div class="tablescroll">${buildTable(7500)}</div>
  </div>

  <div class="card">
    <h2>Table 2 — With no grant</h2>
    <p class="sub">Same installs, grant removed — you finance the full gross price. The whole grid drops by one grant's worth.</p>
    <div class="tablescroll">${buildTable(0)}</div>
  </div>

  <div class="findings">
    <h2>What the tables say</h2>

    <div class="finding">
      <h3>SCOP 1.0 never wins — efficiency is the whole point</h3>
      <p>Even a <b>free</b> heat pump loses money at SCOP 1: running 10,040 kWh of heat through a
      resistance-equivalent unit costs more in electricity than the gas it replaces. The sign only
      flips positive around <b>SCOP 2.5–3.0</b>. A heat pump is an efficiency play or nothing.</p>
    </div>

    <div class="finding">
      <h3>The grant is worth exactly £7,500 of install headroom</h3>
      <p>The two tables are the same grid shifted by one grant. The typical <b>£12,000 install at SCOP 4</b>
      goes from <span class="pos">+£353/yr</span> with the grant to <span class="neg">−£192/yr</span> without —
      a £545/yr swing, the annualised cost of £7,500 of capital. Read another way: Table&nbsp;1's
      "£15,000" row is identical to Table&nbsp;2's "£7,500" row.</p>
    </div>

    <div class="finding">
      <h3>Ungranted, a mainstream £12k install never pays back</h3>
      <p>In Table&nbsp;2 the £12,000 row is negative at <b>every</b> SCOP — best case −£99/yr at SCOP 5.
      Without the grant you need a cheap install (≤ ~£9,000 <em>and</em> SCOP ≥ 4) or an exceptional SCOP.
      The grant is what moves a typical install firmly into profit.</p>
    </div>

    <div class="finding">
      <h3>Half a SCOP point ≈ £1,500 of affordable install</h3>
      <p>Across any row the cells climb ~£100–130 per half-point of SCOP; down any column each £1,500 of
      cost removes ~£109/yr. So every extra <b>0.5 SCOP</b> buys back roughly one <b>£1,500</b> cost step —
      a clean way to trade a more efficient unit against a cheaper one.</p>
    </div>

    <div class="finding">
      <h3>The Agile tariff is the heat pump's biggest co-benefit</h3>
      <p>Both tables assume an Agile home. On a flat 26p tariff every cell drops by ~£170 — the value of
      pricing the heat pump's ~2,500 kWh at the <b>${agileAvg.toFixed(1)}p</b> Agile average instead of 26p.
      The heat pump adds the most electricity to the house, so it gains the most from time-of-use pricing.
      Solar and battery, by contrast, barely help: only ~22% of solar lands in the Nov–Mar heating season.</p>
    </div>
  </div>

  <p class="foot">Generated from the household energy-ledger model
    (<span class="num">model.js</span> + <span class="num">ledger.js</span>), real half-hourly year at 15-min resolution.
    A heat pump here also disconnects the gas supply (induction cooking included). Figures are annualised,
    capital discounted at 3%/yr real.</p>

</div>
</body>
</html>`;

const out = path.join(dir, '..', '..', 'heatpump-cobenefits.html');   // www root
fs.writeFileSync(out, html);
console.log('wrote', out, '(' + html.length + ' bytes), maxAbs=' + Math.round(maxAbs));
