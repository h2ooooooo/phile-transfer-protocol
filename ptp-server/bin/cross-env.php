<?php

/**
 * Cross-platform environment variable setter for PHP.
 * Usage: php bin/cross-env.php VAR1=VAL1 VAR2=VAL2 ... command [args]
 */

$args = array_slice($argv, 1);

while (count($args) > 0 && strpos($args[0], '=') !== false && strpos($args[0], '-') !== 0) {
    putenv(array_shift($args));
}

// Disable Xdebug by default for performance, unless explicitly requested otherwise.
// This is equivalent to setting xdebug.mode=off in php.ini for Xdebug 3+.
if (getenv('XDEBUG_MODE') === false) {
    putenv('XDEBUG_MODE=off');
}

if (count($args) === 0) {
    exit(0);
}

// Join the remaining arguments into an escaped command string
$escapedArgs = array_map(function ($arg) {
    if ($arg === '@php') {
        return escapeshellarg(PHP_BINARY);
    }

    return escapeshellarg($arg);
}, $args);

$command = implode(' ', $escapedArgs);

passthru($command, $exitCode);
exit($exitCode);
