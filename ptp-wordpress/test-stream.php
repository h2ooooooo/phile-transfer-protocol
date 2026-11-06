<?php

// Runs the real serving callback in a child process so output buffering stays observable.
if (PHP_SAPI !== 'cli') {
    exit;
}

define('ABSPATH', __DIR__);
require ($argv[1] ?? __DIR__) . '/plugin.php';

final class PTP_TestBrokenStream {
    public $context;
    private int $position = 0;
    private bool $failure = false;

    public function stream_open(string $path, string $mode, int $options, ?string &$openedPath): bool {
        $this->failure = str_contains($path, 'failure');

        return true;
    }

    public function stream_read(int $count) {
        if ($this->failure) {
            return false;
        }

        if ($this->position > 0) {
            return '';
        }

        $this->position = 3;

        return 'cut';
    }

    public function stream_eof(): bool {
        return !$this->failure && $this->position > 0;
    }

    public function stream_tell(): int {
        return $this->position;
    }

    public function stream_stat(): array {
        return ['size' => 8];
    }
}

$source = $argv[2];

if (in_array($source, ['failure', 'truncated'], true)) {
    stream_wrapper_register('ptptest', PTP_TestBrokenStream::class);
    $stream = fopen('ptptest://' . $source, 'rb');
} elseif ($source === 'hello') {
    $stream = fopen('php://temp', 'w+b');
    fwrite($stream, 'hi');
    rewind($stream);
} else {
    $stream = fopen($source, 'rb');
}

$response = new class () {
    public function get_status(): int {
        return 200;
    }
};
$server = new class () {
    public array $headers = [];

    public function send_header(string $name, string $value): void {
        $this->headers[$name] = $value;
    }
};
$reflection = new ReflectionClass(PTP_WordPress::class);
$plugin = $reflection->newInstanceWithoutConstructor();
$property = $reflection->getProperty('streams');
$property->setValue($plugin, [spl_object_id($response) => [$response, $stream]]);

ob_start();
echo 'This stale output must never enter the download.';

try {
    $served = $plugin->serve(false, $response, null, $server);
    $result = ['served' => $served, 'buffers' => ob_get_level(), 'headers' => $server->headers, 'peakMemory' => memory_get_peak_usage(true)];
    fwrite(STDERR, json_encode($result, JSON_THROW_ON_ERROR));
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['error' => $error->getMessage(), 'streamClosed' => !is_resource($stream), 'headers' => $server->headers], JSON_THROW_ON_ERROR));
    exit(1);
}
