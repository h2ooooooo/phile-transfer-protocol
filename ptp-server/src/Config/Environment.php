<?php

namespace jalsoedesign\PhileTransferProtocol\Config;

final class Environment {
    /** Environment overrides .env; PTP_* is canonical, API_* remains compatible. */
    public static function load(string $directory, array $compiled = [], ?string $environmentFile = null): array {
        $envPath = $environmentFile ?? getenv('PTP_ENV_FILE');
        $envPath = $envPath === false ? $directory . '/.env' : $envPath;
        $values = [];

        if ($envPath !== '' && is_file($envPath)) {
            foreach (file($envPath, FILE_IGNORE_NEW_LINES) as $line) {
                $line = trim($line);

                if ($line === '' || $line[0] === '#') {
                    continue;
                }

                if (!preg_match('/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/D', $line, $match)) {
                    throw new \RuntimeException('Invalid environment file');
                }

                $value = trim($match[2]);

                if (strlen($value) >= 2 && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) {
                    $value = substr($value, 1, -1);
                }

                $values[$match[1]] = $value;
            }
        }

        $read = static function (string $key, $fallback = null) use ($values) {
            foreach (['PTP_' . $key, 'API_' . $key] as $name) {
                $value = getenv($name);

                if ($value !== false) {
                    return $value;
                }
            }

            foreach (['PTP_' . $key, 'API_' . $key] as $name) {
                if (array_key_exists($name, $values)) {
                    return $values[$name];
                }
            }

            return $fallback;
        };
        $decode = static function (string $key) use ($compiled) {
            $value = $compiled[$key] ?? '';

            return $value === '' || str_starts_with($value, '@') ? null : base64_decode($value, true);
        };
        $bool = static function ($value): bool {
            $parsed = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            if ($parsed === null) {
                throw new \RuntimeException('Invalid boolean configuration');
            }

            return $parsed;
        };
        $root = $read('ROOT_PATH', $decode('root'));

        if (is_string($root) && $root !== '' && !preg_match('~^(?:[A-Za-z]:[\\\\/]|[\\\\/])~', $root)) {
            $root = $directory . '/' . $root;
        }

        return [
            'apiUsername' => $read('USERNAME', $decode('username')),
            'apiPassword' => $read('PASSWORD', $decode('password')),
            'apiRootPath' => $root,
            'apiLogPath' => $read('LOG_PATH', $decode('log')),
            'apiLogOutputConsole' => $bool($read('LOG_OUTPUT_CONSOLE', false)),
            'apiLogHeaders' => $bool($read('LOG_HEADERS', false)),
            // Body logging records only byte count, never transferred contents.
            'apiLogBody' => $bool($read('LOG_BODY', false)),
            'ignoreFiles' => $envPath === '' ? [] : [['name' => $envPath]],
        ];
    }
}
