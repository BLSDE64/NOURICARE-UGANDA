<?php
// =====================================================================
// NOURICARE — CONFIG  (edit these values, keep this file private)
// =====================================================================
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');

// One-time key that unlocks api/setup.php. Make it long and random,
// e.g. 30+ letters/numbers. Delete setup.php after you finish setup.
define('SETUP_KEY', 'CHANGE-ME');

// Order notifications (optional). Leave ORDER_NOTIFY_EMAIL empty to disable.
define('ORDER_NOTIFY_EMAIL', 'nouricareuganda@gmail.com');
define('MAIL_FROM', 'orders@yourdomain.com');   // an address on YOUR domain

define('IDLE_SECONDS', 20 * 60);        // auto sign-out after 20 min idle
define('ABSOLUTE_SECONDS', 8 * 3600);   // force sign-in again after 8 hours
define('MAX_UPLOAD_BYTES', 5 * 1024 * 1024);
