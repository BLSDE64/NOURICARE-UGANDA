<?php
// Receives the "Place an Order" form, stores it, e-mails you, then shows thank-you.html
require __DIR__ . '/_bootstrap.php';

function page_error(string $msg, int $code = 400) {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<body style="font-family:sans-serif;text-align:center;padding:15vh 1rem">'
       . '<h2>We couldn’t send your order</h2><p>' . htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') . '</p>'
       . '<p><a href="../index.html#Order">← Go back and try again</a></p>';
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Location: ../index.html#Order'); exit; }

// Honeypot: real people never fill this hidden field
if (!empty($_POST['bot-field'])) { header('Location: ../thank-you.html'); exit; }

$clip = function ($k, $max) { return trim(mb_substr((string)($_POST[$k] ?? ''), 0, $max)); };
$name = $clip('name', 100); $phone = $clip('phone', 30); $product = $clip('product', 150);
$address = $clip('address', 255); $message = $clip('message', 2000);
$qty = (int)($_POST['quantity'] ?? 0);

if ($name === '' || $phone === '' || $product === '' || $address === '') page_error('Please fill in your name, phone, product and delivery address.');
if (!preg_match('/^[0-9+()\-\s]{7,30}$/', $phone)) page_error('Please enter a valid phone number.');
if ($qty < 1 || $qty > 9999) page_error('Please enter a valid quantity.');

$ip = client_ip();
$c = db()->prepare('SELECT COUNT(*) FROM orders WHERE ip = ? AND created_at > (NOW() - INTERVAL 1 HOUR)');
$c->execute([$ip]);
if ((int)$c->fetchColumn() >= 8) page_error('Too many orders from this connection. Please call us instead.', 429);

db()->prepare('INSERT INTO orders (name, phone, product, quantity, address, message, ip) VALUES (?,?,?,?,?,?,?)')
    ->execute([$name, $phone, $product, $qty, $address, $message, $ip]);

if (ORDER_NOTIFY_EMAIL !== '') {
    $body = "New Nouricare order\n\nName: $name\nPhone: $phone\nProduct: $product\nQuantity: $qty\nAddress: $address\nMessage: $message\n";
    @mail(ORDER_NOTIFY_EMAIL, 'New Nouricare order — ' . preg_replace('/[\r\n]+/', ' ', $name), $body, 'From: ' . MAIL_FROM);
}

header('Location: ../thank-you.html');
exit;
