<?php

namespace jalsoedesign\PhileTransferProtocol\Log;

use jalsoedesign\PhileTransferProtocol\Config\Config;

class Logger {
    private string $logPath;
    private bool $outputToConsole;
    private bool $logHeaders;
    private bool $logBody;
    private static ?Logger $instance = null;

    private function __construct(string $logPath, bool $outputToConsole = false, bool $logHeaders = false, bool $logBody = false) {
        $this->logPath = $logPath;
        $this->outputToConsole = $outputToConsole;
        $this->logHeaders = $logHeaders;
        $this->logBody = $logBody;
    }

    public static function getInstance(): ?Logger {
        if (self::$instance === null) {
            $config = Config::instance();
            $logPath = $config->getApiLogPath();
            $outputToConsole = $config->getApiLogOutputConsole();
            $logHeaders = $config->getApiLogHeaders();
            $logBody = $config->getApiLogBody();

            if (!empty($logPath)) {
                self::$instance = new self($logPath, $outputToConsole, $logHeaders, $logBody);
            }
        }

        return self::$instance;
    }

    public function log(int $statusCode, string $method, string $endpoint, ?string $action = null, ?array $headers = null, ?string $body = null, ?int $bodyBytes = null): void {
        if ($this->logPath === '') {
            return;
        }

        $timestamp = date('D M d H:i:s Y');
        $clientInfo = $_SERVER['REMOTE_ADDR'] ?? '';
        $fullUrl = $endpoint;

        if ($action !== null) {
            $fullUrl .= '?action=' . rawurlencode($action);
        }

        $method = str_replace([chr(13), chr(10)], '', $method);
        $fullUrl = str_replace([chr(13), chr(10)], '', $fullUrl);
        $logMessage = '[' . $timestamp . '] ' . $clientInfo . ' [' . $statusCode . ']: ' . $method . ' ' . $fullUrl . PHP_EOL;

        if ($this->logHeaders && !empty($headers)) {
            $logMessage .= 'Headers:' . PHP_EOL;

            foreach ($headers as $name => $value) {
                if (!in_array(strtoupper($name), ['ACCEPT', 'CONTENT-TYPE', 'CONTENT-LENGTH'], true)) {
                    $value = '[redacted]';
                }

                $value = str_replace([chr(13), chr(10)], '', $value);
                $logMessage .= '  ' . $name . ': ' . $value . PHP_EOL;
            }
        }

        if ($this->logBody) {
            if ($body !== null) {
                $bodyBytes = strlen($body);
            }

            if ($bodyBytes !== null && $bodyBytes >= 0) {
                $logMessage .= 'Body bytes: ' . $bodyBytes . PHP_EOL;
            }
        }

        if (file_put_contents($this->logPath, $logMessage, FILE_APPEND | LOCK_EX) === false) {
            throw new \RuntimeException('Could not write request log');
        }

        if ($this->outputToConsole) {
            error_log($logMessage);
        }
    }
}
