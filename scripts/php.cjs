const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {phpBinary} = require('./php-runtime.cjs');

try {
    const args = process.argv.slice(2);
    let directory = process.cwd();

    if (args[0] === '--cwd') {
        const relativeDirectory = args[1];

        if (!relativeDirectory || args[2] !== '--') {
            throw new Error('Usage: node scripts/php.cjs [--cwd directory --] <PHP arguments>');
        }

        directory = path.resolve(directory, relativeDirectory);
        args.splice(0, 3);
    }

    const binary = phpBinary();
    const result = spawnSync(binary, args, {
        cwd: directory,
        env: {...process.env, PTP_PHP_BINARY: binary, XDEBUG_MODE: 'off'},
        stdio: 'inherit',
        windowsHide: true,
    });

    if (result.error) {
        throw result.error;
    }

    process.exitCode = result.status ?? 1;
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
