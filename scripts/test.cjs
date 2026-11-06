const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn} = require('child_process');
const {phpBinary} = require('./php-runtime.cjs');
const {checkApiContract} = require('./api-contract.cjs');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptp-tests-'));
const served = path.join(temp, 'served');
const children = new Set();
const env = {
    ...process.env,
    XDEBUG_MODE: 'off',
    PTP_ENV_FILE: '',
    PTP_USERNAME: 'test',
    PTP_PASSWORD: 'test',
    PTP_ROOT_PATH: served,
    PTP_LOG_PATH: '',
    PTP_LOG_HEADERS: 'false',
    PTP_LOG_BODY: 'false',
    PTP_LOG_OUTPUT_CONSOLE: 'false',
};

function port() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const availablePort = server.address().port;

            server.close(() => resolve(availablePort));
        });
    });
}

function start(exe, args, cwd, stdio = 'inherit') {
    const child = spawn(exe, args, {cwd, env, stdio, windowsHide: true});

    children.add(child);
    child.once('close', () => children.delete(child));

    return child;
}

async function run(exe, args, cwd) {
    const child = start(exe, args, cwd);
    const timer = setTimeout(() => child.kill(), 120000);

    try {
        const code = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', resolve);
        });

        if (code !== 0) {
            throw new Error(`${path.basename(exe)} failed (${code})`);
        }
    } finally {
        clearTimeout(timer);
    }
}

async function main() {
    const php = phpBinary();

    env.PTP_PHP_BINARY = php;
    fs.mkdirSync(path.join(served, 'documents'), {recursive: true});
    fs.mkdirSync(path.join(served, 'music_albums/album_1'), {recursive: true});
    fs.writeFileSync(path.join(served, 'documents/index.txt'), 'PTP test fixture');
    fs.copyFileSync(path.join(root, 'ptp-server/playground-files/file.png'), path.join(served, 'music_albums/album_1/cover_alt.png'));
    const apiPort = await port();
    const ftpPort = await port();

    env.PTP_TEST_ENDPOINT = `http://127.0.0.1:${apiPort}/ptp-server.php`;
    env.PTP_TEST_ROOT = served;
    env.PTP_TEST_CONFIG = path.join(temp, 'test.yaml');
    fs.writeFileSync(env.PTP_TEST_CONFIG, `host: 127.0.0.1\nport: ${ftpPort}\npassiveUrl: 127.0.0.1\napiUsername: test\napiPassword: test\napiEndPoint: ${env.PTP_TEST_ENDPOINT}\n`);
    const server = start(php, ['-d', 'memory_limit=16M', '-S', `127.0.0.1:${apiPort}`, '-t', path.join(root, 'ptp-server/src')], root, ['ignore', 'ignore', 'pipe']);
    let serverError = '';

    server.stderr.on('data', data => {
        serverError = (serverError + data).slice(-8000);
    });
    let ready = false;

    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const response = await fetch(env.PTP_TEST_ENDPOINT + '?action=hello');

            if (response.ok && await response.text() === 'hi') {
                ready = true;
                break;
            }
        } catch {
            // Connection refusal is expected while the test server starts.
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!ready) {
        throw new Error('Test server failed to start: ' + serverError);
    }

    const contractChecks = await checkApiContract(env.PTP_TEST_ENDPOINT, 'Basic ' + Buffer.from('test:test').toString('base64'));

    console.log('Passed ' + contractChecks + ' standalone HTTP contract checks.');

    if (!process.argv.includes('--client')) {
        await run(php, ['vendor/bin/phpunit', '--bootstrap', 'vendor/autoload.php', '--do-not-cache-result', 'test'], path.join(root, 'ptp-server'));
    }

    if (!process.argv.includes('--server')) {
        await run(process.execPath, ['node_modules/typescript/bin/tsc'], path.join(root, 'ptp-client'));
        await run(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand', '--coverage=false', '--silent'], path.join(root, 'ptp-client'));
        await run(process.execPath, ['scripts/test-client-startup.cjs'], root);
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    await Promise.all([...children].map(child => new Promise(resolve => {
        child.once('close', resolve);
        child.kill();
    })));

    if (fs.existsSync(served)) {
        let normalizedRoot = fs.realpathSync(served).replace(/\\/g, '/').replace(/\/+$/, '');

        if (process.platform === 'win32') {
            normalizedRoot = normalizedRoot.toLowerCase();
        }

        const digest = require('node:crypto').createHash('sha256').update(normalizedRoot).digest('hex');
        const transferStore = path.resolve(os.tmpdir(), 'ptp-transfers-' + digest);

        if (path.dirname(transferStore) !== path.resolve(os.tmpdir()) || path.basename(transferStore) !== 'ptp-transfers-' + digest) {
            throw new Error('Unexpected test transfer storage path');
        }

        fs.rmSync(transferStore, {recursive: true, force: true});
    }

    const resolved = path.resolve(temp);

    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ptp-tests-')) {
        throw new Error('Unexpected fixture path');
    }

    // rm removes links themselves; it does not traverse linked directories.
    fs.rmSync(resolved, {recursive: true, force: true});
});
