<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

/* ---------- basics ---------- */
function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function json_out($data, int $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400) { json_out(['error' => $msg], $code); }

set_exception_handler(function ($e) {
    error_log((string)$e);
    fail('Server error. Please try again.', 500);
});

function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }

/* ---------- session + CSRF ---------- */
function start_session() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('nc_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    ini_set('session.use_strict_mode', '1');
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function require_csrf() {
    $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? ''));
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) fail('Security check failed. Refresh the page.', 403);
}

function reset_session() {
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

/* guest | need_code | authed */
function auth_state(): string {
    $now = time();
    if (!empty($_SESSION['uid']) && !empty($_SESSION['mfa'])) {
        if ($now - ($_SESSION['last'] ?? 0) > IDLE_SECONDS || $now - ($_SESSION['born'] ?? 0) > ABSOLUTE_SECONDS) {
            reset_session();
            return 'guest';
        }
        $_SESSION['last'] = $now;
        return 'authed';
    }
    if (!empty($_SESSION['pending_uid']) && $now - ($_SESSION['pending_at'] ?? 0) < 300) return 'need_code';
    return 'guest';
}

function require_admin() { if (auth_state() !== 'authed') fail('Not signed in.', 401); }

/* ---------- brute-force protection ---------- */
function too_many_attempts(string $key): bool {
    db()->exec('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)');
    $s = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE (ip = ? OR email = ?) AND created_at > (NOW() - INTERVAL 15 MINUTE)');
    $s->execute([client_ip(), $key]);
    return (int)$s->fetchColumn() >= 5;
}
function record_attempt(string $key) { db()->prepare('INSERT INTO login_attempts (ip, email) VALUES (?, ?)')->execute([client_ip(), $key]); }
function clear_attempts(string $key) { db()->prepare('DELETE FROM login_attempts WHERE email = ?')->execute([$key]); }

/* ---------- TOTP (Google/Microsoft Authenticator, Authy…) ---------- */
function b32enc(string $bin): string {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $ch) $out .= $a[bindec(str_pad($ch, 5, '0'))];
    return $out;
}
function b32dec(string $s): string {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = '';
    foreach (str_split(strtoupper(rtrim($s, '='))) as $c) {
        $p = strpos($a, $c);
        if ($p !== false) $bits .= str_pad(decbin($p), 5, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
    return $out;
}
function new_totp_secret(): string { return b32enc(random_bytes(20)); }
function totp_at(string $secret, int $step): string {
    $h = hash_hmac('sha1', pack('J', $step), b32dec($secret), true);
    $o = ord($h[19]) & 15;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}
/* returns the matched 30-second step (or 0). Allows ±1 step of clock drift. */
function totp_match(string $secret, string $code): int {
    if (!preg_match('/^\d{6}$/', $code)) return 0;
    $now = intdiv(time(), 30);
    for ($i = -1; $i <= 1; $i++) if (hash_equals(totp_at($secret, $now + $i), $code)) return $now + $i;
    return 0;
}
