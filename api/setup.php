<?php
// ONE-TIME admin setup: creates the admin account AND links the authenticator app.
// Open:  https://yourdomain.com/api/setup.php?key=YOUR_SETUP_KEY
// When finished, DELETE this file from the server.
require __DIR__ . '/_bootstrap.php';
start_session();
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');

$h = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };

if (SETUP_KEY === 'CHANGE-ME' || !hash_equals(SETUP_KEY, (string)($_GET['key'] ?? ''))) { http_response_code(403); exit('Forbidden. Set SETUP_KEY in api/config.php and open this page with ?key=YOUR_SETUP_KEY'); }
if ((int)db()->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) exit('Setup is already complete. Please delete api/setup.php from the server.');

$err = ''; $step = 1; $done = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    if (isset($_POST['step1'])) {
        $email = strtolower(trim((string)$_POST['email']));
        $pass = (string)$_POST['password'];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $err = 'Enter a valid email address.';
        elseif (strlen($pass) < 12) $err = 'Use a password of at least 12 characters.';
        elseif ($pass !== (string)$_POST['password2']) $err = 'The two passwords do not match.';
        else {
            $_SESSION['setup'] = ['email' => $email, 'hash' => password_hash($pass, PASSWORD_DEFAULT), 'secret' => new_totp_secret()];
            $step = 2;
        }
    } elseif (isset($_POST['step2']) && !empty($_SESSION['setup'])) {
        $su = $_SESSION['setup'];
        $m = totp_match($su['secret'], preg_replace('/\D/', '', (string)$_POST['code']));
        if (!$m) { $err = 'That code did not match. Wait for a fresh code and try again.'; $step = 2; }
        else {
            db()->prepare('INSERT INTO admins (email, password_hash, totp_secret, last_totp_step) VALUES (?,?,?,?)')
                ->execute([$su['email'], $su['hash'], $su['secret'], $m]);
            unset($_SESSION['setup']);
            $done = true;
        }
    }
}
$su = $_SESSION['setup'] ?? null;
$uri = $su ? 'otpauth://totp/' . rawurlencode('Nouricare Admin:' . $su['email']) . '?secret=' . $su['secret'] . '&issuer=' . rawurlencode('Nouricare Admin') : '';
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Nouricare — Admin Setup</title>
<style>
 body{font-family:system-ui,sans-serif;background:#FBF8F2;color:#1B2822;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}
 .c{background:#fff;border:1px solid #E9E7DB;border-radius:24px;padding:2rem;max-width:440px;width:100%;box-shadow:0 10px 30px rgba(14,59,51,.08)}
 h1{font-size:1.4rem;color:#0E3B33;margin:0 0 .25rem} p{color:#5C6B64;font-size:.92rem;line-height:1.5}
 label{display:block;font-weight:600;font-size:.85rem;margin:.9rem 0 .3rem}
 input{width:100%;box-sizing:border-box;padding:.7rem .9rem;border:1.5px solid #E9E7DB;border-radius:12px;font-size:1rem}
 button{width:100%;margin-top:1.2rem;padding:.8rem;border:0;border-radius:999px;background:#1F7A5C;color:#fff;font-weight:700;font-size:1rem;cursor:pointer}
 .e{background:#fbe9e5;color:#A63F22;padding:.6rem .8rem;border-radius:10px;font-size:.88rem}
 code{display:block;word-break:break-all;background:#FBF8F2;border:1px dashed #E9E7DB;padding:.6rem;border-radius:10px;margin:.4rem 0}
 #qr{display:flex;justify-content:center;margin:1rem 0}
</style></head><body><div class="c">
<?php if ($done): ?>
  <h1>✅ Admin account ready</h1>
  <p>Your password and authenticator are linked.</p>
  <p><strong>Now delete <code style="display:inline;padding:.1rem .4rem">api/setup.php</code> from your server</strong>, then sign in at <a href="../admin.html">admin.html</a>.</p>
<?php elseif ($step === 2 && $su): ?>
  <h1>Link your authenticator</h1>
  <p>Open Google Authenticator, Microsoft Authenticator or Authy → add account → scan this code.</p>
  <div id="qr"></div>
  <p>Can’t scan? Enter this key manually:</p><code><?= $h($su['secret']) ?></code>
  <p style="font-size:.82rem">Save this key in a password manager as a backup in case you lose your phone.</p>
  <?php if ($err): ?><div class="e"><?= $h($err) ?></div><?php endif; ?>
  <form method="post"><input type="hidden" name="csrf" value="<?= $h($_SESSION['csrf']) ?>">
    <label>Enter the 6-digit code shown in the app</label>
    <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus>
    <button name="step2" value="1">Confirm &amp; finish</button></form>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script>try{new QRCode(document.getElementById('qr'),{text:<?= json_encode($uri) ?>,width:200,height:200});}catch(e){}</script>
<?php else: ?>
  <h1>Create the admin account</h1>
  <p>This only works once. Next you’ll link your authenticator app.</p>
  <?php if ($err): ?><div class="e"><?= $h($err) ?></div><?php endif; ?>
  <form method="post"><input type="hidden" name="csrf" value="<?= $h($_SESSION['csrf']) ?>">
    <label>Email</label><input type="email" name="email" required>
    <label>Password (12+ characters)</label><input type="password" name="password" minlength="12" required>
    <label>Repeat password</label><input type="password" name="password2" minlength="12" required>
    <button name="step1" value="1">Continue</button></form>
<?php endif; ?>
</div></body></html>
