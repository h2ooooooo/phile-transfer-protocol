<?php

namespace jalsoedesign\PhileTransferProtocol\Config;

class ConfigCore {
    /** @var array */
    protected array $config = [];

    /**
     * Load API config
     *
     * @param array $apiConfig An associative array containing API configuration settings.
     * @return void
     */
    public function load(array $apiConfig): void {
        foreach ($apiConfig as $key => $value) {
            $this->config[$key] = $value;
        }
    }

    /**
     * Parses a string value into a boolean.
     *
     * @param string $value The string value to parse ('true', 'yes', '1' are considered true).
     * @return bool The parsed boolean value.
     */
    private function parseBoolean(string $value): bool {
        $valueLowercase = strtolower($value);

        return in_array($valueLowercase, ['true', 'yes', '1']);
    }

    /**
     * Parses a string value into a float.
     *
     * @param string $value The string value to parse.
     * @return float The parsed float value.
     */
    private function parseFloat(string $value): float {
        return (float)$value;
    }

    /**
     * Parses a string value, returning it unchanged.
     *
     * @param string $value The string value to parse.
     * @return string The original string value.
     */
    private function parseString(string $value): string {
        return $value;
    }

    /**
     * Parses a string value into an integer.
     *
     * @param string $value The string value to parse.
     * @return int The parsed integer value.
     */
    private function parseInteger(string $value): int {
        return (int)$value;
    }

    /**
     * Parses a string value into an array.
     *
     * @param array $value The value to parse.
     * @return array The parsed array value.
     */
    private function parseArray(array $value): array {
        if (is_array($value)) {
            return $value;
        }

        return !empty($value) ? [$value] : [];
    }

    /**
     * Retrieves a configuration value for the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return string|integer|boolean|float|array|null The configuration value if the key exists, or null otherwise.
     */
    public function getConfigValue(string $key): float|int|bool|array|string|null {
        if (!array_key_exists($key, $this->config)) {
            return null;
        }

        return $this->config[$key];
    }

    /**
     * Retrieves a required configuration value for the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return string The configuration value.
     * @throws \Exception If the configuration key does not exist.
     */
    public function requireConfigValue(string $key): string {
        if (!array_key_exists($key, $this->config) || $this->config[$key] === null) {
            throw new \Exception("Missing config value: $key");
        }

        return $this->config[$key];
    }

    // Require values

    /**
     * Retrieves a required string value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return string The string value.
     * @throws \Exception If the configuration key does not exist.
     */
    public function requireString(string $key): string {
        return $this->parseString($this->requireConfigValue($key));
    }

    /**
     * Retrieves a required boolean value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return bool The boolean value.
     * @throws \Exception If the configuration key does not exist.
     */
    public function requireBoolean(string $key): bool {
        return $this->parseBoolean($this->requireConfigValue($key));
    }

    /**
     * Retrieves a required float value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return float The float value.
     * @throws \Exception If the configuration key does not exist.
     */
    public function requireFloat(string $key): float {
        return $this->parseFloat($this->requireConfigValue($key));
    }

    /**
     * Retrieves a required integer value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return int The integer value.
     * @throws \Exception If the configuration key does not exist.
     */
    public function requireInteger(string $key): int {
        return $this->parseInteger($this->requireConfigValue($key));
    }

    /**
     * Retrieves a required array value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return array The array value.
     * @throws \Exception If the configuration key does not exist.
     */
    public function requireArray(string $key): array {
        return $this->parseArray($this->requireConfigValue($key));
    }

    // Get values
    /**
     * Retrieves a string value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return string|null The string value if the key exists, or null otherwise.
     */
    public function getString(string $key): string|null {
        $value = $this->getConfigValue($key);

        return $value !== null ? $this->parseString($value) : null;
    }

    /**
     * Retrieves a boolean value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return bool|null The boolean value if the key exists and valid, or null otherwise.
     */
    public function getBoolean(string $key): bool|null {
        $value = $this->getConfigValue($key);

        return $value !== null ? $this->parseBoolean($value) : null;
    }

    /**
     * Retrieves a float value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return float|null The float value if the key exists and valid, or null otherwise.
     */
    public function getFloat(string $key): float|null {
        $value = $this->getConfigValue($key);

        return $value !== null ? $this->parseFloat($value) : null;
    }

    /**
     * Retrieves an integer value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return int|null The integer value if the key exists and valid, or null otherwise.
     */
    public function getInteger(string $key): int|null {
        $value = $this->getConfigValue($key);

        return $value !== null ? $this->parseInteger($value) : null;
    }

    /**
     * Retrieves an array value associated with the specified key.
     *
     * @param string $key The configuration key to retrieve the value for.
     * @return array|null The array value if the key exists and valid, or null otherwise.
     */
    public function getArray(string $key): array|null {
        $value = $this->getConfigValue($key);

        return $value !== null ? $this->parseArray($value) : null;
    }
}
