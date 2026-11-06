<?php

// Run from any directory: php ptp-wordpress/build.php
if (PHP_SAPI !== 'cli') {
    exit;
}

if (!class_exists(ZipArchive::class)) {
    throw new RuntimeException('The PHP zip extension is required.');
}

$output = __DIR__ . '/dist';

if (!is_dir($output)) {
    mkdir($output, 0755, true);
}

$zip = new ZipArchive();
$target = $output . '/ptp-wordpress.zip';

if ($zip->open($target, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    throw new RuntimeException('Cannot create ZIP.');
}

$files = ['ptp-wordpress.php', 'plugin.php', 'FolderAccess.php', 'FolderAccessAdmin.php', 'assets/folder-access.js', 'assets/folder-access.css', 'README.md'];

foreach ($files as $file) {
    $zip->addFile(__DIR__ . '/' . $file, 'ptp-wordpress/' . $file);
}
// Explicit allowlist: never package the standalone HTTP entrypoint or credentials.
$shared = ['autoload.php', 'Api/Http/FileApi.php', 'Api/Http/HttpError.php', 'Api/Http/UploadManager.php', 'Api/Http/TransferStorage.php', 'Api/Http/Request/RequestParameterBag.php', 'Api/Http/Request/EncryptedRequest.php', 'Config/Config.php', 'Config/ConfigCore.php', 'Util/Utilities.php', 'Exception/AbstractHttpCodeException.php', 'Exception/HttpException.php', 'Exception/NotFoundException.php', 'Exception/UnauthorizedException.php'];

foreach ($shared as $file) {
    $zip->addFile(dirname(__DIR__) . '/ptp-server/src/' . $file, 'ptp-wordpress/server/' . $file);
}

if (!$zip->close()) {
    throw new RuntimeException('Cannot finish ZIP.');
}

echo $target . PHP_EOL;
