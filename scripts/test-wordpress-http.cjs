const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {spawn} = require('node:child_process');
const {checkApiContract} = require('./api-contract.cjs');

const root = path.resolve(__dirname, '..');
const project = 'ptp-http-' + process.pid + '-' + randomBytes(4).toString('hex');
const composeFile = path.join(root, 'tests/wordpress/compose.yaml');
const environment = {...process.env};
let composeStarted = false;

function run(command, args, capture = false) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            env: environment,
            windowsHide: true,
            stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
        });
        let output = '';

        if (capture) {
            child.stdout.on('data', chunk => {
                output += chunk.toString();
            });
        }

        const timer = setTimeout(() => child.kill(), 600000);

        child.once('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.once('close', code => {
            clearTimeout(timer);

            if (code !== 0) {
                reject(new Error(command + ' failed with exit code ' + code));

                return;
            }

            resolve(output.trim());
        });
    });
}

function compose(args, capture = false) {
    return run('docker', ['compose', '-p', project, '-f', composeFile, ...args], capture);
}

function wp(args, capture = false) {
    return compose(['run', '--rm', '-T', 'cli', ...args], capture);
}

function availablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;

            server.close(() => resolve(port));
        });
    });
}

async function main() {
    const archive = path.join(root, 'ptp-wordpress/dist/ptp-wordpress.zip');

    if (!fs.existsSync(archive)) {
        throw new Error('Build the plugin first with npm run build.');
    }

    const port = await availablePort();

    environment.PTP_WORDPRESS_PORT = String(port);
    composeStarted = true;
    await compose(['up', '-d', '--wait', '--wait-timeout', '180', 'wordpress']);
    await wp([
        'core', 'install',
        '--url=http://127.0.0.1:' + port,
        '--title=PTP HTTP regression tests',
        '--admin_user=ptp-tests',
        '--admin_password=disposable-admin-test-password',
        '--admin_email=ptp-tests@example.invalid',
        '--skip-email',
    ]);
    await wp(['plugin', 'install', '/artifacts/ptp-wordpress.zip', '--activate']);
    await wp(['eval-file', '/fixtures/setup.php']);
    const password = await wp(['user', 'application-password', 'create', 'ptp-tests', 'PTP HTTP tests', '--porcelain'], true);
    const authorization = 'Basic ' + Buffer.from('ptp-tests:' + password).toString('base64');
    const endpoint = 'http://127.0.0.1:' + port + '/?rest_route=/ptp/v1/files';
    const unauthenticated = await fetch(endpoint + '&action=get&path=/');

    assert.equal(unauthenticated.status, 401);
    await unauthenticated.arrayBuffer();

    const invalidPassword = await fetch(endpoint + '&action=get&path=/', {
        headers: {Authorization: 'Basic ' + Buffer.from('ptp-tests:incorrect').toString('base64')},
    });

    assert.equal(invalidPassword.status, 401);
    await invalidPassword.arrayBuffer();

    const checks = await checkApiContract(endpoint, authorization);

    async function* oversizedChunks() {
        const chunk = Buffer.alloc(65536, 0x50);

        for (let index = 0; index < 80; index++) {
            yield chunk;
        }
    }

    const oversized = await fetch(endpoint + '&action=write&path=oversized.bin', {
        method: 'POST',
        headers: {Authorization: authorization, 'Content-Type': 'application/octet-stream'},
        body: oversizedChunks(),
        duplex: 'half',
        signal: AbortSignal.timeout(30000),
    });

    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();

    const download = await fetch(endpoint + '&action=read&path=large.bin', {
        headers: {Authorization: authorization},
        signal: AbortSignal.timeout(120000),
    });

    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-length'), String(64 * 1024 * 1024));
    assert.equal(download.headers.get('content-type'), 'application/octet-stream');
    let bytes = 0;

    for await (const chunk of download.body) {
        assert.equal(chunk.every(byte => byte === 0x50), true);
        bytes += chunk.length;
    }

    assert.equal(bytes, 64 * 1024 * 1024);
    await wp(['option', 'update', 'ptp_permissions', 'read']);
    const denied = await fetch(endpoint + '&action=uploadBegin&path=forbidden.bin', {
        method: 'POST',
        headers: {Authorization: authorization},
    });

    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, 'ptp_read_only');
    console.log('Passed ' + checks + ' shared API contract checks and real WordPress authentication, read-only, and 64 MiB buffered-host download regressions.');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    if (composeStarted) {
        // This unique project owns only disposable test containers and volumes.
        await compose(['down', '--volumes', '--remove-orphans']);
    }
});
