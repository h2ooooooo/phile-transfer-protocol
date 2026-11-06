<?php

use PHPUnit\Framework\TestCase;
use GuzzleHttp\Client;
use jalsoedesign\PhileTransferProtocol\Api\Http\FileApi;
use jalsoedesign\PhileTransferProtocol\Config\Config;

class TransferRegressionTest extends TestCase {
    private Client $client;
    private string $root;
    protected function setUp(): void {
        $this->root = getenv('PTP_TEST_ROOT') ?: throw new RuntimeException('Run through scripts/test.cjs');
        $this->client = new Client(['base_uri' => getenv('PTP_TEST_ENDPOINT'), 'auth' => ['test', 'test'], 'http_errors' => false]);
    }
    private function write(string $path, string $body, array $options = []): void {
        $r = $this->client->post('', ['query' => array_merge(['action' => 'write', 'path' => $path], $options), 'body' => $body]);
        $this->assertSame(200, $r->getStatusCode(), (string)$r->getBody());
    }
    public function testOverwriteAppendResumeAndEmpty(): void {
        $this->write('bytes.txt', 'OLD');
        $this->write('bytes.txt', 'ABCDEF', ['append' => 'false']);
        $this->assertSame('ABCDEF', file_get_contents($this->root . '/bytes.txt'));
        $this->write('bytes.txt', 'XYZ', ['start' => 3]);
        $this->assertSame('ABCXYZ', file_get_contents($this->root . '/bytes.txt'));
        $this->write('bytes.txt', '!', ['append' => 'true']);
        $this->assertSame('ABCXYZ!', file_get_contents($this->root . '/bytes.txt'));
        $this->write('bytes.txt', '', ['append' => 0]);
        $this->assertSame('', file_get_contents($this->root . '/bytes.txt'));
        $this->write('new-parent/child.txt', 'CHILD');
        $this->assertSame('CHILD', file_get_contents($this->root . '/new-parent/child.txt'));
    }
    public function testZeroAndBinaryReadExactly(): void {
        foreach (['0', "\x00\xff\r\n\x80"] as $data) {
            $this->write('binary.dat', $data);
            $r = $this->client->get('', ['query' => ['action' => 'read', 'path' => 'binary.dat']]);
            $this->assertSame(200, $r->getStatusCode());
            $this->assertSame($data, (string)$r->getBody());
        }
    }
    public function testDownloadLargerThanServerMemoryLimit(): void {
        $file = $this->root . '/large.bin';
        $handle = fopen($file, 'wb');

        for ($i = 0;$i < 24;$i++) {
            fwrite($handle, str_repeat('x', 1024 * 1024));
        }

        fclose($handle);
        $sink = $this->root . '/large-downloaded.bin';
        $r = $this->client->get('', ['query' => ['action' => 'read', 'path' => 'large.bin'], 'sink' => $sink]);
        $this->assertSame(200, $r->getStatusCode());
        $this->assertSame(hash_file('sha256', $file), hash_file('sha256', $sink));
    }
    public function testInvalidOffsetsAndBooleansDoNotModifyFiles(): void {
        $this->write('offset.txt', 'UNCHANGED');

        foreach ([['start' => -1], ['start' => 999], ['append' => 'nonsense']] as $options) {
            $r = $this->client->post('', ['query' => array_merge(['action' => 'write', 'path' => 'offset.txt'], $options), 'body' => 'BAD']);
            $this->assertSame(400, $r->getStatusCode());
            $this->assertSame('UNCHANGED', file_get_contents($this->root . '/offset.txt'));
        }
    }
    public function testShortWritesAreRetriedAndFailuresThrow(): void {
        Config::instance()->load(['ignoreFiles' => []]);
        $short = new class ($this->root) extends FileApi {
            protected function writeChunk($handle, string $content) {
                return fwrite($handle, substr($content, 0, 2));
            }
        };
        $short->write('short.txt', 'COMPLETE');
        $this->assertSame('COMPLETE', file_get_contents($this->root . '/short.txt'));
        $failure = new class ($this->root) extends FileApi {
            protected function writeChunk($handle, string $content) {
                return false;
            }
        };
        $this->expectExceptionMessage('Incomplete file write');
        $failure->write('failed.txt', 'NEVER ACKNOWLEDGE');
    }
    public function testProtectedFilesAreNotListedOrReadable(): void {
        $protected = $this->root . '/protected.php';
        file_put_contents($protected, 'secret');
        Config::instance()->load(['ignoreFiles' => [['name' => $protected]]]);
        $api = new FileApi($this->root);
        $this->assertNotContains('protected.php', array_column($api->list('/'), 'name'));

        try {
            $this->expectException(\jalsoedesign\PhileTransferProtocol\Exception\UnauthorizedException::class);
            $api->read('protected.php');
        } finally {
            Config::instance()->load(['ignoreFiles' => []]);
        }
    }

    public function testOversizedBodiesCannotExhaustTheServerBeforeRejection(): void {
        $body = \GuzzleHttp\Psr7\Utils::streamFor(tmpfile());

        for ($index = 0; $index < 24; $index++) {
            $body->write(str_repeat('x', 1024 * 1024));
        }

        $body->rewind();
        $unauthenticated = new Client(['base_uri' => getenv('PTP_TEST_ENDPOINT'), 'http_errors' => false]);
        $options = ['query' => ['action' => 'write', 'path' => 'oversized-body.txt'], 'headers' => ['Content-Type' => 'application/octet-stream'], 'body' => $body];
        $response = $unauthenticated->post('', $options);
        $this->assertSame(401, $response->getStatusCode());
        $this->assertSame('ptp_unauthorized', json_decode((string)$response->getBody(), true)['code']);
        $body->rewind();
        $response = $this->client->post('', $options);
        $this->assertSame(413, $response->getStatusCode());
        $this->assertSame('ptp_payload_too_large', json_decode((string)$response->getBody(), true)['code']);
        $this->assertFileDoesNotExist($this->root . '/oversized-body.txt');
        $body->close();
    }

    public function testMaximumAllowedChunkWritesWithinServerMemoryLimit(): void {
        $content = str_repeat('x', \jalsoedesign\PhileTransferProtocol\Api\Http\Request\RequestParameterBag::MAX_BODY_BYTES);
        $this->write('maximum-chunk.txt', $content);
        $this->assertSame(hash('sha256', $content), hash_file('sha256', $this->root . '/maximum-chunk.txt'));
    }
}
