<?php

// ============================================================================
// HeatpumpMonitor.org API proxy
// ----------------------------------------------------------------------------
// heatpumpmonitor.org sends no Access-Control-Allow-Origin header, so a browser
// on this site cannot call it directly. This proxies the endpoints the
// dynamic heat pump tool's validation feature needs, with the same md5-keyed
// disk cache api.php uses for emoncms.
//
//   hpmon.php?action=list
//   hpmon.php?action=stats365
//   hpmon.php?action=system&id=748
//   hpmon.php?action=available&id=748
//   hpmon.php?action=data&id=748&feeds=heatpump_flowT,heatpump_heat
//                        &start=1773107100&end=1773193500&interval=30
//
// Differences from calling heatpumpmonitor.org directly:
//  - start/end are unix SECONDS here (as they appear in a dashboard share
//    URL); the upstream data endpoint wants milliseconds and gets them here
//  - values are rounded (default 2 dp), which cuts the payload by around half:
//    the upstream API returns full float noise (722.7999877929688)
//  - responses are cached; windows that have finished are cached for a month,
//    windows running up to now for 10 minutes
// ============================================================================

header('Content-Type: application/json');

$UPSTREAM = 'https://heatpumpmonitor.org';
$CACHE_DIR = __DIR__ . '/cache';

// Intervals the upstream API is happy with, coarsest first for the error message
$INTERVALS = array(10, 30, 60, 120, 300, 600, 900, 1800, 3600, 86400);

// Guard rails: a 30 s / 11 feed request over 60 days is about 1.9M values
$MAX_SPAN = 62 * 86400;   // seconds
$MAX_VALUES = 2000000;    // points x feeds
$MAX_FEEDS = 20;

$action = get('action', 'data');
$id = (int) get('id', 0);
if (!in_array($action, array('list', 'stats365')) && $id <= 0) {
    fail('missing or invalid id');
}

// ----------------------------------------------------------------------------
// Build the upstream URL for the requested action
// ----------------------------------------------------------------------------
$dp = (int) get('dp', 2);
if ($dp < 0 || $dp > 6) $dp = 2;

if ($action == 'list') {
    $url = "$UPSTREAM/system/list/public.json";
    $ttl = 3600;
    $round = false;

} else if ($action == 'stats365') {
    $url = "$UPSTREAM/system/stats/last365";
    $ttl = 3600;
    $round = false;

} else if ($action == 'system') {
    $url = "$UPSTREAM/system/get?id=$id";
    $ttl = 3600;
    $round = false;

} else if ($action == 'available') {
    $url = "$UPSTREAM/timeseries/available?id=$id";
    $ttl = 3600;
    $round = false;

} else if ($action == 'data') {
    $feeds = get('feeds', '');
    if (!preg_match('/^[A-Za-z0-9_]+(,[A-Za-z0-9_]+)*$/', $feeds)) {
        fail('missing or invalid feeds list');
    }
    $feed_count = substr_count($feeds, ',') + 1;
    if ($feed_count > $MAX_FEEDS) fail("too many feeds (max $MAX_FEEDS)");

    // Accept seconds (as in a share URL) or milliseconds, normalise to seconds
    $start = to_seconds((float) get('start', 0));
    $end = to_seconds((float) get('end', 0));
    if ($start <= 0 || $end <= 0) fail('missing or invalid start/end');
    if ($end <= $start) fail('end must be after start');

    $span = $end - $start;
    if ($span > $MAX_SPAN) fail('window too long (max ' . ($MAX_SPAN / 86400) . ' days)');

    $interval = (int) get('interval', 30);
    if (!in_array($interval, $INTERVALS)) {
        fail('invalid interval, use one of ' . implode(',', $INTERVALS));
    }

    $values = ($span / $interval) * $feed_count;
    if ($values > $MAX_VALUES) {
        fail('request too large: ' . round($values / 1000) . 'k values, max ' .
            ($MAX_VALUES / 1000) . 'k — use a coarser interval or a shorter window');
    }

    // Upstream wants milliseconds. average=1 is what makes a coarser interval a
    // mean rather than a sample, which matters for power feeds
    $url = "$UPSTREAM/timeseries/data.json?id=$id&feeds=" . rawurlencode($feeds) .
        '&start=' . ($start * 1000) . '&end=' . ($end * 1000) .
        "&interval=$interval&average=1&delta=0&skipmissing=0&limitinterval=0" .
        '&timeformat=notime&readkey=';

    // A window that has already finished will never change, so it can be
    // cached hard; one running up to now is still filling in
    $ttl = ($end < time() - 86400) ? 30 * 86400 : 600;
    $round = true;

} else {
    fail('unknown action, expected system, available or data');
}

// ----------------------------------------------------------------------------
// Cache, then fetch
// ----------------------------------------------------------------------------
$cache_file = "$CACHE_DIR/hpmon_" . md5($url . '|dp' . $dp) . '.json';

if (file_exists($cache_file) && (time() - filemtime($cache_file)) < $ttl) {
    header('X-Cache: HIT');
    readfile($cache_file);
    return;
}

$data = fetch($url);
if ($data === false) {
    // Stale cache beats no answer if heatpumpmonitor.org is unreachable
    if (file_exists($cache_file)) {
        header('X-Cache: STALE');
        readfile($cache_file);
        return;
    }
    fail('upstream request failed', 502);
}

$json = json_decode($data, true);
if ($json === null) fail('upstream returned invalid JSON', 502);

// Round the timeseries values: the upstream API returns full float precision,
// which roughly doubles the payload for no useful resolution
if ($round) {
    foreach ($json as $feed => $series) {
        if (!is_array($series)) continue;
        foreach ($series as $i => $v) {
            if ($v !== null) $json[$feed][$i] = round($v, $dp);
        }
    }
}

$out = json_encode($json);

if (is_dir($CACHE_DIR) && is_writable($CACHE_DIR)) {
    // Write via a temporary file so a concurrent reader never sees a half
    // written cache entry
    $tmp = $cache_file . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, $out) !== false) {
        rename($tmp, $cache_file);
    }
}

header('X-Cache: MISS');
echo $out;

// ----------------------------------------------------------------------------

function fetch($url)
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 180,
            CURLOPT_ENCODING => '',          // accept gzip
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_USERAGENT => 'openenergymonitor-tools/dynamic_heatpump'
        ));
        $data = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($data === false || $status != 200) return false;
        return $data;
    }

    $context = stream_context_create(array('http' => array('timeout' => 180)));
    return @file_get_contents($url, false, $context);
}

// Unix seconds from a value that may be seconds or milliseconds
function to_seconds($v)
{
    return ($v > 1e11) ? floor($v / 1000) : floor($v);
}

function get($index, $default = null)
{
    if (!isset($_GET[$index])) return $default;
    return stripslashes(rawurldecode($_GET[$index]));
}

function fail($message, $status = 400)
{
    http_response_code($status);
    echo json_encode(array('success' => false, 'message' => $message));
    exit;
}
