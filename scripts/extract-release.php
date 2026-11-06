<?php

if (PHP_SAPI !== 'cli') {
    exit;
}

$zip = new ZipArchive();

if ($zip->open($argv[1]) !== true) {
    throw new RuntimeException('Cannot open release archive.');
}

for ($index = 0; $index < $zip->numFiles; $index++) {
    $name = str_replace('\\', '/', $zip->getNameIndex($index));

    if (str_starts_with($name, '/') || str_contains($name, ':') || in_array('..', explode('/', $name), true)) {
        throw new RuntimeException('Unsafe archive entry');
    }
}

if (!$zip->extractTo($argv[2])) {
    throw new RuntimeException('Cannot extract release archive.');
}

$zip->close();
