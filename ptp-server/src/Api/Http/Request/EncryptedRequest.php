<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http\Request;

use jalsoedesign\PhileTransferProtocol\Exception\HttpException;

final class EncryptedRequest {
    public const TRANSPORT = 'encrypted-v1';
    public const MAX_PAYLOAD_BYTES = 524288;
    private const CONTEXT = 'PTP encrypted request v1';
    private const MAX_METADATA_BYTES = 16384;

    public static function decode(string $body, string $password): array {
        if (!function_exists('openssl_decrypt')) {
            throw new HttpException(503, 'Encrypted POST requires the PHP OpenSSL extension. Enable it on the endpoint host.', 'ptp_transport_unavailable');
        }

        if ($password === '' || strlen($body) > 2097152) {
            throw self::invalid();
        }

        try {
            $envelope = json_decode($body, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw self::invalid();
        }

        if (!is_array($envelope) || ($envelope['version'] ?? null) !== 1) {
            throw self::invalid();
        }

        $fields = [];

        foreach (['nonce', 'tag', 'data'] as $name) {
            $value = $envelope[$name] ?? null;

            if (!is_string($value)) {
                throw self::invalid();
            }

            $decoded = base64_decode($value, true);

            if ($decoded === false || base64_encode($decoded) !== $value) {
                throw self::invalid();
            }

            $fields[$name] = $decoded;
        }

        if (strlen($fields['nonce']) !== 12 || strlen($fields['tag']) !== 16 || strlen($fields['data']) > self::MAX_PAYLOAD_BYTES + self::MAX_METADATA_BYTES + 4) {
            throw self::invalid();
        }

        $key = hash_hkdf('sha256', $password, 32, self::CONTEXT, $fields['nonce']);
        $plaintext = openssl_decrypt($fields['data'], 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $fields['nonce'], $fields['tag'], self::CONTEXT);

        if ($plaintext === false || strlen($plaintext) < 4) {
            throw self::invalid();
        }

        $length = unpack('Nlength', substr($plaintext, 0, 4))['length'];

        if ($length > self::MAX_METADATA_BYTES || $length > strlen($plaintext) - 4 || strlen($plaintext) - 4 - $length > self::MAX_PAYLOAD_BYTES) {
            throw self::invalid();
        }

        try {
            $metadata = json_decode(substr($plaintext, 4, $length), true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw self::invalid();
        }

        if (!is_array($metadata) || !in_array($metadata['method'] ?? null, ['GET', 'POST', 'DELETE'], true) || !isset($metadata['parameters']) || !is_array($metadata['parameters'])) {
            throw self::invalid();
        }

        foreach ($metadata['parameters'] as $name => $value) {
            if (!is_string($name) || !is_string($value)) {
                throw self::invalid();
            }
        }

        return ['method' => $metadata['method'], 'parameters' => $metadata['parameters'], 'body' => substr($plaintext, 4 + $length)];
    }

    public static function authorizationPassword(string $authorization = ''): string {
        if ($authorization === '') {
            $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        }

        if (is_string($authorization) && str_starts_with($authorization, 'Basic ')) {
            $decoded = base64_decode(substr($authorization, 6), true);

            if (is_string($decoded) && str_contains($decoded, ':')) {
                return explode(':', $decoded, 2)[1];
            }
        }

        return (string)($_SERVER['PHP_AUTH_PW'] ?? '');
    }

    private static function invalid(): HttpException {
        return new HttpException(400, 'Invalid encrypted PTP request. Check that the client and endpoint are updated and use the same API password.', 'ptp_transport_invalid');
    }
}
