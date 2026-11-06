<?php

namespace jalsoedesign\PhileTransferProtocol\Util;

class Utilities {
    public static function normalizePath($path, $directorySeparator = DIRECTORY_SEPARATOR) {
        return preg_replace('~[\\\\/]+~', $directorySeparator, $path);
    }

    public static function removeDirectoryRecursively($dirPath) {
        $files = array_diff(scandir($dirPath), ['.', '..']);

        foreach ($files as $file) {
            $filePath = sprintf('%s/%s', $dirPath, $file);

            if (is_dir($filePath)) {
                static::removeDirectoryRecursively($filePath);
            } else {
                unlink($filePath);
            }
        }

        rmdir($dirPath);
    }
}
