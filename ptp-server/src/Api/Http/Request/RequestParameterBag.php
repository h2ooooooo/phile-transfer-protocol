<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http\Request;

class RequestParameterBag {
    public const MAX_BODY_BYTES = 4194304;

    private string $bagName;
    private array $bagContent;
    private bool $provideRaw;
    private ?string $rawBody;

    public function __construct(string $bagName, array $bagContent, bool $provideRaw = false, ?string $rawBody = null) {
        $this->bagName = $bagName;
        $this->bagContent = $bagContent;
        $this->provideRaw = $provideRaw;
        $this->rawBody = $rawBody;
    }

    public function getRaw(): string {
        if (!$this->provideRaw) {
            throw new \RuntimeException('This parameter bag has no raw body');
        }

        return $this->rawBody ?? self::readRawBody();
    }

    public static function readRawBody(): string {
        $declaredLength = $_SERVER['CONTENT_LENGTH'] ?? null;

        if ($declaredLength !== null && (!ctype_digit((string)$declaredLength) || (float)$declaredLength > self::MAX_BODY_BYTES)) {
            throw new \jalsoedesign\PhileTransferProtocol\Exception\HttpException(413, 'Request body exceeds the upload chunk limit', 'ptp_payload_too_large');
        }

        $handle = fopen('php://input', 'rb');

        if ($handle === false) {
            throw new \RuntimeException('Could not open request body');
        }

        try {
            $content = stream_get_contents($handle, self::MAX_BODY_BYTES + 1);

            if ($content === false) {
                throw new \RuntimeException('Could not read request body');
            }

            if (strlen($content) > self::MAX_BODY_BYTES) {
                throw new \jalsoedesign\PhileTransferProtocol\Exception\HttpException(413, 'Request body exceeds the upload chunk limit', 'ptp_payload_too_large');
            }

            return $content;
        } finally {
            fclose($handle);
        }
    }

    public function requireString(string $key): string {
        $value = $this->requireValue($key);

        if (!is_string($value) || $value === '') {
            throw new \InvalidArgumentException('Invalid string parameter: ' . $key);
        }

        return $value;
    }

    public function getIsSet(string $key): bool {
        return isset($this->bagContent[$key]);
    }

    public function getIsEmpty(string $key): bool {
        return empty($this->bagContent[$key]);
    }

    public function getString(string $key, $default = ''): string {
        $value = $this->getValue($key, $default);

        if (!is_string($value)) {
            throw new \InvalidArgumentException('Invalid string parameter: ' . $key);
        }

        return $value;
    }

    public function getBoolean(string $key, $default = false): bool {
        $input = $this->getValue($key, $default);

        if (!is_scalar($input)) {
            throw new \InvalidArgumentException('Invalid boolean parameter: ' . $key);
        }

        $value = filter_var($input, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        if ($value === null) {
            throw new \InvalidArgumentException('Invalid boolean parameter: ' . $key);
        }

        return $value;
    }

    public function getInteger(string $key, $default = 0): int {
        $input = $this->getValue($key, $default);

        if (!is_string($input) && !is_int($input)) {
            throw new \InvalidArgumentException('Invalid integer parameter: ' . $key);
        }

        $value = filter_var($input, FILTER_VALIDATE_INT);

        if ($value === false || $value < 0) {
            throw new \InvalidArgumentException('Invalid integer parameter: ' . $key);
        }

        return $value;
    }

    public function requireValue(string $key) {
        $value = $this->getValue($key);

        if ($value === null) {
            throw new \InvalidArgumentException('Missing required parameter: ' . $key);
        }

        return $value;
    }

    private function getValue(string $key, $default = null) {
        if (!array_key_exists($key, $this->bagContent)) {
            return $default;
        }

        return $this->bagContent[$key];
    }
}
