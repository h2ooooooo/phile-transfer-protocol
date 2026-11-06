const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');

const client = path.resolve(__dirname, '../ptp-client');

fs.mkdirSync(path.join(client, 'tmp'), {recursive: true});
const fixture = fs.mkdtempSync(path.join(client, 'tmp/startup-smoke-'));
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');

async function stopProcessTree(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    await new Promise((resolve, reject) => {
        let stopFailure;
        const timer = setTimeout(() => reject(new Error('Startup process did not stop', {cause: stopFailure})), 5000);

        child.once('close', () => {
            clearTimeout(timer);
            resolve();
        });

        try {
            if (process.platform === 'win32') {
                const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                    windowsHide: true,
                    encoding: 'utf8',
                });

                if (result.error) {
                    throw result.error;
                }

                if (result.status !== 0) {
                    // A descendant can exit while taskkill is walking the process tree.
                    // Wait for our child close event before treating that race as failure.
                    stopFailure = new Error(result.stderr || 'Cannot stop startup process tree');
                }
            } else {
                process.kill(-child.pid, 'SIGTERM');
            }
        } catch (error) {
            clearTimeout(timer);
            reject(error);
        }
    });
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

async function smoke(label, command) {
    const port = await freePort();
    const config = path.join(fixture, label + '.yaml');

    fs.writeFileSync(config, [
        'host: 127.0.0.1',
        'port: ' + port,
        'passiveUrl: 127.0.0.1',
        'apiUsername: startup-fixture',
        'apiPassword: startup-fixture',
        'apiEndPoint: https://example.invalid/ptp',
    ].join('\n'));
    const environment = {...process.env};

    const child = spawn(process.execPath, [...command, config], {cwd: client, env: environment, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    let timeout;

    try {
        await new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error(label + ' did not start: ' + output)), 25000);
            child.once('error', reject);
            child.once('exit', code => reject(new Error(label + ' exited with ' + code + ': ' + output)));

            for (const stream of [child.stdout, child.stderr]) {
                stream.on('data', chunk => {
                    output = (output + chunk).slice(-8000);

                    if (output.includes('FTP Server started at ftp://127.0.0.1:' + port)) {
                        resolve();
                    }
                });
            }
        });
        const banner = await new Promise((resolve, reject) => {
            const socket = net.createConnection(port, '127.0.0.1');

            socket.setTimeout(3000);
            socket.once('error', reject);
            socket.once('timeout', () => {
                socket.destroy();
                reject(new Error('FTP greeting timed out'));
            });
            socket.once('data', data => {
                socket.destroy();
                resolve(data.toString());
            });
        });

        if (!banner.startsWith('220')) {
            throw new Error('Unexpected FTP banner: ' + banner);
        }

        console.log(label + ': startup message and FTP 220 greeting verified');
    } finally {
        clearTimeout(timeout);

        await stopProcessTree(child);
    }
}

async function main() {
    if (!fs.existsSync(npmCli)) {
        throw new Error('Cannot locate the local npm CLI');
    }

    await smoke('npm-dev', [npmCli, 'run', 'dev', '--']);
    await smoke('npm-start', [npmCli, 'start', '--']);
    await smoke('compiled-source-entry', [path.join(client, 'dist/src/index.js')]);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => {
    const expectedParent = path.join(client, 'tmp');
    const resolved = path.resolve(fixture);

    if (path.dirname(resolved) !== expectedParent || !path.basename(resolved).startsWith('startup-smoke-')) {
        throw new Error('Unexpected startup fixture path');
    }

    fs.rmSync(resolved, {recursive: true, force: true});
});
