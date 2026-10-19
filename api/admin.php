<?php
// Admin API — every action except "me", "login" and "verify" needs a fully
// authenticated session (password + authenticator code) and a CSRF token.
require __DIR__ . '/_bootstrap.php';
start_session();

$action = (string)($_GET['action'] ?? 'me');
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') require_csrf();

/* ---------- what each content type looks like ---------- */
$RESOURCES = [
    'posts' => [
        'fields' => ['title' => 'str:200', 'description' => 'str:5000', 'post_date' => 'date'],
        'required' => ['title', 'description', 'post_date'], 'image_required' => true,
        'order' => 'post_date DESC, id DESC',
    ],
    'products' => [
        'fields' => ['name' => 'str:150', 'description' => 'str:1000', 'badge_text' => 'str:40',
                     'badge_color' => 'enum:success,warning,info,danger,primary,dark',
                     'price_ugx' => 'int', 'sort_order' => 'int0', 'is_active' => 'bool'],
        'required' => ['name'], 'image_required' => false,
        'order' => 'sort_order ASC, id ASC',
    ],
    'gallery' => [
        'fields' => ['title' => 'str:200', 'description' => 'str:500',
                     'category' => 'enum:Nutrition,Community,Promotion,Production,Team,Customers'],
        'required' => ['title', 'category'], 'image_required' => true,
        'order' => 'created_at DESC, id DESC',
    ],
];

function resource_cfg(array $R) {
    $r = (string)($_GET['resource'] ?? '');
    if (!isset($R[$r])) fail('Unknown resource.');
    return [$r, $R[$r]];
}

function clean_field(string $type, $v) {
    $v = is_string($v) ? trim($v) : $v;
    $parts = explode(':', $type, 2);
    $t = $parts[0]; $arg = $parts[1] ?? '';
    switch ($t) {
        case 'str':  return mb_substr((string)$v, 0, (int)$arg);
        case 'date': return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$v) ? $v : fail('Invalid date.');
        case 'int':  return ($v === '' || $v === null) ? null : max(0, (int)$v);
        case 'int0': return ($v === '' || $v === null) ? 0 : (int)$v;
        case 'bool': return ($v === '1' || $v === 'true' || $v === 'on') ? 1 : 0;
        case 'enum': return in_array($v, explode(',', $arg), true) ? $v : fail('Invalid choice for a field.');
    }
    return null;
}

function save_upload(string $field) {
    if (empty($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) return null;
    $f = $_FILES[$field];
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Upload failed. Try a smaller image.');
    if ($f['size'] > MAX_UPLOAD_BYTES) fail('Image is too large (max 5 MB).');
    if (!@getimagesize($f['tmp_name'])) fail('That file is not a valid image.');
    $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!isset($map[$mime])) fail('Only JPG, PNG, WebP or GIF images are allowed.');
    $dir = dirname(__DIR__) . '/uploads';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = bin2hex(random_bytes(12)) . '.' . $map[$mime];
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) fail('Could not save the image.', 500);
    return 'uploads/' . $name;
}

// Only ever deletes files this system created (random name inside /uploads)
function delete_local_image($url) {
    if ($url && preg_match('#^uploads/[a-f0-9]{24}\.(jpg|png|webp|gif)$#', $url)) @unlink(dirname(__DIR__) . '/' . $url);
}


switch ($action) {

    /* ================= AUTH ================= */
    case 'me':
        json_out(['state' => auth_state(), 'csrf' => $_SESSION['csrf']]);

    case 'login': {
        if ($method !== 'POST') fail('POST only.', 405);
        $email = strtolower(trim((string)($_POST['email'] ?? '')));
        $pass  = (string)($_POST['password'] ?? '');
        if (too_many_attempts($email)) fail('Too many attempts. Please wait 15 minutes and try again.', 429);
        $s = db()->prepare('SELECT id, password_hash FROM admins WHERE email = ?');
        $s->execute([$email]);
        $u = $s->fetch();
        // unknown e-mail still does a full hash check so response time doesn't reveal valid e-mails
        $ok = password_verify($pass, $u ? $u['password_hash'] : password_hash('x', PASSWORD_DEFAULT));
        if (!$u || !$ok) { record_attempt($email); fail('Invalid email or password.', 401); }
        session_regenerate_id(true);
        $_SESSION['pending_uid'] = (int)$u['id'];
        $_SESSION['pending_email'] = $email;
        $_SESSION['pending_at'] = time();
        json_out(['state' => 'need_code', 'csrf' => $_SESSION['csrf']]);
    }

    case 'verify': {
        if ($method !== 'POST') fail('POST only.', 405);
        if (auth_state() !== 'need_code') fail('Please sign in again.', 401);
        $email = (string)$_SESSION['pending_email'];
        if (too_many_attempts($email)) fail('Too many attempts. Please wait 15 minutes and try again.', 429);
        $s = db()->prepare('SELECT id, totp_secret, last_totp_step FROM admins WHERE id = ?');
        $s->execute([(int)$_SESSION['pending_uid']]);
        $u = $s->fetch();
        $step = $u ? totp_match($u['totp_secret'], preg_replace('/\D/', '', (string)($_POST['code'] ?? ''))) : 0;
        if (!$u || !$step || $step <= (int)$u['last_totp_step']) { record_attempt($email); fail('That code is not valid. Check your authenticator app and try again.', 401); }
        db()->prepare('UPDATE admins SET last_totp_step = ? WHERE id = ?')->execute([$step, $u['id']]);
        clear_attempts($email);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        $_SESSION['mfa'] = true;
        $_SESSION['born'] = $_SESSION['last'] = time();
        unset($_SESSION['pending_uid'], $_SESSION['pending_email'], $_SESSION['pending_at']);
        json_out(['state' => 'authed', 'csrf' => $_SESSION['csrf']]);
    }

    case 'logout':
        reset_session();
        json_out(['state' => 'guest', 'csrf' => $_SESSION['csrf']]);

    /* ================= CONTENT (admin only) ================= */
    case 'list': {
        require_admin();
        if (($_GET['resource'] ?? '') === 'orders') {
            json_out(['data' => db()->query('SELECT id, name, phone, product, quantity, address, message, status, created_at
                                             FROM orders ORDER BY created_at DESC, id DESC LIMIT 500')->fetchAll()]);
        }
        [$r, $cfg] = resource_cfg($RESOURCES);
        json_out(['data' => db()->query("SELECT * FROM $r ORDER BY " . $cfg['order'])->fetchAll()]);
    }

    case 'save': {
        require_admin();
        if ($method !== 'POST') fail('POST only.', 405);
        [$r, $cfg] = resource_cfg($RESOURCES);
        $id = (int)($_POST['id'] ?? 0);

        $vals = [];
        foreach ($cfg['fields'] as $f => $type) {
            if (!array_key_exists($f, $_POST)) { if ($id) continue; $_POST[$f] = ''; }
            $vals[$f] = clean_field($type, $_POST[$f]);
        }
        foreach ($cfg['required'] as $f) {
            if (array_key_exists($f, $vals) && ($vals[$f] === '' || $vals[$f] === null)) fail('Please fill in all required fields.');
        }

        $old = null;
        if ($id) {
            $s = db()->prepare("SELECT image_url FROM $r WHERE id = ?");
            $s->execute([$id]);
            $row = $s->fetch();
            if (!$row) fail('That item no longer exists.', 404);
            $old = $row['image_url'];
        }

        $newImg = save_upload('image');
        if (!$id && $cfg['image_required'] && !$newImg) fail('Please choose an image.');
        if ($newImg) $vals['image_url'] = $newImg;

        if ($id) {
            $set = implode(', ', array_map(function ($c) { return "$c = :$c"; }, array_keys($vals)));
            $vals['__id'] = $id;
            $sql = "UPDATE $r SET $set WHERE id = :__id";
        } else {
            $cols = array_keys($vals);
            $sql = "INSERT INTO $r (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_map(function ($c) { return ':' . $c; }, $cols)) . ')';
        }
        $st = db()->prepare($sql);
        $st->execute($vals);
        if ($id && $newImg) delete_local_image($old);
        json_out(['ok' => true, 'id' => $id ?: (int)db()->lastInsertId()]);
    }

    case 'toggle': {            // show / hide a product
        require_admin();
        if ($method !== 'POST') fail('POST only.', 405);
        db()->prepare('UPDATE products SET is_active = 1 - is_active WHERE id = ?')->execute([(int)($_POST['id'] ?? 0)]);
        json_out(['ok' => true]);
    }

    case 'order_status': {
        require_admin();
        if ($method !== 'POST') fail('POST only.', 405);
        $st = (string)($_POST['status'] ?? '');
        if (!in_array($st, ['new', 'contacted', 'delivered', 'cancelled'], true)) fail('Invalid status.');
        db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$st, (int)($_POST['id'] ?? 0)]);
        json_out(['ok' => true]);
    }

    case 'delete': {
        require_admin();
        if ($method !== 'POST') fail('POST only.', 405);
        $id = (int)($_POST['id'] ?? 0);
        if (($_GET['resource'] ?? '') === 'orders') {
            db()->prepare('DELETE FROM orders WHERE id = ?')->execute([$id]);
            json_out(['ok' => true]);
        }
        [$r] = resource_cfg($RESOURCES);
        $s = db()->prepare("SELECT image_url FROM $r WHERE id = ?");
        $s->execute([$id]);
        $row = $s->fetch();
        db()->prepare("DELETE FROM $r WHERE id = ?")->execute([$id]);
        if ($row) delete_local_image($row['image_url']);
        json_out(['ok' => true]);
    }
}

fail('Unknown action.', 404);
