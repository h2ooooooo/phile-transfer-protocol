<?php

defined('ABSPATH') || exit;

use jalsoedesign\PhileTransferProtocol\Exception\UnauthorizedException;

final class PTP_FolderAccessDenied extends UnauthorizedException {
}

final class PTP_FolderAccess {
    private string $root;
    private array $rules = [];

    public function __construct(string $root, array $rules) {
        if (!preg_match('~^(?:/|[a-zA-Z]:[/\\\\])~', $root) || str_contains($root, "\0")) {
            throw new InvalidArgumentException('Choose an absolute path to an existing directory.');
        }

        $canonical = realpath($root);

        if ($canonical === false || !is_dir($canonical) || !is_readable($canonical)) {
            throw new InvalidArgumentException('The FTP root must be an existing, readable directory.');
        }

        $this->root = $this->normalizeAbsolutePath($canonical);

        if (count($rules) > 4096) {
            throw new InvalidArgumentException('Too many folder access rules.');
        }

        foreach ($rules as $path => $allowed) {
            if (!is_string($path) || !is_bool($allowed)) {
                throw new InvalidArgumentException('Folder selections must contain paths and boolean values.');
            }

            $normalized = $this->normalizeRelativePath($path);
            $this->rules[$normalized] = $allowed;
        }

        if (!isset($this->rules['/'])) {
            $this->rules['/'] = false;
        }
    }

    public function root(): string {
        return $this->root;
    }

    public function rules(): array {
        return $this->rules;
    }

    private function normalizeAbsolutePath(string $path): string {
        $normalized = rtrim(str_replace('\\', '/', $path), '/');

        if ($normalized === '') {
            return '/';
        }

        if (preg_match('/^[a-zA-Z]:$/D', $normalized)) {
            return $normalized . '/';
        }

        return $normalized;
    }

    public function normalizeRelativePath(string $path): string {
        $parts = explode('/', str_replace('\\', '/', $path));
        $normalized = [];

        foreach ($parts as $part) {
            if ($part === '..' || str_contains($part, ':') || str_contains($part, "\0")) {
                throw new InvalidArgumentException('Folder paths must stay inside the FTP root.');
            }

            if ($part !== '' && $part !== '.') {
                $normalized[] = $part;
            }
        }

        $result = '/' . implode('/', $normalized);

        if (PHP_OS_FAMILY === 'Windows') {
            return strtolower($result);
        }

        return $result;
    }

    private function relativePath(string $absolute): string {
        $absolute = $this->normalizeAbsolutePath($absolute);
        $root = $this->root;

        if (PHP_OS_FAMILY === 'Windows') {
            $absolute = strtolower($absolute);
            $root = strtolower($root);
        }

        if ($absolute === $root) {
            return '/';
        }

        $prefix = rtrim($root, '/') . '/';

        if (!str_starts_with($absolute, $prefix)) {
            throw new PTP_FolderAccessDenied('The path is outside the selected FTP root.');
        }

        return $this->normalizeRelativePath(substr($absolute, strlen($prefix)));
    }

    public function isAllowed(string $path): bool {
        $path = $this->normalizeRelativePath($path);

        while ($path !== '/') {
            if (array_key_exists($path, $this->rules)) {
                return $this->rules[$path];
            }

            $path = str_replace('\\', '/', dirname($path));
        }

        return $this->rules['/'];
    }

    private function isDescendant(string $path, string $parent): bool {
        if ($parent === '/') {
            return $path !== '/';
        }

        return str_starts_with($path, $parent . '/');
    }

    private function canBrowse(string $path): bool {
        foreach ($this->rules as $selected => $allowed) {
            if ($allowed && $this->isDescendant($selected, $path)) {
                return true;
            }
        }

        return false;
    }

    public function assertAccess(string $absolute, string $action): void {
        $path = $this->relativePath($absolute);
        $allowed = $this->isAllowed($path);
        $navigation = in_array($action, ['get', 'list'], true);

        if (!$allowed && !($navigation && is_dir($absolute) && $this->canBrowse($path))) {
            throw new PTP_FolderAccessDenied('Folder access is disabled for ' . $path . '. Review Folder access under Tools > PTP.');
        }

        if (in_array($action, ['rename', 'rmdir', 'chmod'], true)) {
            foreach ($this->rules as $selected => $selectionAllowed) {
                if (!$selectionAllowed && $this->isDescendant($selected, $path)) {
                    throw new PTP_FolderAccessDenied('This operation would affect excluded files or folders inside ' . $path . '. Review Folder access under Tools > PTP.');
                }
            }
        }

        if (in_array($action, ['write', 'mkdir'], true)) {
            $parent = dirname($absolute);

            while (!is_dir($parent)) {
                if (!$this->isAllowed($this->relativePath($parent))) {
                    throw new PTP_FolderAccessDenied('This operation would create an excluded parent folder. Review Folder access under Tools > PTP.');
                }

                $parent = dirname($parent);
            }
        }
    }
}
