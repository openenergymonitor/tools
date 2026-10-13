# Dynamic heat pump simulator additions

The room schedule now includes a heating-season selector for annual runs. All
months are enabled by default. Disabling a month hard-disables space heating
only: the building still free-runs and domestic hot water schedules continue.

The power chart also offers independently toggleable `Room ΔT` (room minus
target) and `System ΔT` (flow minus return) traces. Both use the existing
timeseries, downsampling, legend and hover-tooltip paths.
