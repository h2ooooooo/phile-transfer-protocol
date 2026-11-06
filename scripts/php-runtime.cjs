const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const minimumPhpVersion = 80200;
let cachedBinary;
let cachedSelection;

function readRuntime(command, shell) {
    const argumentsToRun = ['-d', 'xdebug.mode=off', '-r', 'echo json_encode([PHP_BINARY, PHP_VERSION_ID]);'];
    let executable = command;
    let argumentsForProcess = argumentsToRun;

    if (shell) {
        executable = command + ' -d xdebug.mode=off -r "echo json_encode([PHP_BINARY, PHP_VERSION_ID]);"';
        argumentsForProcess = [];
    }

    const result = spawnSync(executable, argumentsForProcess, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
        shell,
        env: {...process.env, XDEBUG_MODE: 'off'},
    });

    if (result.status !== 0) {
        return null;
    }

    try {
        const [binary, version] = JSON.parse(result.stdout.trim());

        if (typeof binary !== 'string' || !Number.isInteger(version) || version < minimumPhpVersion || !fs.existsSync(binary)) {
            return null;
        }

        return binary;
    } catch {
        return null;
    }
}

function phpBinary() {
    const explicitBinary = process.env.PTP_PHP_BINARY;
    const selection = JSON.stringify([explicitBinary, process.env.PATH]);

    if (cachedBinary && cachedSelection === selection) {
        return cachedBinary;
    }

    if (explicitBinary) {
        if (!path.isAbsolute(explicitBinary)) {
            throw new Error('PTP_PHP_BINARY must be an absolute path to a PHP 8.2+ executable.');
        }

        const binary = readRuntime(explicitBinary, false);

        if (!binary) {
            throw new Error('PTP_PHP_BINARY must point to a working PHP 8.2+ executable: ' + explicitBinary);
        }

        cachedSelection = selection;
        cachedBinary = binary;

        return binary;
    }

    for (const command of ['php', 'php82', 'php8.2', 'php83', 'php8.3', 'php84', 'php8.4', 'php85', 'php8.5']) {
        const binary = readRuntime(command, true);

        if (binary) {
            cachedSelection = selection;
            cachedBinary = binary;

            return binary;
        }
    }

    throw new Error('PHP 8.2+ is required. Install a compatible runtime or set PTP_PHP_BINARY to its absolute executable path.');
}

module.exports = {phpBinary};
