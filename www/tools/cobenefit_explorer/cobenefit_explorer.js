// cobenefit_explorer/cobenefit_explorer.js
//
// The browser-side Vue app for the co-benefit explorer. The markup it mounts
// onto lives in cobenefit_explorer.php, the styling in cobenefit_explorer.css,
// and the simulation itself in model/ (model.js + ledger.js), which the Node
// harness in model/harness.js drives with the same code.
//
// TOOL_PATH is set by a small inline script in the php, and is the url prefix
// for this tool's own files.

const { createApp } = Vue;

// Cache of half-hourly model runs, keyed on the model-relevant parameters.
// compute() is evaluated for several scenarios per render (current, status quo
// and each marginal flip), so identical parameter sets are reused rather than
// re-simulated. Lives outside the reactive system; cleared on reset.
const modelCache = new Map();

// Ledger logic (DEFAULTS, ann, flowsHH, compute) lives in the shared
// model/ledger.js so the Node test harness runs the exact same
// code. See the methods below — they're thin wrappers over ledger.*.
const DEFAULTS = ledger.DEFAULTS;
const LITRES_PER_GALLON = ledger.LITRES_PER_GALLON;

createApp({
  data(){
    return {
      p: JSON.parse(JSON.stringify(DEFAULTS)),
      // agile = a time-varying half-hourly import tariff is active; tariffMode selects
      // its source ('agile' = wholesale dataset, 'custom' = user schedule). exportMode
      // is the independent export source: 'flat' SEG, 'agile' Outgoing, or 'schedule'
      // (the custom band table's export column).
      cfg: { ev:false, hp:false, solar:false, battery:false, agile:false, tariffMode:'agile', exportMode:'flat', disconnectGas:false },
      // solar-matching engine: half-hourly simulation (model.js) by default,
      // with the simple annual estimate available for comparison.
      useHHModel: true,
      costMode: 'allin',           // how every metric is expressed: 'allin' = running + annualised assets; 'running' = running costs only; 'carbon' = CO₂e
      optimalDispatch: false,   // battery: cost-optimised Agile dispatch (model.js DP)
      modelReady: false,
      usingSynthetic: false,
      konaChoice: 'petrol-used',
      konaPresets: {
        'petrol-new':  { ev:false, carPrice:27000, mpg:48, carResidual:4000, carLife:12, carMaint:650 },
        'petrol-used': { ev:false, carPrice:12500, mpg:48, carResidual:1500, carLife:10, carMaint:750 },
        'ev-new':      { ev:true,  evPrice:33500, evEfficiency:3.7, evResidual:6000, evLife:12, evMaint:300 },
        'ev-used':     { ev:true,  evPrice:13500, evEfficiency:4.0, evResidual:2000, evLife:10, evMaint:300 },
      },
      legend:[
        {label:'Petrol', color:'var(--petrol)'},
        {label:'Gas', color:'var(--gas)'},
        {label:'Grid electricity', color:'var(--grid)'},
        {label:'Solar PV', color:'var(--solar)'},
        {label:'Battery', color:'var(--battery)'},
        {label:'Heat pump', color:'var(--hp)'},
        {label:'EV', color:'var(--ev)'},
      ],
    };
  },
  watch:{
    // Time-varying tariffs are inherently half-hourly, so they're only offered while
    // the half-hourly model is on. Switching to the annual estimate forces flat both sides.
    useHHModel(on){ if(!on){ this.cfg.agile = false; this.cfg.exportMode = 'flat'; } },
    // Optimal dispatch pays off only when a price varies over the day, so default it
    // on whenever any non-flat import or export is selected (and off when fully flat).
    // The user can still override afterwards — this only fires on the transition.
    timeVaryingPricing(on){ this.optimalDispatch = on; },
    // Disconnecting gas only makes sense once heating is electrified, so default
    // to a full disconnect when the heat pump goes on (the user can still keep
    // gas for cooking by unticking it), and clear it when the heat pump goes off.
    'cfg.hp'(on){ this.cfg.disconnectGas = on; },
  },
  computed:{
    current(){ return this.compute(this.cfg); },
    // Three-way IMPORT selector backing the segmented control. 'flat' clears the
    // time-varying import; 'agile'/'custom' turn it on and pick the source. Switching
    // import keeps a still-valid export choice, else snaps export to a sensible default.
    tariffSel:{
      get(){ return this.cfg.agile ? this.cfg.tariffMode : 'flat'; },
      set(v){
        if(v==='flat'){ this.cfg.agile = false; if(this.cfg.exportMode==='schedule') this.cfg.exportMode='flat'; }
        else { this.cfg.agile = true; this.cfg.tariffMode = v;
          if(v==='custom'){ if(this.cfg.exportMode==='flat') this.cfg.exportMode='schedule'; }
          else { if(this.cfg.exportMode==='schedule') this.cfg.exportMode='agile';
            // Agile import carries its own standing charge
            const ag = ledger.TARIFF_PRESETS.agile; if(ag && ag.standing!=null) this.p.elecStanding = ag.standing;
          }
        }
      },
    },
    // Export selector backing its segmented control: 'flat' SEG, 'agile' Outgoing,
    // or (custom import only) 'schedule' = the band table's export column.
    exportSel:{
      get(){ return this.cfg.exportMode; },
      set(v){ this.cfg.exportMode = v; },
    },
    // Any time-varying pricing on either side — used to default optimal dispatch on.
    timeVaryingPricing(){ return this.cfg.agile || this.cfg.exportMode !== 'flat'; },
    // Display name for the active time-varying import tariff ('Agile' / 'Custom').
    tariffLabel(){ return this.cfg.tariffMode === 'custom' ? 'Custom' : 'Agile'; },
    // Schedule presets (Go / Cosy / Flux) offered as one-click buttons in the editor
    // — only entries that carry a schedule (the Agile entry holds a standing charge only).
    tariffPresets(){
      const all = ledger.TARIFF_PRESETS, out = {};
      for(const k in all) if(all[k].schedule) out[k] = all[k];
      return out;
    },
    // Per-use electricity rows for the "effective rate by use" table. Order puts
    // the heat pump last (the focus of the spark-gap story below it).
    elecCostRows(){
      const e = this.current.elecRates; if(!e) return [];
      const rows = [];
      if(e.baseload) rows.push({key:'baseload', label:'Baseload (home)', color:'var(--grid)', r:e.baseload});
      if(e.cooking)  rows.push({key:'cooking',  label:'Cooking (induction)', color:'var(--grid)', r:e.cooking});
      if(e.ev)       rows.push({key:'ev',       label:'EV charging', color:'var(--ev)', r:e.ev});
      if(e.hp)       rows.push({key:'hp',       label:'Heat pump', color:'var(--hp)', r:e.hp});
      return rows;
    },
    // Whether the cash and all-in heat-pump rates differ enough to show a range.
    hpRateSpread(){
      const hp = this.current.elecRates && this.current.elecRates.hp;
      return hp && Math.abs(hp.levRate - hp.cashRate) > 0.2;
    },
    statusQuo(){ return this.compute({ev:false,hp:false,solar:false,battery:false,agile:false,tariffMode:'agile',exportMode:'flat',disconnectGas:false}); },
    saving(){ return this.costOf(this.statusQuo) - this.costOf(this.current); },
    // shared linear scale for the cost bars: status quo (usually the largest)
    // anchors the positive side, so the build bar shrinks as savings are made.
    // costNegMax captures any build that nets out below zero (a net earner —
    // export revenue beats running + assets), drawn as a credit left of zero.
    costPosMax(){ return Math.max(this.costOf(this.statusQuo), this.costOf(this.current), 1); },
    costNegMax(){ return Math.max(0, -this.costOf(this.statusQuo), -this.costOf(this.current)); },
    // headline wording that tracks the active cost mode
    costModeLabel(){ return this.costMode === 'running' ? 'Running' : 'All-in'; },
    costModeSub(){ return this.costMode === 'running' ? 'running only' : 'running + assets'; },
    isCarbon(){ return this.costMode === 'carbon'; },
    buildName(){
      const on=[];
      if(this.cfg.ev)on.push('EV'); if(this.cfg.hp)on.push('heat pump');
      if(this.cfg.solar)on.push('solar'); if(this.cfg.battery)on.push('battery');
      return on.length? on.join(' + ') : 'nothing switched on yet';
    },
    extraUpfront(){
      // cash today for new kit beyond a like-for-like petrol-car / boiler
      // replacement (shared with the harness via ledger.extraUpfront)
      return ledger.extraUpfront(this.p, this.cfg);
    },
    likeForLike(){
      // the petrol-car / boiler spend that's netted out of "extra upfront" — the
      // cash you'd have laid out anyway on a like-for-like replacement
      let x=0;
      if(this.cfg.ev) x += this.p.carPrice;
      if(this.cfg.hp) x += this.p.boilerPrice;
      return x;
    },
    likeForLikeLabel(){
      // names the kit being netted out, matching likeForLike's components — the
      // petrol car carries its new/used qualifier from the selected Kona preset
      const parts=[];
      if(this.cfg.ev){
        const q = this.konaChoice.includes('used') ? 'used ' : (this.konaChoice.includes('new') ? 'new ' : '');
        parts.push(q+'petrol car');
      }
      if(this.cfg.hp) parts.push('new boiler');
      return parts.join(' + ');
    },
    // gross install cost, scaled with system size (fixed + marginal per unit)
    solarCapital(){ return ledger.solarCapital(this.p); },
    batteryCapital(){ return ledger.batteryCapital(this.p); },

    // ---- investment metrics (whole build vs status quo) ----------------------
    // Treats the extra upfront capital as the investment and the drop in running
    // costs as the annual return. Maintenance and asset-replacement differences
    // are deliberately left out (they're carried by the all-in annualised view);
    // this is the simple homeowner-style framing explored in solar-finance.js.
    cashSaving(){ return this.statusQuo.running - this.current.running; },   // recurring £/yr bill reduction
    investIRR(){
      // real annual return of the extra capital, savings accruing over the horizon
      if(this.extraUpfront <= 0 || this.cashSaving <= 0) return null;
      return this.irr(this.extraUpfront, this.cashSaving, this.p.investHorizon);
    },
    paybackLabel(){
      if(this.cashSaving <= 0) return '—';                       // never recovers
      if(this.extraUpfront <= 0) return 'immediate';             // no extra to recover
      return (this.extraUpfront / this.cashSaving).toFixed(1) + ' yrs';
    },
    irrLabel(){
      if(this.investIRR === null) return '—';
      return this.investIRR >= 1 ? '>100%' : (this.investIRR * 100).toFixed(1) + '%';
    },
    crossoverLabel(){
      // years until reinvested bill savings overtake the same money left in an ISA
      if(this.extraUpfront <= 0 || this.cashSaving <= 0) return '—';
      const y = this.crossoverYear(this.cashSaving, this.extraUpfront, this.p.isaReturn/100, this.p.investHorizon);
      return y === null ? ('> ' + this.p.investHorizon + ' yrs') : ('year ' + y);
    },
    carbonSaving(){ return this.statusQuo.totalCO2 - this.current.totalCO2; },
    // shared linear scale for the carbon bars (mirrors costPosMax/costNegMax);
    // a build can be a net carbon sink (export credit beats operational +
    // embodied), so carbonNegMax draws that as a credit left of zero.
    carbonPosMax(){ return Math.max(this.statusQuo.totalCO2, this.current.totalCO2, 1); },
    carbonNegMax(){ return Math.max(0, -this.statusQuo.totalCO2, -this.current.totalCO2); },
    extraEmbodiedTotal(){
      // one-time extra manufacturing carbon (the "carbon debt") vs like-for-like replacement
      const p=this.p; let x=0;
      if(this.cfg.ev) x += p.evBatteryKwh * p.batteryCO2PerKwh;                       // EV's extra = its battery
      if(this.cfg.hp) x += p.hpEmbodied - p.boilerEmbodied;                           // HP minus the boiler anyway
      if(this.cfg.solar) x += p.solarLifecycleCO2 * (p.solarKwp*p.genPerKwp) * p.solarLife / 1000;
      if(this.cfg.battery) x += p.batteryKwh * p.batteryCO2PerKwh;
      return x;
    },
    carbonPayback(){
      const annualOpSaving = this.statusQuo.opCO2 - this.current.opCO2;
      if(annualOpSaving <= 0) return null;
      return this.extraEmbodiedTotal / annualOpSaving;
    },
    abatementCost(){
      // £ per tonne CO2e abated by the whole build vs the fossil status quo:
      // all-in annual cost change ÷ annual carbon abated. Negative = the build
      // cuts carbon AND saves money (you're paid to decarbonise). null = it
      // doesn't abate carbon, so £/tonne is undefined.
      const tonnes = this.carbonSaving / 1000;
      if(tonnes <= 0.0005) return null;
      // always on the all-in basis (matches the "How to read" note), independent
      // of the headline cost-mode toggle
      const allInSaving = this.statusQuo.allIn - this.current.allIn;
      return -allInSaving / tonnes;   // -saving = extra annual cost over status quo
    },
    grantAnnualised(){
      // public subsidy in the build, annualised exactly as the net-of-grant capital
      // is, so it precisely reverses the grant netted out of the heat-pump asset.
      // Only the BUS heat-pump grant exists in this model.
      return this.cfg.hp ? this.ann(this.p.busGrant, 0, this.p.hpLife) : 0;
    },
    societalAbatementCost(){
      // £ per tonne abated from society's view: add the grant back as a real
      // resource cost (it's a transfer from taxpayers, not a saving the measure
      // created), then divide by the same annual tonnes abated.
      const tonnes = this.carbonSaving / 1000;
      if(tonnes <= 0.0005) return null;
      const allInSaving = this.statusQuo.allIn - this.current.allIn - this.grantAnnualised;
      return -allInSaving / tonnes;
    },
  },
  methods:{
    // The headline £ figure for a build under the active cost mode: the full
    // all-in cost (running + annualised assets) or running costs only.
    costOf(b){ return this.costMode === 'running' ? b.running : b.allIn; },
    // Fraction of the bar track where the zero baseline sits. 0 (far left) when
    // nothing nets negative; shifts right to make room for credit bars.
    zeroFrac(posMax, negMax){ const span = posMax + negMax; return span > 0 ? negMax / span : 0; },
    // Position+width for a bar drawn on a signed [−negMax, +posMax] scale around
    // a zero origin: positive values grow right of zero, a negative total grows
    // left of zero as a credit (which is why the old width-only formula collapsed
    // to an empty bar once a build netted below zero).
    barFill(value, posMax, negMax){
      const span = (posMax + negMax) || 1;
      const zero = (negMax / span) * 100;
      if(value >= 0) return { left: zero + '%', width: (value / span * 100) + '%' };
      const w = -value / span * 100;
      return { left: (zero - w) + '%', width: w + '%' };
    },
    // Bar segments to draw under the active mode — drop the asset segments when
    // showing running costs only so the stacked bar still sums to the figure.
    costSegments(b){
      if(this.costMode !== 'running') return b.segments;
      const runKeys = { petrol:1, gas:1, elec:1 };
      return b.segments.filter(s => runKeys[s.key]);
    },
    gbp(n){ return '£'+Math.round(n).toLocaleString('en-GB'); },
    kgbp(n){ return n>=1000 ? '£'+(n/1000).toFixed(1).replace(/\.0$/,'')+'k' : '£'+Math.round(n); },
    kwh(n){ return Math.round(n).toLocaleString('en-GB')+' kWh'; },
    co2(n){ return Math.round(n).toLocaleString('en-GB')+' kg'; },
    // Equivalent annual cost of a lumpy capital sum, spread over its life.
    // With a discount rate it uses the capital-recovery (annuity) factor so
    // money spent today weighs more than money spent years out, and discounts
    // the end-of-life resale value back to today. At rate 0 this collapses to
    // plain straight-line spreading: (price − residual) / life.
    ann(price,residual,life){ return ledger.ann(this.p, price, residual, life); },

    // ---- investment-metric maths (shared via ledger.js — no drift) -----------
    // Pure NPV / IRR / ISA-crossover maths now lives in ledger.js so the page and
    // the Node harness compute these identically. These are thin delegators.
    npv(rate, upfront, yearly, years){ return ledger.npv(rate, upfront, yearly, years); },
    irr(upfront, yearly, years){ return ledger.irr(upfront, yearly, years); },
    isaLumpSum(principal, rate, years){ return ledger.isaLumpSum(principal, rate, years); },
    reinvestedSavings(yearly, rate, years){ return ledger.reinvestedSavings(yearly, rate, years); },
    crossoverYear(yearly, principal, rate, maxYears){ return ledger.crossoverYear(yearly, principal, rate, maxYears); },

    // Map the ledger's build + assumptions onto model.js parameters and run the
    // half-hourly simulation, returning the annual solar / import / export flows.
    // Results are memoised on the model-relevant parameters (see modelCache).
    // Context handed to ledger.compute so it can run the half-hourly model and
    // read the live build flags without reaching into the Vue instance directly.
    ledgerCtx(){
      return {
        p: this.p,
        useHHModel: this.useHHModel,
        modelReady: this.modelReady,
        optimalDispatch: this.optimalDispatch,
        runModel: this.runModel,
      };
    },
    runModel(mp){
      const key = JSON.stringify(mp);
      let r = modelCache.get(key);
      if(!r){
        if(modelCache.size > 500) modelCache.clear();
        r = model.run(mp);
        modelCache.set(key, r);
      }
      return r;
    },

    flipCfg(tech){
      // build the config that flipping `tech` would produce, mirroring the watchers:
      // disconnecting gas is coupled to the heat pump, so flipping hp flips it too.
      const flipped = Object.assign({}, this.cfg);
      flipped[tech] = !flipped[tech];
      if(tech === 'hp') flipped.disconnectGas = flipped.hp;
      return flipped;
    },

    marginalSavings(tech){
      // Signed savings (+ve = cheaper) from flipping this technology, given the
      // rest of the current build, split into running-cost and annualised-capital
      // components plus the net all-in result (net = run + asset, since
      // allIn = running + assets). dir flips the sense for add vs remove.
      const flipped = this.flipCfg(tech);
      const here = this.current;                // reuse the cached current build
      const there = this.compute(flipped);
      const dir = this.cfg[tech] ? 1 : -1;      // on: cost if removed; off: cost if added
      return {
        run:   dir * (there.running - here.running),
        asset: dir * (there.assets  - here.assets),
        net:   dir * (there.allIn   - here.allIn),
      };
    },

    fmtSaving(v){
      // saving shown with a leading '−' (cost goes down) to match the headline
      // convention; '+' means the step adds cost
      return (v >= 0 ? '−' : '+') + this.gbp(Math.abs(v));
    },

    marginalLabel(tech){
      // effect on cost of flipping this technology — all-in by default, or
      // running-cost only when the cost mode is set to running
      const s = this.marginalSavings(tech);
      return this.fmtSaving(this.costMode === 'running' ? s.run : s.net);
    },

    marginalCarbon(tech){
      // Signed carbon cut (+ve = less CO₂e) from flipping this technology, split
      // into operational and embodied components plus the net total — the carbon
      // counterpart of marginalSavings.
      const flipped = this.flipCfg(tech);
      const here = this.current;
      const there = this.compute(flipped);
      const dir = this.cfg[tech] ? 1 : -1;
      return {
        op:  dir * (there.opCO2    - here.opCO2),
        emb: dir * (there.embCO2   - here.embCO2),
        net: dir * (there.totalCO2 - here.totalCO2),
      };
    },

    // display name + carrier colour for a technology, used in the step tooltip
    techLabel(tech){ if(tech==='agile') return (this.cfg.tariffMode==='custom'?'Custom':'Agile')+' tariff'; return {ev:'Electric vehicle', hp:'Heat pump', solar:'Solar PV', battery:'Home battery'}[tech] || tech; },
    techColor(tech){ return {ev:'--ev', hp:'--hp', solar:'--solar', battery:'--battery', agile:'--grid'}[tech] || '--text'; },

    // Marginal upfront capital to add this single technology, given the rest of
    // the build. extraUpfront is additive per tech (each contributes its own
    // capital, net of the like-for-like petrol-car / boiler spend it replaces),
    // so the step's capital is just that tech's own contribution.
    stepUpfront(tech){
      const p = this.p;
      switch(tech){
        case 'ev':      return p.evPrice - p.carPrice;
        case 'hp':      return (p.hpPrice - p.busGrant) - p.boilerPrice;
        case 'solar':   return this.solarCapital;
        case 'battery': return this.batteryCapital;
        default:        return 0;   // agile etc. — no capital outlay
      }
    },

    // Investment view of one step, mirroring the whole-build payback / IRR /
    // crossover but with the step's marginal capital as the outlay and the
    // step's running-cost saving (given the rest of the build) as the return.
    stepInvest(tech){
      const upfront = this.stepUpfront(tech);
      const saving  = this.marginalSavings(tech).run;   // £/yr running-cost reduction from this step
      const H = this.p.investHorizon, r = this.p.isaReturn/100;
      const irr       = (upfront <= 0 || saving <= 0) ? null : this.irr(upfront, saving, H);
      const crossover = (upfront <= 0 || saving <= 0) ? null : this.crossoverYear(saving, upfront, r, H);
      return { upfront, saving, irr, crossover };
    },
    stepPaybackLabel(inv){
      if(inv.saving <= 0) return '—';            // never recovers
      if(inv.upfront <= 0) return 'immediate';   // no extra capital to recover
      return (inv.upfront / inv.saving).toFixed(1) + ' yrs';
    },
    stepIrrLabel(inv){
      if(inv.irr === null) return '—';
      return inv.irr >= 1 ? '>100%' : (inv.irr * 100).toFixed(1) + '%';
    },
    stepCrossoverLabel(inv){
      if(inv.upfront <= 0 || inv.saving <= 0) return '—';
      return inv.crossover === null ? ('> ' + this.p.investHorizon + ' yrs') : ('year ' + inv.crossover);
    },

    marginalTipHtml(tech){
      // styled breakdown behind the marginal figure (− = saving / cut, + = added),
      // plus a per-step investment view (payback / IRR / ISA crossover)
      const on = this.cfg[tech];
      const hd = (on ? 'Contribution of ' : 'Adding ') + this.techLabel(tech);
      const sub = on
        ? 'Effect of this step, given the rest of the build — i.e. what you’d give up by removing it.'
        : 'Effect of adding this step, given whatever is already switched on.';
      const head = `<div class="tiphd"><span class="tdot" style="background:var(${this.techColor(tech)})"></span>${hd}</div>`
                 + `<div class="tipsub">${sub}</div>`;

      if(this.costMode === 'carbon'){
        const c = this.marginalCarbon(tech);
        const f = v => `<span class="${v>=0?'tg':'tb'}">${(v>=0?'−':'+')+this.co2(Math.abs(v))}</span>`;
        return head
          + `<div class="tiprow"><span>Operational</span>${f(c.op)}</div>`
          + `<div class="tiprow"><span>Embodied (annualised)</span>${f(c.emb)}</div>`
          + `<div class="tiprow tipnet"><span>Net carbon /yr</span>${f(c.net)}</div>`
          + `<div class="tipnote">− = cuts CO₂e/yr · + = adds</div>`;
      }

      const s = this.marginalSavings(tech);
      const inv = this.stepInvest(tech);
      const m = v => `<span class="${v>=0?'tg':'tb'}">${this.fmtSaving(v)}</span>`;
      return head
        + `<div class="tiprow"><span>Running cost</span>${m(s.run)}</div>`
        + `<div class="tiprow"><span>Annualised capital</span>${m(s.asset)}</div>`
        + `<div class="tiprow tipnet"><span>Net all-in /yr</span>${m(s.net)}</div>`
        + `<div class="tipnote">− = saves £/yr · + = adds</div>`
        + `<div class="tiphd2">This step as an investment</div>`
        + `<div class="tiprow"><span>Extra upfront</span><span class="tv">${this.gbp(inv.upfront)}</span></div>`
        + `<div class="tiprow"><span>Simple payback</span><span class="tv">${this.stepPaybackLabel(inv)}</span></div>`
        + `<div class="tiprow"><span>IRR · real</span><span class="tv">${this.stepIrrLabel(inv)}</span></div>`
        + `<div class="tiprow"><span>Crossover vs ${this.p.isaReturn}% ISA</span><span class="tv">${this.stepCrossoverLabel(inv)}</span></div>`;
    },

    // primary marginal figure for the active mode (carbon delta in carbon mode,
    // else the £ figure)
    marginalPrimary(tech){ return this.costMode === 'carbon' ? this.marginalCarbonLabel(tech) : this.marginalLabel(tech); },

    marginalCaption(){
      // small label under the marginal figure, reflecting the active mode
      let s = 'marginal';
      if(this.costMode === 'running') s += ' · running';
      else if(this.costMode === 'carbon') s += ' · carbon';
      return s;
    },

    marginalCarbonLabel(tech){
      // effect on all-in carbon (operational + amortised embodied) of flipping
      // this technology, given the rest of the current build — parallel to marginalLabel
      const flipped = this.flipCfg(tech);
      const here = this.current.totalCO2;       // reuse the cached current build
      const there = this.compute(flipped).totalCO2;
      const delta = this.cfg[tech] ? (there - here)   // currently on: carbon if removed minus now → +ve means it's cutting that much
                                   : (here - there);  // currently off: now minus carbon-if-added → +ve means adding cuts
      const sign = delta>=0 ? '−' : '+';
      return sign + this.co2(Math.abs(delta));
    },

    // Annual cost & carbon ledger for a build config. The logic lives in
    // ledger.compute (shared with the Node harness); ledgerCtx() supplies the
    // live parameters, flags and the half-hourly model runner.
    compute(c){ return ledger.compute(c, this.ledgerCtx()); },

    // ---- custom tariff schedule editing ----
    // Add a band after the last, defaulting to noon at the day rate so the user
    // only has to nudge the time/price.
    addTariffRow(){ this.p.tariffSchedule.push({ start:'12:00', price: this.p.elecRate, export: this.p.segRate }); },
    removeTariffRow(i){ if(this.p.tariffSchedule.length>1) this.p.tariffSchedule.splice(i,1); },
    // Load a ready-made schedule (Go / Cosy / Flux) into the editor — copied, so the
    // bands stay editable and the shared preset isn't mutated — and apply its daily
    // standing charge.
    applyTariffPreset(key){
      const pr = ledger.TARIFF_PRESETS[key];
      if(!pr) return;
      if(pr.schedule) this.p.tariffSchedule = JSON.parse(JSON.stringify(pr.schedule));
      if(pr.standing != null) this.p.elecStanding = pr.standing;
    },
    applyKona(){
      const k = this.konaPresets[this.konaChoice];
      if(!k) return;
      this.cfg.ev = k.ev;                                   // EV variant turns the car electric, petrol turns it back
      Object.keys(k).forEach(key => { if(key !== 'ev') this.p[key] = k[key]; });
    },
    resetAll(){
      this.p = JSON.parse(JSON.stringify(DEFAULTS));
      this.cfg = { ev:false, hp:false, solar:false, battery:false, agile:false, tariffMode:'agile', exportMode:'flat', disconnectGas:false };
      this.optimalDispatch = false;
      this.useHHModel = true;
      this.konaChoice = '';
      modelCache.clear();
    },
  },
  mounted(){
    document.querySelector('#app').removeAttribute('v-cloak');
    // Load the half-hourly dataset for the solar-matching model. model.load()
    // falls back to a synthetic year if the file is missing, so this always
    // resolves; until it does, compute() uses the annual estimate.
    if(typeof model !== 'undefined'){
      model.load(TOOL_PATH + 'model/data.json', () => {
        this.usingSynthetic = model.usingSynthetic;
        this.modelReady = true;
      });
    }
  }
}).mount('#app');

// Theme switch. The theme itself is already on <html> — the inline script in
// the page head sets it before the first paint — so this only has to flip the
// attribute, remember the choice, and keep the button's label describing where
// it takes you. Nothing else reads the theme: the stylesheet does the rest.
(function(){
  const root = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function describe(){
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    const label = 'Switch to ' + next + ' theme';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
  describe();

  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('oem-theme', next); } catch (e) { /* private mode */ }
    describe();
  });
})();

// Minimal stand-in for Bootstrap's offcanvas javascript, so the shared
// components/tool_sidebar.php works here without the Bootstrap bundle.
// Honours the same data-bs-toggle / data-bs-target / data-bs-dismiss
// attributes the component already carries.
(function(){
  const backdrop = document.body.appendChild(document.createElement('div'));
  backdrop.className = 'offcanvas-backdrop';

  function show(panel, open){
    panel.classList.toggle('show', open);
    backdrop.classList.toggle('show', open);
    document.querySelectorAll('[data-bs-target="#' + panel.id + '"]')
      .forEach(t => t.setAttribute('aria-expanded', open ? 'true' : 'false'));
  }
  const open = () => document.querySelector('.offcanvas.show');

  document.addEventListener('click', e => {
    const toggle = e.target.closest('[data-bs-toggle="offcanvas"]');
    if (toggle) {
      const panel = document.querySelector(toggle.dataset.bsTarget);
      if (panel) { show(panel, !panel.classList.contains('show')); return; }
    }
    if (e.target.closest('[data-bs-dismiss="offcanvas"]') || e.target === backdrop) {
      const panel = open();
      if (panel) show(panel, false);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open()) show(open(), false);
  });

  // Mark the entry for the tool we are already on. The shared component
  // renders a plain list, so the current page is matched by its url.
  const here = location.pathname.replace(/\/$/, '').split('/').pop();
  document.querySelectorAll('#sidebar .list-group-item').forEach(a => {
    if (a.getAttribute('href').toLowerCase() === here) a.classList.add('active');
  });
})();
