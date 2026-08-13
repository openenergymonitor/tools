<?php

// CLI only script to cache data for the co-benefit explorer
if (php_sapi_name() !== 'cli') {
    die("This script can only be run from the command line.");
}

// Cache data for the co-benefit explorer

// Feeds:
// appliance demand: 542259
// cooker demand:    542261
// lighting demand:  542263
// heatpump demand:  542262
// ev demand:        542260
// solar             542264
// agile import      518384 (region K, ex-VAT p/kWh)
// agile export      399369 (region K)
// carbon intensity  428391 (national grid, gCO2/kWh, half-hourly)
// cosy import       520109 (region K, ex-VAT p/kWh)

// 1. Generate the request URL for the API call
// http://localhost/tools/api.php?ids=542264,542259,542261,542263,542262,518384,399369,542260,428391,520109&start=1748736000&end=1780272000&interval=900&average=1&skipmissing=0&limitinterval=0&timeformat=notime

// 2. Call the API and get the data

// 3. Save the json data file in the cache folder

$data = file_get_contents('http://localhost/tools/api.php?ids=542264,542259,542261,542263,542262,518384,399369,542260,428391,520109&start=1748736000&end=1780272000&interval=900&average=1&skipmissing=0&limitinterval=0&timeformat=notime');

// Decode JSON data to check if it's valid
$json_data = json_decode($data, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    die("Error decoding JSON data: " . json_last_error_msg());
}

// format is [{"feedid":542259,"data":[array of values..]}, ..]

// convert to 0dp all feeds except the price feeds (agile import/export, cosy
// import) which are in pence/kWh and should be 2dp
$price_feeds = array(518384, 399369, 520109);
foreach ($json_data as &$feed) {
    if (!in_array($feed['feedid'], $price_feeds)) {
        foreach ($feed['data'] as &$value) {
            $value = round($value);
        }
    } else {
        foreach ($feed['data'] as &$value) {
            $value = round($value, 2);
        }
    }
}

$data = json_encode($json_data);

// 4. Save the data to a file, next to this script rather than in the working
// directory, so it lands where model.js and harness.js expect it
file_put_contents(__DIR__ . '/data.json', $data);
