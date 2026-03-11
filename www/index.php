<?php

// The most basic front controller

include 'core.php';
include 'menu.php';

// Connect to redis
$redis = new Redis();
$redis->connect('localhost');

$q = $_GET['q'] ?? 'home';

// change to lower case
$q = strtolower($q);
// remove .php, .html
$q = str_replace('.php', '', $q);
$q = str_replace('.html', '', $q);

// Default values
$title = '404 - Page not found';
$description = '';
$content = '';
$github = 'https://github.com/openenergymonitor/tools';

// Hardcoded redirects
$moved = array(
    'dynamic_heatpump_v1' => 'dynamic_heatpump'
);
if (isset($moved[$q])) $q = $moved[$q];

// Check if page exists in menu
if (isset($menu[$q])) {
    $title = $menu[$q]['title'];
    $description = $menu[$q]['description'];
    $github .= "/tree/main/www/tools/$q";
    $path = "tools/$q/";
    $path_lib = "lib/";
    $content = view("tools/$q/$q.php", array(
        'path' => $path,
        'path_lib' => $path_lib
    ));
} else if ($q == 'home') {
    $title = 'Tools';
    $content = view('home_view.php', array(
        'menu' => $menu
    ));
} else if ($q == 'stats') {
    $title = 'Stats';
    $content = view('stats_view.php', array(
        'stats' => get_views($redis, $menu)
    ));
} else {
    $q = '404';
    $content = view('404.php');
}

// Load the theme
echo view("theme.php", array(
    'menu' => $menu,
    'title' => $title,
    'description' => $description,
    'content' => $content,
    'github' => $github
));

// Increase view count to this page
if ($redis && $q != 'stats') {
    $redis->incr("tools:$q");
}

// Log request to /home/oem/tools/access.log
/*
$log_entry = sprintf(
    "%s %s %s %s\n",
    date('Y-m-d H:i:s'),
    $_SERVER['REMOTE_ADDR'],
    $q,
    $_SERVER['REQUEST_URI']
);
file_put_contents('/home/oem/tools/access.log', $log_entry, FILE_APPEND);
*/