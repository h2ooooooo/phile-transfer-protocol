const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const {phpBinary} = require('./php-runtime.cjs');

const wrapper = path.join(__dirname, 'php.cjs');

test('PHP commands run on a compatible runtime and preserve arguments', () => {
    const result = spawnSync(process.execPath, [wrapper, '-r', 'echo json_encode([PHP_VERSION_ID, $argv[1]]);', 'argument with spaces'], {
        encoding: 'utf8',
        windowsHide: true,
        env: {...process.env, PTP_PHP_BINARY: phpBinary()},
    });

    assert.equal(result.status, 0, result.stderr);
    const [version, argument] = JSON.parse(result.stdout);

    assert.ok(version >= 80200);
    assert.equal(argument, 'argument with spaces');
});

test('an explicit incompatible executable fails instead of silently selecting another runtime', () => {
    const result = spawnSync(process.execPath, [wrapper, '-v'], {
        encoding: 'utf8',
        windowsHide: true,
        env: {...process.env, PTP_PHP_BINARY: process.execPath},
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PTP_PHP_BINARY must point to a working PHP 8\.2\+ executable/);
});

test('an explicit relative executable is rejected with an actionable error', () => {
    const result = spawnSync(process.execPath, [wrapper, '-v'], {
        encoding: 'utf8',
        windowsHide: true,
        env: {...process.env, PTP_PHP_BINARY: 'php'},
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PTP_PHP_BINARY must be an absolute path/);
});
