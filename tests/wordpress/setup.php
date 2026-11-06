<?php

$root = WP_CONTENT_DIR . '/ptp-fixtures';

if (!is_dir($root) && !mkdir($root, 0755, true)) {
    throw new RuntimeException('Cannot create the HTTP test root.');
}

update_option('ptp_enabled', true, false);
update_option('ptp_permissions', 'read_write', false);
update_option('ptp_access', ['root' => $root, 'rules' => ['/' => true]], false);

$muPlugins = WP_CONTENT_DIR . '/mu-plugins';

if (!is_dir($muPlugins) && !mkdir($muPlugins, 0755, true)) {
    throw new RuntimeException('Cannot create the HTTP test plugin directory.');
}

// Exercise downloads with a real output-buffering plugin loaded by WordPress.
file_put_contents($muPlugins . '/ptp-test-buffer.php', '<?php ob_start();');

$handle = fopen($root . '/large.bin', 'wb');

if ($handle === false) {
    throw new RuntimeException('Cannot create the large download fixture.');
}

try {
    $chunk = str_repeat('P', 65536);

    for ($index = 0; $index < 1024; $index++) {
        if (fwrite($handle, $chunk) !== strlen($chunk)) {
            throw new RuntimeException('Cannot write the large download fixture.');
        }
    }
} finally {
    fclose($handle);
}
