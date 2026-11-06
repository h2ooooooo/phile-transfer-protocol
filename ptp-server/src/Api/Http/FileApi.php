<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http;

use jalsoedesign\PhileTransferProtocol\Config\Config;
use jalsoedesign\PhileTransferProtocol\Exception\NotFoundException;
use jalsoedesign\PhileTransferProtocol\Exception\UnauthorizedException;
use jalsoedesign\PhileTransferProtocol\File\Exception;
use jalsoedesign\PhileTransferProtocol\Util\Utilities;

use jalsoedesign\PhileTransferProtocol\Exception\HttpException;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\RequestParameterBag;

/**
 * Class FileApi
 *
 * This class provides methods for interacting with files and directories.
 */
class FileApi {
    /**
     * The root directory to serve - can't go into parents of this
     */
    private string $root;
    private ?\Closure $pathAccess;

    public const MAX_LIST_PAGE_SIZE = 500;
    /**
     * __construct method.
     *
     * This method is used to initialize the object of the class.
     *
     * @param string $root The root path to be set.
     *
     * @throws \Exception If the root path is empty or cannot be found.
     */
    public function __construct(string $root, ?callable $pathAccess = null) {
        $this->root = realpath($root);
        $this->pathAccess = null;

        if ($pathAccess !== null) {
            $this->pathAccess = \Closure::fromCallable($pathAccess);
        }

        if (empty($this->root)) {
            throw new \Exception(sprintf('Could not find root path at "%s"', $root));
        }
    }

    private function translatePath(string $path): string {
        $originalPath = $path;

        $path = ltrim(Utilities::normalizePath($path, '/'), '/');

        $parts = explode('/', $path);

        $result = [];

        foreach ($parts as $part) {
            if ($part === '..') {
                // Go up a directory (remove last element)
                array_pop($result);
            } elseif ($part !== '.' && $part !== '') {
                // Skip current directory markers and empty parts
                $result[] = $part;
            }
        }

        return (substr($originalPath, 0, 1) === '/' ? '/' : '') . implode('/', $result);
    }

    /**
     * Resolves the given path by concatenating the root and the provided path.
     *
     * @param string $path The path to be resolved. Default value is '.' (current directory).
     *
     * @return string The resolved path.
     */
    private function resolvePath(string $path = '.'): string {
        if (str_contains($path, "\0") || str_contains($path, ':')) {
            throw new UnauthorizedException('Invalid path');
        }

        $path = $this->root . '/' . $path;

        $translateRootPathReal = $this->translatePath($this->root);

        $translatePath = $this->translatePath($path);

        // Ensure the path is within the root directory
        // It must either be equal to the root path or start with the root path followed by a directory separator
        $isRoot = $translatePath === $translateRootPathReal;
        $isSubPath = strpos($translatePath, $translateRootPathReal . '/') === 0;

        if (!$isRoot && !$isSubPath) {
            throw new UnauthorizedException(sprintf('Invalid root path'));
        }

        // Reject links in every existing component, including parents of new files.
        $relative = ltrim(substr($translatePath, strlen($translateRootPathReal)), '/');
        $cursor = $this->root;

        foreach (array_filter(explode('/', $relative), 'strlen') as $part) {
            if (str_starts_with(strtolower($part), '.ptp-upload-')) {
                throw new UnauthorizedException('Protected upload staging path');
            }

            if (PHP_OS_FAMILY === 'Windows' && rtrim($part, '. ') !== $part) {
                throw new UnauthorizedException('Invalid path');
            }

            $cursor .= '/' . $part;
            clearstatcache(true, $cursor);

            if (is_link($cursor)) {
                throw new UnauthorizedException('Links are not allowed');
            }

            $canonical = realpath($cursor);

            if ($canonical !== false) {
                $canonical = $this->translatePath($canonical);

                if ($canonical !== $translateRootPathReal && !str_starts_with($canonical, $translateRootPathReal . '/')) {
                    throw new UnauthorizedException('Invalid root path');
                }
            }
        }

        foreach (Config::instance()->getIgnoreFiles() as $protected) {
            $protectedPath = $this->translatePath(realpath($protected['name']) ?: $protected['name']);
            $candidate = $this->translatePath(realpath($translatePath) ?: $translatePath);

            if (PHP_OS_FAMILY === 'Windows') {
                $candidate = strtolower($candidate);
                $protectedPath = strtolower($protectedPath);
            }

            if ($candidate === $protectedPath) {
                throw new UnauthorizedException('Protected path');
            }
        }

        if ($this->pathAccess !== null) {
            ($this->pathAccess)($translatePath);
        }

        return $translatePath;
    }

    private function resolveExistingPath(string $path = '.'): string {
        $path = $this->resolvePath($path);

        if (!file_exists($path)) {
            throw new NotFoundException('Path does not exist');
        }

        return $path;
    }

    public function get(string $fileName, bool $resolvePath = true): ?array {
        $filePath = $fileName;

        if ($resolvePath) {
            $filePath = $this->resolveExistingPath($fileName);
        }

        $stat = stat($filePath);

        if ($stat === false) {
            throw new \RuntimeException('Could not read file metadata');
        }

        return [
            'name' => basename($fileName),
            'size' => $stat['size'],
            'isDirectory' => ($stat['mode'] & 0170000) === 0040000,
            'modified' => $stat['mtime'],
            'permissions' => substr(sprintf('%o', $stat['mode']), -3),
        ];
    }

    public function list(string $path = '.'): array {
        $directory = $this->resolveExistingPath($path);

        if (!is_dir($directory)) {
            throw new HttpException(409, 'Path is not a directory', 'ptp_conflict');
        }

        $entries = [];

        foreach (new \DirectoryIterator($directory) as $entry) {
            if ($entry->isDot()) {
                continue;
            }

            try {
                $filePath = $this->resolvePath($path . '/' . $entry->getFilename());
            } catch (UnauthorizedException $error) {
                continue;
            }

            if (file_exists($filePath)) {
                $entries[] = $this->get($filePath, false);
            }
        }

        usort($entries, static function (array $left, array $right): int {
            if ($left['isDirectory'] !== $right['isDirectory']) {
                return $left['isDirectory'] ? -1 : 1;
            }

            return strnatcmp($left['name'], $right['name']);
        });

        return $entries;
    }

    /** The offset follows directory order, so only page entries need metadata. */
    public function listPage(string $path = '.', int $offset = 0, int $limit = 100): array {
        if ($offset < 0 || $limit < 1 || $limit > self::MAX_LIST_PAGE_SIZE) {
            throw new \InvalidArgumentException('Invalid pagination parameters');
        }

        $directory = $this->resolveExistingPath($path);

        if (!is_dir($directory)) {
            throw new HttpException(409, 'Path is not a directory', 'ptp_conflict');
        }

        $handle = opendir($directory);

        if ($handle === false) {
            throw new \RuntimeException('Could not read directory');
        }

        $entries = [];
        $position = 0;
        $nextOffset = null;

        try {
            while (($name = readdir($handle)) !== false) {
                if ($name === '.' || $name === '..') {
                    continue;
                }

                if ($position++ < $offset) {
                    continue;
                }

                if (count($entries) === $limit) {
                    $nextOffset = $position - 1;
                    break;
                }

                try {
                    $filePath = $this->resolvePath($path . '/' . $name);
                } catch (UnauthorizedException $error) {
                    continue;
                }

                if (!file_exists($filePath)) {
                    continue;
                }

                $entries[] = $this->get($filePath, false);
            }
        } finally {
            closedir($handle);
        }

        return ['entries' => $entries, 'nextOffset' => $nextOffset];
    }

    public function getRootPath(): string {
        return $this->root;
    }

    public function resolveUploadPath(string $path): string {
        $resolved = $this->resolvePath($path);

        if (file_exists($resolved) && !is_file($resolved)) {
            throw new HttpException(409, 'Path is not a regular file', 'ptp_conflict');
        }

        return $resolved;
    }

    public function resolveUploadDirectory(string $path): string {
        $parent = dirname(Utilities::normalizePath($path, '/'));

        return $this->resolvePath($parent);
    }

    public function withPathLocks(array $paths, callable $callback, bool $exclusiveTree = false) {
        $operation = $exclusiveTree ? LOCK_EX : LOCK_SH;

        return TransferStorage::withLocks($this->root, 'tree', ['mutation'], function () use ($paths, $callback) {
            $resolved = [];

            foreach ($paths as $path) {
                $resolved[] = $this->resolvePath($path);
            }

            return TransferStorage::withLocks($this->root, 'target', $resolved, $callback);
        }, $operation);
    }

    private function assertNoPendingUploads(string $path): void {
        if (!is_dir($path)) {
            return;
        }

        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS));

        foreach ($iterator as $entry) {
            if (str_starts_with(strtolower($entry->getFilename()), '.ptp-upload-')) {
                throw new HttpException(409, 'Directory contains an unfinished upload', 'ptp_conflict');
            }
        }
    }

    public function mkdir(string $path): string {
        return $this->withPathLocks([$path], function () use ($path): string {
            $directory = $this->resolvePath($path);

            if (file_exists($directory)) {
                throw new HttpException(409, 'Directory already exists', 'ptp_conflict');
            }

            if (!mkdir($directory, 0755, true)) {
                throw new \RuntimeException('Failed to create directory');
            }

            return $directory;
        });
    }

    public function rmdir(string $path): string {
        return $this->withPathLocks([$path], function () use ($path): string {
            $directory = $this->resolveExistingPath($path);

            if ($directory === $this->translatePath($this->root)) {
                throw new UnauthorizedException('Cannot remove root');
            }

            if (!is_dir($directory)) {
                throw new HttpException(409, 'Path is not a directory', 'ptp_conflict');
            }

            if ((new \FilesystemIterator($directory, \FilesystemIterator::SKIP_DOTS))->valid()) {
                throw new HttpException(409, 'Directory is not empty', 'ptp_conflict');
            }

            if (!rmdir($directory)) {
                throw new \RuntimeException('Failed to delete directory');
            }

            return $directory;
        }, true);
    }

    public function delete(string $path): bool {
        return $this->withPathLocks([$path], function () use ($path): bool {
            $filePath = $this->resolveExistingPath($path);

            if (is_dir($filePath)) {
                throw new HttpException(409, 'Cannot use delete on a directory', 'ptp_conflict');
            }

            if (!unlink($filePath)) {
                throw new \RuntimeException('Failed to delete file');
            }

            return true;
        });
    }

    public function rename(string $from, string $to): bool {
        return $this->withPathLocks([$from, $to], function () use ($from, $to): bool {
            $fromPath = $this->resolveExistingPath($from);
            $toPath = $this->resolvePath($to);

            foreach (Config::instance()->getIgnoreFiles() as $protected) {
                $protectedPath = TransferStorage::normalize(realpath($protected['name']) ?: $protected['name']);
                $source = TransferStorage::normalize($fromPath);
                $target = TransferStorage::normalize($toPath);

                if (str_starts_with($protectedPath, $source . '/') || str_starts_with($protectedPath, $target . '/')) {
                    throw new UnauthorizedException('Protected path');
                }
            }

            if ($fromPath === $this->translatePath($this->root) || $toPath === $this->translatePath($this->root)) {
                throw new UnauthorizedException('Cannot rename root');
            }

            $this->assertNoPendingUploads($fromPath);
            $this->assertNoPendingUploads($toPath);

            if (file_exists($toPath) && is_dir($fromPath) !== is_dir($toPath)) {
                throw new HttpException(409, 'Source and destination have different types', 'ptp_conflict');
            }

            if ($fromPath !== $toPath && is_dir($toPath) && (new \FilesystemIterator($toPath, \FilesystemIterator::SKIP_DOTS))->valid()) {
                throw new HttpException(409, 'Destination directory is not empty', 'ptp_conflict');
            }

            if (!is_dir(dirname($toPath))) {
                throw new NotFoundException('Destination parent does not exist');
            }

            if (!rename($fromPath, $toPath)) {
                throw new \RuntimeException('Failed to rename');
            }

            return true;
        }, true);
    }

    /**
     * Reads the contents of a file.
     *
     * @param string      $fileName The name of the file to be read.
     * @param int         $start    The start byte to seek to
     * @param string|null $mimeType (optional) The detected MIME type of the file.
     *
     * @return resource A binary stream positioned at the requested offset; caller closes it.
     * @throws \Exception if the file does not exist or it is a directory.
     */
    public function read(string $fileName, int $start = 0, string &$mimeType = null) {
        if ($start < 0) {
            throw new \InvalidArgumentException('Invalid offset', 400);
        }

        $filePath = $this->resolveExistingPath($fileName);

        if (is_dir($filePath)) {
            throw new HttpException(409, 'Cannot read the contents directory (use list for that)', 'ptp_conflict');
        }

        // Never execute HTML/JS returned by this file-transfer endpoint in a browser.
        $mimeType = 'application/octet-stream';

        $handle = fopen($filePath, 'rb');

        if ($handle === false) {
            throw new \Exception(sprintf('Could not open file "%s" for reading', $filePath));
        }

        try {
            $this->resolveExistingPath($fileName);
            $stat = fstat($handle);

            if ($stat === false || $start > $stat['size'] || fseek($handle, $start) !== 0) {
                throw new \InvalidArgumentException('Invalid offset', 400);
            }

            return $handle;
        } catch (\Throwable $e) {
            fclose($handle);

            throw $e;
        }
    }

    public function write(string $fileName, string $content, bool $append = false, int $start = 0): array {
        if ($start < 0 || ($append && $start !== 0)) {
            throw new \InvalidArgumentException('Invalid offset');
        }

        if (strlen($content) > RequestParameterBag::MAX_BODY_BYTES) {
            throw new HttpException(413, 'Request body exceeds the upload chunk limit', 'ptp_payload_too_large');
        }

        return $this->withPathLocks([$fileName], function () use ($fileName, $content, $append, $start): array {
            $filePath = $this->resolveUploadPath($fileName);
            $exists = file_exists($filePath);

            if ($start > 0 && (!$exists || $start > filesize($filePath))) {
                throw new \InvalidArgumentException('Offset exceeds file size');
            }

            $directory = dirname($filePath);

            if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
                throw new \RuntimeException('Failed to create directory');
            }

            $this->resolveUploadPath($fileName);
            $handle = fopen($filePath, $start > 0 ? 'r+b' : 'c+b');

            if ($handle === false) {
                throw new \RuntimeException('Could not open file for writing');
            }

            try {
                if (!flock($handle, LOCK_EX)) {
                    throw new \RuntimeException('Failed to lock file');
                }

                $this->resolveExistingPath($fileName);
                $stat = fstat($handle);

                if ($stat === false || $start > $stat['size']) {
                    throw new \InvalidArgumentException('Offset exceeds file size');
                }

                if (!$append && $start === 0 && !ftruncate($handle, 0)) {
                    throw new \RuntimeException('Failed to truncate file');
                }

                if (fseek($handle, $append ? 0 : $start, $append ? SEEK_END : SEEK_SET) !== 0) {
                    throw new \RuntimeException('Failed to seek');
                }

                $this->writeAll($handle, $content);

                if (!fflush($handle)) {
                    throw new \RuntimeException('Failed to flush file');
                }
            } finally {
                if (!fclose($handle)) {
                    throw new \RuntimeException('Failed to close file');
                }
            }

            clearstatcache(true, $filePath);

            return $this->get($fileName);
        });
    }

    /** Write fully or fail; overridable primitive permits deterministic short-write tests. */
    protected function writeChunk($handle, string $content) {
        return fwrite($handle, $content);
    }

    protected function writeAll($handle, string $content): void {
        $offset = 0;
        $length = strlen($content);

        while ($offset < $length) {
            $written = $this->writeChunk($handle, substr($content, $offset, 65536));

            if ($written === false || $written === 0) {
                throw new \RuntimeException('Incomplete file write');
            }

            $offset += $written;
        }
    }

    public function chmod(string $path, $mode): bool {
        if (is_string($mode)) {
            if (!preg_match('/^[0-7]{3,4}$/D', $mode)) {
                throw new \InvalidArgumentException('Invalid permission mode');
            }

            $mode = octdec($mode);
        }

        if (!is_int($mode) || $mode < 0 || $mode > 07777) {
            throw new \InvalidArgumentException('Invalid permission mode');
        }

        return $this->withPathLocks([$path], function () use ($path, $mode): bool {
            $filePath = $this->resolveExistingPath($path);

            if (!chmod($filePath, $mode)) {
                throw new \RuntimeException('Failed to change file mode');
            }

            return true;
        });
    }

    /**
     * Returns a unique name.
     *
     * @return string The unique name generated using the uniqid() function.
     */
    public function getUniqueName(): string {
        return uniqid();
    }
}
