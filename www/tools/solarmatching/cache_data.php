<?php

// CLI only script to cache data for solarmatching tool
if (php_sapi_name() !== 'cli') {
    die("This script can only be run from the command line.");
}

// Cache data for solarmatching tool

// Feeds:
// appliance demand: 542259
// cooker demand:    542261
// lighting demand:  542263
// heatpump demand:  542262
// ev demand:        542260
// solar             542264
// agile import      518378
// agile export      399363

// 1. Generate the request URL for the API call
// http://localhost/tools/api.php?ids=542264,542259,542261,542263,542262,518378,399363,542260&start=1748736000&end=1780272000&interval=900&average=1&skipmissing=0&limitinterval=0&timeformat=notime

// 2. Call the API and get the data

// 3. Save the json data file in the cache folder

$data = file_get_contents('http://localhost/tools/api.php?ids=542264,542259,542261,542263,542262,518378,399363,542260&start=1748736000&end=1780272000&interval=900&average=1&skipmissing=0&limitinterval=0&timeformat=notime');

// Decode JSON data to check if it's valid
$json_data = json_decode($data, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    die("Error decoding JSON data: " . json_last_error_msg());
}

// format is [{"feedid":542259,"data":[array of values..]}, ..]

// convert to 0dp all feeds except last two (agile import and export) which are in pence/kWh and should be 2dp
foreach ($json_data as &$feed) {
    if ($feed['feedid'] != 518378 && $feed['feedid'] != 399363) {
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

// 4. Save the data to a file
file_put_contents('solarmatching_data.json', $data);
