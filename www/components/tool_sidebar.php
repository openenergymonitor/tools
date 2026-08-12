<?php
// Shared tool navigation sidebar (Bootstrap offcanvas).
// Used by theme.php and by standalone tools that render their own page
// wrapper. Requires: $menu. Toggle with a button targeting #sidebar:
// data-bs-toggle="offcanvas" data-bs-target="#sidebar"
?>
<div class="offcanvas offcanvas-start" tabindex="-1" id="sidebar" aria-labelledby="sidebarLabel">
    <div class="offcanvas-header">
        <h5 id="sidebarLabel">Menu</h5>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
        <?php
        // Group by the menu entry's category, keeping the order categories and
        // tools first appear in menu.php
        $categories = array();
        foreach ($menu as $key => $value) {
            if (isset($value['hide']) && $value['hide'] === true) continue;
            $category = isset($value['category']) ? $value['category'] : 'Other';
            $categories[$category][$key] = $value;
        }
        ?>
        <?php foreach ($categories as $category => $tools): ?>
            <h6 class="text-uppercase text-muted mt-3"><?php echo $category; ?></h6>
            <div class="list-group">
                <?php foreach ($tools as $key => $value): ?>
                    <a href="<?php echo $value['case']; ?>" class="list-group-item list-group-item-action"><?php echo $value['title']; ?></a>
                <?php endforeach; ?>
            </div>
        <?php endforeach; ?>

        <h6 class="text-uppercase text-muted mt-3">Other tools</h6>
        <div class="list-group">
            <a href="https://openenergymonitor.org/heatlossjs" class="list-group-item list-group-item-action">HeatLoss.js</a>
            <a href="https://openenergymonitor.org/sapjs" class="list-group-item list-group-item-action">SAP.js</a>
            <a href="https://openenergymonitor.org/zcem" class="list-group-item list-group-item-action">ZeroCarbonBritain energy model</a>
        </div>
    </div>
</div>
