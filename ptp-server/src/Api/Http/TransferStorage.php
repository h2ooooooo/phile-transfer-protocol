<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http;

final class TransferStorage {
    public static function directory(string $root): string {
        $root = self::normalize($root);
        $directory = sys_get_temp_dir() . '/ptp-transfers-' . hash('sha256', $root);

        if (is_link($directory)) {
            throw new \RuntimeException('Transfer storage cannot be a link');
        }

        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new \RuntimeException('Could not create transfer storage');
        }

        $resolved = realpath($directory);

        if ($resolved === false) {
            throw new \RuntimeException('Could not resolve transfer storage');
        }

        $normalized = self::normalize($resolved);

        if ($normalized === $root || str_starts_with($normalized, $root . '/')) {
            throw new \RuntimeException('Transfer storage must be outside the served root');
        }

        if (!chmod($directory, 0700)) {
            throw new \RuntimeException('Could not protect transfer storage');
        }

        return $resolved;
    }

    public static function normalize(string $path): string {
        $path = rtrim(str_replace('\\', '/', $path), '/');

        if (PHP_OS_FAMILY === 'Windows') {
            $path = strtolower($path);
        }

        return $path;
    }

    /** Fixed lock stripes prevent unbounded lock files without unlinking a live lock. */
    public static function withLocks(string $root, string $kind, array $keys, callable $callback, int $operation = LOCK_EX) {
        $directory = self::directory($root);
        $names = [];

        foreach ($keys as $key) {
            $names[] = $kind . '-' . substr(hash('sha256', self::normalize($key)), 0, 2) . '.lock';
        }

        $names = array_unique($names);
        sort($names, SORT_STRING);
        $handles = [];

        try {
            foreach ($names as $name) {
                $path = $directory . '/' . $name;

                if (is_link($path)) {
                    throw new \RuntimeException('Transfer lock cannot be a link');
                }

                $handle = fopen($path, 'c+b');

                if ($handle === false) {
                    throw new \RuntimeException('Could not open transfer lock');
                }

                $handles[] = $handle;

                if (!chmod($path, 0600) || !flock($handle, $operation)) {
                    throw new \RuntimeException('Could not acquire transfer lock');
                }
            }

            return $callback();
        } finally {
            foreach (array_reverse($handles) as $handle) {
                fclose($handle);
            }
        }
    }
}
