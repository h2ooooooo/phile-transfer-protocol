<?php

use PHPUnit\Framework\TestCase;
use jalsoedesign\PhileTransferProtocol\Api\Http\FileApi;
use jalsoedesign\PhileTransferProtocol\Api\Http\HttpError;
use jalsoedesign\PhileTransferProtocol\Api\Http\TransferStorage;
use jalsoedesign\PhileTransferProtocol\Api\Http\UploadManager;
use jalsoedesign\PhileTransferProtocol\Config\Config;

class UploadManagerTest extends TestCase {
    private string $root;
    private FileApi $api;
    private UploadManager $uploads;

    protected function setUp(): void {
        $this->root = sys_get_temp_dir() . '/ptp-upload-test-' . bin2hex(random_bytes(8));
        mkdir($this->root, 0700);
        Config::instance()->load(['ignoreFiles' => []]);
        $this->api = new FileApi($this->root);
        $this->uploads = new UploadManager($this->api, 'test');
    }

    protected function tearDown(): void {
        Config::instance()->load(['ignoreFiles' => []]);
        $storage = TransferStorage::directory($this->root);

        foreach ([$this->root, $storage] as $directory) {
            $resolved = realpath($directory);
            $temporary = realpath(sys_get_temp_dir());

            if ($resolved === false || dirname($resolved) !== $temporary) {
                throw new RuntimeException('Unexpected test cleanup directory');
            }

            $entries = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($resolved, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

            foreach ($entries as $entry) {
                if ($entry->isDir() && !$entry->isLink()) {
                    rmdir($entry->getPathname());
                } else {
                    unlink($entry->getPathname());
                }
            }

            rmdir($resolved);
        }
    }

    private function expectStatus(int $status, callable $callback): void {
        try {
            $callback();
            $this->fail('Expected HTTP error ' . $status);
        } catch (Throwable $error) {
            $failure = HttpError::fromException($error);
            $this->assertSame($status, $failure['status'], $error->getMessage());
        }
    }

    private function replace(string $path, string $payload, bool $append = false, int $start = 0): array {
        $session = $this->uploads->begin($path, $append, $start);
        $this->uploads->write($session['id'], 0, $payload);

        return $this->uploads->commit($session['id'], strlen($payload), hash('sha256', $payload));
    }

    public function testOriginalSurvivesUntilVerifiedCommitAndStagingIsProtected(): void {
        file_put_contents($this->root . '/target.php', 'ORIGINAL');
        $session = $this->uploads->begin('target.php');
        $stageName = '.ptp-upload-' . $session['id'] . '.part';
        $this->uploads->write($session['id'], 0, 'REPLACEMENT');
        $this->assertSame('ORIGINAL', file_get_contents($this->root . '/target.php'));
        $this->assertNotContains($stageName, array_column($this->api->list('/'), 'name'));
        $this->expectStatus(401, fn () => $this->api->read($stageName));
        $this->expectStatus(409, fn () => $this->uploads->commit($session['id'], 11, str_repeat('0', 64)));
        $this->expectStatus(409, fn () => $this->uploads->commit($session['id'], 10, hash('sha256', 'REPLACEMENT')));
        $this->assertSame('ORIGINAL', file_get_contents($this->root . '/target.php'));
        $result = $this->uploads->commit($session['id'], 11, hash('sha256', 'REPLACEMENT'));
        $this->assertSame(11, $result['fileSize']);
        $this->assertSame('REPLACEMENT', file_get_contents($this->root . '/target.php'));
        $this->assertFileDoesNotExist($this->root . '/' . $stageName);
    }

    public function testAppendResumeAndEmptyReplacementVerifyOnlyIncomingBytes(): void {
        file_put_contents($this->root . '/target.txt', 'abcdef');
        $this->replace('target.txt', 'XY', true);
        $this->assertSame('abcdefXY', file_get_contents($this->root . '/target.txt'));
        $this->replace('target.txt', 'ZZ', false, 2);
        $this->assertSame('abZZefXY', file_get_contents($this->root . '/target.txt'));
        $this->replace('target.txt', '');
        $this->assertSame('', file_get_contents($this->root . '/target.txt'));
    }

    public function testDuplicateAndOutOfOrderChunksAreRejectedWithoutChangingProgress(): void {
        $session = $this->uploads->begin('target.txt');
        $this->uploads->write($session['id'], 0, 'A');
        $this->expectStatus(409, fn () => $this->uploads->write($session['id'], 0, 'B'));
        $this->expectStatus(409, fn () => $this->uploads->write($session['id'], 2, 'C'));
        $progress = $this->uploads->write($session['id'], 1, 'D');
        $this->assertSame(2, $progress['offset']);
        $this->uploads->commit($session['id'], 2, hash('sha256', 'AD'));
        $this->assertSame('AD', file_get_contents($this->root . '/target.txt'));
    }

    public function testChangedDestinationAndWrongOwnerCannotCommit(): void {
        file_put_contents($this->root . '/target.txt', 'ORIGINAL');
        $session = $this->uploads->begin('target.txt');
        $this->uploads->write($session['id'], 0, 'NEW');
        $otherOwner = new UploadManager($this->api, 'different-user');
        $this->expectStatus(404, fn () => $otherOwner->write($session['id'], 3, 'X'));
        $this->expectStatus(404, fn () => $otherOwner->abort($session['id']));
        $this->api->write('target.txt', 'CONCURRENT');
        $this->expectStatus(409, fn () => $this->uploads->commit($session['id'], 3, hash('sha256', 'NEW')));
        $this->uploads->abort($session['id']);
        $this->uploads->abort($session['id']);
        $this->assertSame('CONCURRENT', file_get_contents($this->root . '/target.txt'));
    }

    public function testAbortAfterDestinationBecomesDirectoryStillRemovesStaging(): void {
        file_put_contents($this->root . '/target.txt', 'ORIGINAL');
        $session = $this->uploads->begin('target.txt');
        $this->api->delete('target.txt');
        $this->api->mkdir('target.txt');
        $this->uploads->abort($session['id']);
        $this->assertFileDoesNotExist($this->root . '/.ptp-upload-' . $session['id'] . '.part');
        $this->assertDirectoryExists($this->root . '/target.txt');
    }

    public function testExpiredSessionCleanupPreservesDestination(): void {
        $uploads = new class ($this->api, 'test') extends UploadManager {
            public int $clock = 10000;

            protected function currentTime(): int {
                return $this->clock;
            }
        };
        file_put_contents($this->root . '/target.txt', 'ORIGINAL');
        $session = $uploads->begin('target.txt');
        $uploads->write($session['id'], 0, 'NEW');
        $uploads->clock += UploadManager::SESSION_TTL + 1;
        $this->expectStatus(410, fn () => $uploads->commit($session['id'], 3, hash('sha256', 'NEW')));
        $this->assertSame('ORIGINAL', file_get_contents($this->root . '/target.txt'));
        $this->assertFileDoesNotExist($this->root . '/.ptp-upload-' . $session['id'] . '.part');

        $expired = $uploads->begin('target.txt');
        $this->api->delete('target.txt');
        $this->api->mkdir('target.txt');
        $uploads->clock += UploadManager::SESSION_TTL + 1;
        $replacement = $uploads->begin('different.txt');
        $this->assertFileDoesNotExist($this->root . '/.ptp-upload-' . $expired['id'] . '.part');
        $uploads->abort($replacement['id']);
    }

    public function testPositiveOffsetDoesNotCreateParentsOrFiles(): void {
        $this->expectStatus(400, fn () => $this->api->write('missing/child/file.txt', 'X', false, 1));
        $this->assertDirectoryDoesNotExist($this->root . '/missing');
        $this->expectStatus(400, fn () => $this->uploads->begin('missing/child/file.txt', false, 1));
        $this->assertDirectoryDoesNotExist($this->root . '/missing');
    }

    public function testCannotRenameAnAncestorOfPendingUpload(): void {
        mkdir($this->root . '/folder');
        $session = $this->uploads->begin('folder/target.txt');
        $this->expectStatus(409, fn () => $this->api->rename('folder', 'moved'));
        $this->uploads->abort($session['id']);
        $this->assertTrue($this->api->rename('folder', 'moved'));
    }

    public function testCleanupToleratesAnExternallyMovedParent(): void {
        mkdir($this->root . '/folder');
        $session = $this->uploads->begin('folder/file.txt');
        rename($this->root . '/folder', $this->root . '/externally-moved');
        $this->uploads->abort($session['id']);
        $next = $this->uploads->begin('next.txt');
        $this->uploads->abort($next['id']);
        $this->assertDirectoryExists($this->root . '/externally-moved');
    }

    public function testConcurrentSessionChunksAndCommitsAreSerialized(): void {
        $sameSession = $this->uploads->begin('chunks.txt');
        $results = $this->race('write', [$sameSession['id'], $sameSession['id']], ['AAA', 'BBB']);
        $statuses = array_column($results, 'status');
        sort($statuses);
        $this->assertSame([200, 409], $statuses);
        $winner = $results[0]['status'] === 200 ? 'AAA' : 'BBB';
        $this->uploads->commit($sameSession['id'], 3, hash('sha256', $winner));
        $this->assertSame($winner, file_get_contents($this->root . '/chunks.txt'));

        file_put_contents($this->root . '/commits.txt', 'ORIGINAL');
        $first = $this->uploads->begin('commits.txt');
        $second = $this->uploads->begin('commits.txt');
        $this->uploads->write($first['id'], 0, 'FIRST');
        $this->uploads->write($second['id'], 0, 'SECOND');
        $results = $this->race('commit', [$first['id'], $second['id']], ['FIRST', 'SECOND']);
        $statuses = array_column($results, 'status');
        sort($statuses);
        $this->assertSame([200, 409], $statuses);
        $winner = $results[0]['status'] === 200 ? 'FIRST' : 'SECOND';
        $this->assertSame($winner, file_get_contents($this->root . '/commits.txt'));
        $this->uploads->abort($first['id']);
        $this->uploads->abort($second['id']);
    }

    private function race(string $operation, array $ids, array $payloads): array {
        $autoload = dirname(__DIR__) . '/src/autoload.php';
        $barrier = $this->root . '/barrier-' . bin2hex(random_bytes(4));
        $script = 'require ' . var_export($autoload, true) . '; '
            . '$uploads = new \\jalsoedesign\\PhileTransferProtocol\\Api\\Http\\UploadManager(new \\jalsoedesign\\PhileTransferProtocol\\Api\\Http\\FileApi($argv[1]), \'test\'); '
            . 'file_put_contents($argv[5] . $argv[6], \'ready\'); $deadline = microtime(true) + 10; '
            . 'while (!file_exists($argv[5]) && microtime(true) < $deadline) { usleep(1000); } '
            . 'try { if ($argv[2] === \'write\') { $uploads->write($argv[3], 0, $argv[4]); } '
            . 'else { $uploads->commit($argv[3], strlen($argv[4]), hash(\'sha256\', $argv[4])); } '
            . 'echo json_encode([\'status\' => 200]); } catch (\\Throwable $error) { '
            . 'echo json_encode(\\jalsoedesign\\PhileTransferProtocol\\Api\\Http\\HttpError::fromException($error)); }';
        $processes = [];

        try {
            foreach ($ids as $index => $id) {
                $pipes = [];
                $process = proc_open([PHP_BINARY, '-r', $script, $this->root, $operation, $id, $payloads[$index], $barrier, (string)$index], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, null, ['bypass_shell' => true]);
                $this->assertIsResource($process);
                fclose($pipes[0]);
                $processes[] = ['process' => $process, 'stdout' => $pipes[1], 'stderr' => $pipes[2]];
            }

            $deadline = microtime(true) + 10;

            while ((!file_exists($barrier . '0') || !file_exists($barrier . '1')) && microtime(true) < $deadline) {
                usleep(1000);
            }

            $this->assertFileExists($barrier . '0');
            $this->assertFileExists($barrier . '1');
            file_put_contents($barrier, 'go');
            $results = [];

            foreach ($processes as $process) {
                $output = stream_get_contents($process['stdout']);
                $errors = stream_get_contents($process['stderr']);
                $this->assertSame('', $errors);
                $results[] = json_decode($output, true, 32, JSON_THROW_ON_ERROR);
            }

            return $results;
        } finally {
            foreach ($processes as $process) {
                fclose($process['stdout']);
                fclose($process['stderr']);
                proc_terminate($process['process']);
                proc_close($process['process']);
            }
        }
    }

    public function testPaginationReadsMetadataOnlyForReturnedEntries(): void {
        $api = new class ($this->root) extends FileApi {
            public int $metadataReads = 0;

            public function get(string $fileName, bool $resolvePath = true): ?array {
                $this->metadataReads++;

                return parent::get($fileName, $resolvePath);
            }
        };

        for ($index = 0; $index < 200; $index++) {
            file_put_contents($this->root . '/entry-' . $index . '.txt', 'x');
        }

        $page = $api->listPage('.', 40, 7);
        $this->assertCount(7, $page['entries']);
        $this->assertSame(7, $api->metadataReads);
        $this->assertSame(47, $page['nextOffset']);
        $this->expectStatus(400, fn () => $api->listPage('.', 0, 501));
    }
}
