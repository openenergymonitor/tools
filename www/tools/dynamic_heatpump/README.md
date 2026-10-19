# Dynamic heat pump simulator additions

The room schedule now includes a heating-season selector for annual runs. All
months are enabled by default. Disabling a month hard-disables space heating
only: the building still free-runs and domestic hot water schedules continue.

The power chart also offers independently toggleable `Room ΔT` (room minus
target) and `System ΔT` (flow minus return) traces. Both use the existing
timeseries, downsampling, legend and hover-tooltip paths.

## Headless runs

`harness.js` runs the simulator in Node without a browser, for a single day
or a full year (see the usage notes at the top of the file).

`sweep.js` runs a Monte Carlo sweep of full-year scenarios across randomised
system designs, one worker thread per core, and writes one CSV row per
scenario with HeatpumpMonitor.org-style annual stats:

```
node sweep.js --n 400 --out sweep_results.csv
```

400 scenarios take about 3 minutes on 10 cores. The design ranges are in
`make_scenarios()`.
