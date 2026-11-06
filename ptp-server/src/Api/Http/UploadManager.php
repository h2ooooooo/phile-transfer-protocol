<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http;

use jalsoedesign\PhileTransferProtocol\Api\Http\Request\RequestParameterBag;
use jalsoedesign\PhileTransferProtocol\Exception\HttpException;

class UploadManager {
    public const SESSION_TTL = 3600;
    public const MAX_SESSIONS = 128;

    private FileApi $fileApi;
    private string $scope;
    private string $directory;

    public function __construct(FileApi $fileApi, string $scope = '') {
        $this->fileApi = $fileApi;
        $this->scope = $scope;
        $this->directory = TransferStorage::directory($fileApi->getRootPath());
    }

    public function begin(string $path, bool $append = false, int $start = 0): array {
        if ($path === '' || $start < 0 || ($append && $start !== 0)) {
            throw new \InvalidArgumentException('Invalid upload parameters');
        }

        return TransferStorage::withLocks($this->fileApi->getRootPath(), 'catalog', ['sessions'], function () use ($path, $append, $start): array {
            if ($this->cleanupExpired() >= self::MAX_SESSIONS) {
                throw new HttpException(409, 'Too many unfinished uploads', 'ptp_conflict');
            }

            return $this->fileApi->withPathLocks([$path], function () use ($path, $append, $start): array {
                $target = $this->fileApi->resolveUploadPath($path);
                $original = $this->fingerprint($target);
                $originalSize = $original['size'] ?? 0;

                if ($start > $originalSize) {
                    throw new \InvalidArgumentException('Offset exceeds file size');
                }

                $parent = dirname($target);

                if (!is_dir($parent) && !mkdir($parent, 0755, true) && !is_dir($parent)) {
                    throw new \RuntimeException('Could not create upload directory');
                }

                $target = $this->fileApi->resolveUploadPath($path);
                $baseOffset = $append ? $originalSize : $start;
                $preserveOriginal = $append || $start > 0;
                $metadata = [
                    'id' => bin2hex(random_bytes(32)),
                    'scope' => $this->scope,
                    'path' => $path,
                    'original' => $original,
                    'baseOffset' => $baseOffset,
                    'preservedSize' => $preserveOriginal ? $originalSize : 0,
                    'offset' => 0,
                    'expiresAt' => $this->currentTime() + self::SESSION_TTL,
                ];
                $stage = $this->stagePath($target, $metadata['id']);
                $created = false;

                try {
                    // Persist cleanup information before creating any staging bytes.
                    $this->save($metadata);
                    $handle = fopen($stage, 'x+b');

                    if ($handle === false) {
                        throw new \RuntimeException('Could not create upload staging file');
                    }

                    $created = true;

                    try {
                        if (!chmod($stage, 0600)) {
                            throw new \RuntimeException('Could not protect upload staging file');
                        }

                        if ($preserveOriginal && $original !== null) {
                            $source = fopen($target, 'rb');

                            if ($source === false) {
                                throw new \RuntimeException('Could not open original file');
                            }

                            try {
                                $copied = stream_copy_to_stream($source, $handle);

                                if ($copied !== $originalSize) {
                                    throw new HttpException(409, 'Destination changed during upload setup', 'ptp_conflict');
                                }
                            } finally {
                                fclose($source);
                            }
                        }

                        if (!fflush($handle)) {
                            throw new \RuntimeException('Could not flush upload staging file');
                        }
                    } finally {
                        fclose($handle);
                    }

                    if ($preserveOriginal && $original !== null && hash_file('sha256', $stage) !== $original['sha256']) {
                        throw new HttpException(409, 'Destination changed during upload setup', 'ptp_conflict');
                    }

                    return $this->progress($metadata);
                } catch (\Throwable $error) {
                    if ($created && is_file($stage) && !unlink($stage)) {
                        error_log('PTP could not remove failed upload staging file');
                    }

                    $this->removeMetadata($metadata['id']);

                    throw $error;
                }
            });
        });
    }

    public function write(string $id, int $offset, string $content): array {
        if ($offset < 0) {
            throw new \InvalidArgumentException('Invalid upload offset');
        }

        if (strlen($content) > RequestParameterBag::MAX_BODY_BYTES) {
            throw new HttpException(413, 'Request body exceeds the upload chunk limit', 'ptp_payload_too_large');
        }

        return $this->withSession($id, function (array $metadata) use ($offset, $content): array {
            if ($offset !== $metadata['offset']) {
                throw new HttpException(409, 'Upload offset does not match the next expected byte', 'ptp_conflict');
            }

            if (strlen($content) > PHP_INT_MAX - $metadata['baseOffset'] - $offset) {
                throw new \InvalidArgumentException('Upload offset is too large');
            }

            return $this->fileApi->withPathLocks([$metadata['path']], function () use ($metadata, $content): array {
                $target = $this->fileApi->resolveUploadPath($metadata['path']);
                $stage = $this->requireStage($target, $metadata);
                $handle = fopen($stage, 'r+b');

                if ($handle === false) {
                    throw new \RuntimeException('Could not open upload staging file');
                }

                try {
                    try {
                        if (fseek($handle, $metadata['baseOffset'] + $metadata['offset']) !== 0) {
                            throw new \RuntimeException('Could not seek in upload staging file');
                        }

                        $position = 0;
                        $length = strlen($content);

                        while ($position < $length) {
                            $written = fwrite($handle, substr($content, $position, 65536));

                            if ($written === false || $written === 0) {
                                throw new \RuntimeException('Incomplete upload chunk');
                            }

                            $position += $written;
                        }

                        if (!fflush($handle)) {
                            throw new \RuntimeException('Could not flush upload staging file');
                        }
                    } finally {
                        fclose($handle);
                    }

                    $metadata['offset'] += strlen($content);
                    $metadata['expiresAt'] = $this->currentTime() + self::SESSION_TTL;
                    $this->save($metadata);

                    return $this->progress($metadata);
                } catch (\Throwable $error) {
                    // A short write invalidates this session, never the original file.
                    if (is_file($stage) && !unlink($stage)) {
                        error_log('PTP could not remove failed upload staging file');
                    }

                    $this->removeMetadata($metadata['id']);

                    throw $error;
                }
            });
        });
    }

    public function commit(string $id, int $size, string $sha256): array {
        if ($size < 0 || !preg_match('/^[a-fA-F0-9]{64}$/D', $sha256)) {
            throw new \InvalidArgumentException('Invalid upload verification parameters');
        }

        $sha256 = strtolower($sha256);

        return $this->withSession($id, function (array $metadata) use ($size, $sha256): array {
            if ($metadata['offset'] !== $size) {
                throw new HttpException(409, 'Upload size verification failed', 'ptp_conflict');
            }

            return $this->fileApi->withPathLocks([$metadata['path']], function () use ($metadata, $size, $sha256): array {
                $target = $this->fileApi->resolveUploadPath($metadata['path']);
                $stage = $this->requireStage($target, $metadata);
                $actualHash = $this->hashPayload($stage, $metadata['baseOffset'], $size);

                if (!hash_equals($sha256, $actualHash)) {
                    throw new HttpException(409, 'Upload checksum verification failed', 'ptp_conflict');
                }

                if ($this->fingerprint($target) !== $metadata['original']) {
                    throw new HttpException(409, 'Destination changed since the upload began', 'ptp_conflict');
                }

                $permissions = $metadata['original']['permissions'] ?? 0644;

                if (!chmod($stage, $permissions)) {
                    throw new \RuntimeException('Could not set uploaded file permissions');
                }

                // Both paths are in one directory. Never unlink the original first.
                if (!rename($stage, $target)) {
                    throw new \RuntimeException('Could not atomically replace destination');
                }

                clearstatcache(true, $target);
                $fileSize = filesize($target);
                $this->removeMetadata($metadata['id']);

                return ['path' => $metadata['path'], 'size' => $size, 'sha256' => $sha256, 'fileSize' => $fileSize];
            });
        });
    }

    public function abort(string $id): void {
        $this->validateId($id);

        TransferStorage::withLocks($this->fileApi->getRootPath(), 'session', [$id], function () use ($id): void {
            if (!is_file($this->metadataPath($id))) {
                return;
            }

            $metadata = $this->load($id);
            $this->checkScope($metadata);
            $this->discard($metadata);
        });
    }

    protected function currentTime(): int {
        return time();
    }

    private function withSession(string $id, callable $callback) {
        $this->validateId($id);

        return TransferStorage::withLocks($this->fileApi->getRootPath(), 'session', [$id], function () use ($id, $callback) {
            $metadata = $this->load($id);
            $this->checkScope($metadata);

            if ($metadata['expiresAt'] <= $this->currentTime()) {
                $this->discard($metadata);

                throw new HttpException(410, 'Upload session expired', 'ptp_upload_expired');
            }

            return $callback($metadata);
        });
    }

    private function checkScope(array $metadata): void {
        if ($metadata['scope'] !== $this->scope) {
            throw new HttpException(404, 'Upload session does not exist', 'ptp_not_found');
        }
    }

    private function fingerprint(string $path): ?array {
        clearstatcache(true, $path);

        if (!file_exists($path)) {
            return null;
        }

        if (!is_file($path) || is_link($path)) {
            throw new HttpException(409, 'Destination is not a regular file', 'ptp_conflict');
        }

        $stat = stat($path);
        $hash = hash_file('sha256', $path);

        if ($stat === false || $hash === false) {
            throw new \RuntimeException('Could not inspect destination');
        }

        return [
            'device' => $stat['dev'],
            'inode' => $stat['ino'],
            'size' => $stat['size'],
            'modified' => $stat['mtime'],
            'changed' => $stat['ctime'],
            'permissions' => $stat['mode'] & 0777,
            'sha256' => $hash,
        ];
    }

    private function requireStage(string $target, array $metadata): string {
        $stage = $this->stagePath($target, $metadata['id']);
        clearstatcache(true, $stage);
        $expectedSize = max($metadata['preservedSize'], $metadata['baseOffset'] + $metadata['offset']);

        if (is_link($stage) || !is_file($stage) || filesize($stage) !== $expectedSize) {
            throw new HttpException(409, 'Upload staging file is missing or changed', 'ptp_conflict');
        }

        return $stage;
    }

    private function hashPayload(string $stage, int $offset, int $size): string {
        $handle = fopen($stage, 'rb');

        if ($handle === false) {
            throw new \RuntimeException('Could not open upload for verification');
        }

        try {
            if (fseek($handle, $offset) !== 0) {
                throw new \RuntimeException('Could not seek to upload payload');
            }

            $hash = hash_init('sha256');
            $remaining = $size;

            while ($remaining > 0) {
                $chunk = fread($handle, min(65536, $remaining));

                if ($chunk === false || $chunk === '') {
                    throw new \RuntimeException('Could not read complete upload payload');
                }

                hash_update($hash, $chunk);
                $remaining -= strlen($chunk);
            }

            return hash_final($hash);
        } finally {
            fclose($handle);
        }
    }

    private function progress(array $metadata): array {
        return ['id' => $metadata['id'], 'offset' => $metadata['offset'], 'maxChunkSize' => RequestParameterBag::MAX_BODY_BYTES];
    }

    private function validateId(string $id): void {
        if (!preg_match('/^[a-f0-9]{64}$/D', $id)) {
            throw new \InvalidArgumentException('Invalid upload identifier');
        }
    }

    private function metadataPath(string $id): string {
        return $this->directory . '/' . $id . '.json';
    }

    private function stagePath(string $target, string $id): string {
        return dirname($target) . '/.ptp-upload-' . $id . '.part';
    }

    private function load(string $id): array {
        $path = $this->metadataPath($id);

        if (!is_file($path) || is_link($path)) {
            throw new HttpException(404, 'Upload session does not exist', 'ptp_not_found');
        }

        $contents = file_get_contents($path, false, null, 0, 16385);

        if ($contents === false || strlen($contents) > 16384) {
            throw new \RuntimeException('Invalid upload metadata');
        }

        $metadata = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);

        if (!is_array($metadata) || ($metadata['id'] ?? null) !== $id || !is_string($metadata['path'] ?? null) || !is_string($metadata['scope'] ?? null)) {
            throw new \RuntimeException('Invalid upload metadata');
        }

        foreach (['baseOffset', 'preservedSize', 'offset', 'expiresAt'] as $key) {
            if (!isset($metadata[$key]) || !is_int($metadata[$key]) || $metadata[$key] < 0) {
                throw new \RuntimeException('Invalid upload metadata');
            }
        }

        return $metadata;
    }

    private function save(array $metadata): void {
        $path = $this->metadataPath($metadata['id']);
        $temporary = $path . '.tmp';
        $contents = json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        if (strlen($contents) > 16384) {
            throw new \InvalidArgumentException('Upload path is too long');
        }

        if (file_put_contents($temporary, $contents, LOCK_EX) !== strlen($contents) || !chmod($temporary, 0600) || !rename($temporary, $path)) {
            throw new \RuntimeException('Could not save upload metadata');
        }
    }

    private function removeMetadata(string $id): void {
        foreach ([$this->metadataPath($id), $this->metadataPath($id) . '.tmp'] as $path) {
            if (is_file($path) && !unlink($path)) {
                error_log('PTP could not remove upload metadata');
            }
        }
    }

    private function discard(array $metadata): void {
        // Cleanup may remove only this random staging file, even after access is revoked.
        $cleanupApi = new FileApi($this->fileApi->getRootPath());
        $parent = dirname(str_replace('\\', '/', $metadata['path']));
        $cleanupApi->withPathLocks([$parent], function () use ($cleanupApi, $metadata): void {
            $directory = $cleanupApi->resolveUploadDirectory($metadata['path']);
            $stage = $directory . '/.ptp-upload-' . $metadata['id'] . '.part';

            if (is_link($stage)) {
                throw new \RuntimeException('Upload staging file cannot be a link');
            }

            if (is_file($stage) && !unlink($stage)) {
                throw new \RuntimeException('Could not remove upload staging file');
            }

            $this->removeMetadata($metadata['id']);
        });
    }

    private function cleanupExpired(): int {
        $count = 0;

        foreach (new \DirectoryIterator($this->directory) as $entry) {
            if (!preg_match('/^([a-f0-9]{64})\.json$/D', $entry->getFilename(), $match)) {
                continue;
            }

            $id = $match[1];
            $active = TransferStorage::withLocks($this->fileApi->getRootPath(), 'session', [$id], function () use ($id): bool {
                if (!is_file($this->metadataPath($id))) {
                    return false;
                }

                $metadata = $this->load($id);

                if ($metadata['expiresAt'] <= $this->currentTime()) {
                    $this->discard($metadata);

                    return false;
                }

                return true;
            });

            if ($active) {
                $count++;
            }
        }

        return $count;
    }
}
