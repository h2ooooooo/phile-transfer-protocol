<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http;

class Response {
    public $httpCode;
    public $contentType;
    public $content;
    public array $headers;

    public static function json($output, $httpCode = 200, array $headers = []) {
        return new Response($httpCode, 'application/json', $output, $headers);
    }

    public static function jsonSuccess($output) {
        $output['success'] = true;

        return static::json($output, 200);
    }

    public function __construct($httpCode, $contentType, $content, array $headers = []) {
        $this->httpCode = $httpCode;
        $this->contentType = $contentType;
        $this->content = $content;
        $this->headers = $headers;
    }

    public function output() {
        if (is_array($this->content)) {
            $this->content = json_encode($this->content, JSON_THROW_ON_ERROR);
        }

        http_response_code($this->httpCode);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');

        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }

        if (!empty($this->contentType)) {
            header('Content-Type: ' . $this->contentType);
        }

        $content = $this->content;

        if (is_resource($content)) {
            while (ob_get_level() > 0) {
                if (!ob_end_clean()) {
                    break;
                }
            }

            ini_set('zlib.output_compression', '0');
            $stat = fstat($content);
            $position = ftell($content);
            $remaining = max(0, $stat['size'] - $position);
            header('Content-Length: ' . $remaining);

            try {
                while ($remaining > 0) {
                    $chunk = fread($content, min(65536, $remaining));

                    if ($chunk === false || $chunk === '') {
                        throw new \RuntimeException('Failed to stream file');
                    }

                    $remaining -= strlen($chunk);
                    echo $chunk;
                    flush();
                }
            } catch (\Throwable $error) {
                // After binary headers, a truncated response must never become JSON.
                error_log('PTP file response ended before all bytes were sent');
            } finally {
                fclose($content);
            }
        } elseif ($content !== null) {
            echo $content;
        }

        die();
    }
}
