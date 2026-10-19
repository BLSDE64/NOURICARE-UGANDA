<?php
require __DIR__ . '/_bootstrap.php';
$rows = db()->query('SELECT id, name, description, image_url, badge_text, badge_color, price_ugx
                     FROM products WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')->fetchAll();
json_out(['data' => $rows]);
