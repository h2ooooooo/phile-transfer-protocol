const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');

const {phpBinary} = require('./php-runtime.cjs');

const root = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, ...options});

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || result.error?.message || 'Check command failed');
    }

    return result.stdout.trim();
}

function fixture() {
    fs.mkdirSync(path.join(root, 'tmp'), {recursive: true});

    return fs.mkdtempSync(path.join(root, 'tmp/ptp-check-'));
}

function cleanup(directory) {
    const resolved = path.resolve(directory);

    if (path.dirname(resolved) !== path.join(root, 'tmp') || !path.basename(resolved).startsWith('ptp-check-')) {
        throw new Error('Unexpected check fixture path');
    }

    fs.rmSync(resolved, {recursive: true, force: true});
}

async function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;

            server.close(() => resolve(port));
        });
    });
}

function isolatedEnvironment(overrides = {}) {
    const environment = {...process.env, XDEBUG_MODE: 'off'};

    for (const name of Object.keys(environment)) {
        if (name.startsWith('PTP_') || name.startsWith('API_')) {
            delete environment[name];
        }
    }

    return {...environment, ...overrides};
}

async function startPhp(documentRoot, environment = {}) {
    const port = await freePort();
    const child = spawn(phpBinary(), ['-d', 'xdebug.mode=off', '-S', '127.0.0.1:' + port, '-t', documentRoot], {cwd: root, env: isolatedEnvironment(environment), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    let errors = '';

    child.stderr.on('data', data => {
        errors = (errors + data).slice(-4000);
    });

    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            await fetch('http://127.0.0.1:' + port + '/', {signal: AbortSignal.timeout(500)});

            return {child, origin: 'http://127.0.0.1:' + port};
        } catch {
            if (child.exitCode !== null) {
                throw new Error('PHP check server exited: ' + errors);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    child.kill();

    throw new Error('PHP check server did not start: ' + errors);
}

async function stop(child) {
    if (!child || child.exitCode !== null) {
        return;
    }

    await new Promise(resolve => {
        child.once('close', resolve);
        child.kill();
    });
}

module.exports = {root, run, phpBinary, fixture, cleanup, freePort, isolatedEnvironment, startPhp, stop};
