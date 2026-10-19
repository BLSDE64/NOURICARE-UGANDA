<?php
require __DIR__ . '/_bootstrap.php';
$limit = isset($_GET['limit']) ? max(1, min(50, (int)$_GET['limit'])) : 50;
$s = db()->prepare('SELECT id, title, description, image_url, post_date, created_at
                    FROM posts ORDER BY post_date DESC, id DESC LIMIT ?');
$s->bindValue(1, $limit, PDO::PARAM_INT);
$s->execute();
json_out(['data' => $s->fetchAll()]);
