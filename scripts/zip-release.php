<?php

if (PHP_SAPI !== 'cli') {
    exit;
}

$configuration = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$archive = new ZipArchive();

if ($archive->open($configuration['output'], ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    throw new RuntimeException('Cannot create release ZIP.');
}

foreach ($configuration['files'] as $file) {
    if (!$archive->addFile($file['source'], $file['name'])) {
        throw new RuntimeException('Cannot package ' . $file['name']);
    }
}

if (!$archive->close()) {
    throw new RuntimeException('Cannot finish release ZIP.');
}
