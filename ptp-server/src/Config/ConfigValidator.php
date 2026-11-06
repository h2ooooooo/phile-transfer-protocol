<?php

namespace jalsoedesign\PhileTransferProtocol\Config;

class ConfigValidator {
    /**
     * Validates the provided configuration by ensuring that necessary credentials are present.
     *
     * @param Config $config The configuration object to be validated.
     *
     * @return void
     *
     * @throws \Exception
     */
    public static function validateConfig(Config $config): void {
        // Both of these methods will throw an exception if the config doesn't exist
        if ($config->getApiUsername() === '' || $config->getApiPassword() === '' || str_contains($config->getApiUsername(), ':')) {
            throw new \RuntimeException('Explicit credentials are required');
        }

        $root = realpath($config->getApiRootPath());

        if ($root === false || !is_dir($root)) {
            throw new \RuntimeException('Invalid root directory');
        }

        $log = $config->getApiLogPath();

        if ($log !== null && $log !== '') {
            $parent = realpath(dirname($log));

            if ($parent === false || is_link($log)) {
                throw new \RuntimeException('Log parent must exist and not be linked');
            }

            $resolved = realpath($log) ?: $parent . '/' . basename($log);

            foreach ([$root, realpath($_SERVER['DOCUMENT_ROOT'] ?? '')] as $boundary) {
                if (!$boundary) {
                    continue;
                }

                $a = str_replace('\\', '/', $resolved);
                $b = rtrim(str_replace('\\', '/', $boundary), '/');

                if (PHP_OS_FAMILY === 'Windows') {
                    $a = strtolower($a);
                    $b = strtolower($b);
                }

                if ($a === $b || str_starts_with($a, $b . '/')) {
                    throw new \RuntimeException('Logs must be outside served and public roots');
                }
            }
        }
    }
}
