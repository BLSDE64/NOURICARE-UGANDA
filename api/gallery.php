<?php
require __DIR__ . '/_bootstrap.php';
$rows = db()->query('SELECT id, title, description, category, image_url, created_at
                     FROM gallery ORDER BY created_at DESC, id DESC')->fetchAll();
json_out(['data' => $rows]);
