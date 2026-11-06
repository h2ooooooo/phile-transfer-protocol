import {app, ipcMain, safeStorage} from 'electron';
import assert from 'node:assert/strict';
import {createServer as createHttpServer} from 'node:http';
import {createServer} from 'node:net';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join, resolve, dirname, basename} from 'node:path';
import {Client} from 'basic-ftp';
import {BridgeManager, redact} from './bridges';
import {ProfileStore} from './profiles';
import {createDesktopWindow, loadDesktopWindow} from './window';
import type {Credentials} from '../shared/types';
import {createRequire} from 'node:module';

const clientRequire = createRequire(require.resolve('@jalsoedesign/phile-transfer-protocol-client/package.json'));
const {decryptRequest} = clientRequire('./dist/src/util/encryptedRequest.js');

async function freePort(): Promise<number> {
    const server = createServer();

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as {port: number}).port;

    await new Promise<void>(resolve => server.close(() => resolve()));

    return port;
}

async function waitFor(check: () => boolean): Promise<void> {
    const deadline = Date.now() + 10000;

    while (!check()) {
        if (Date.now() > deadline) {
            throw new Error('Timed out waiting for bridge state.');
        }

        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

app.whenReady().then(async () => {
    const parent = resolve(__dirname, '../../tmp');
    const {mkdir} = await import('node:fs/promises');

    await mkdir(parent, {recursive: true});
    const directory = await mkdtemp(join(parent, 'desktop-smoke-'));
    const api = createHttpServer(async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        const chunks: Buffer[] = [];

        for await (const chunk of request) {
            chunks.push(Buffer.from(chunk));
        }

        const decoded = decryptRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'desktop-fixture-secret');
        const action = decoded.parameters.action;

        if (action === 'get') {
            response.end(JSON.stringify({success: true, file: {name: '/', size: 0, modified: 1700000000, isDirectory: true}}));
        } else {
            response.end(JSON.stringify({success: true, list: []}));
        }
    });
    const manager = new BridgeManager(directory, () => {}, join(__dirname, 'worker.js'));
    const timeout = setTimeout(() => app.exit(1), 45000);

    try {
        await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
        const endpointPort = (api.address() as {port: number}).port;
        const first: Credentials = {id: 'first', name: 'First fixture', kind: 'php', host: '127.0.0.1', port: await freePort(), passiveUrl: '127.0.0.1', apiEndPoint: 'http://127.0.0.1:' + endpointPort + '/ptp.php', apiUsername: 'fixture', password: 'desktop-fixture-secret', hasPassword: true};
        const second = {...first, id: 'second', name: 'Second fixture', port: await freePort()};

        await manager.start(first);
        await manager.start(second);
        await waitFor(() => manager.statuses().filter(status => status.phase === 'running').length === 2);
        await assert.rejects(manager.start({...first, id: 'conflict'}), /already used/);

        for (const profile of [first, second]) {
            const ftp = new Client(5000);

            try {
                await ftp.access({host: profile.host, port: profile.port, user: profile.apiUsername, password: profile.password});
                assert.deepEqual(await ftp.list(), []);
            } finally {
                ftp.close();
            }
        }

        await manager.stop(first.id);
        assert.equal(manager.statuses().find(status => status.profileId === second.id)?.phase, 'running');

        const occupied = createServer();

        await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));

        try {
            const port = (occupied.address() as {port: number}).port;

            await manager.start({...first, id: 'occupied', port});
            await waitFor(() => manager.statuses().some(status => status.profileId === 'occupied' && status.phase === 'error'));
        } finally {
            await new Promise<void>(resolve => occupied.close(() => resolve()));
        }

        await manager.stopAll();
        assert.equal(manager.statuses().filter(status => status.phase === 'running').length, 0);
        assert.equal(manager.entries().some(entry => entry.message.includes(first.password)), false);
        assert.equal(redact(first.password + ' ' + Buffer.from(first.apiUsername + ':' + first.password).toString('base64'), first), '[redacted] [redacted]');

        if (await safeStorage.isAsyncEncryptionAvailable()) {
            const store = new ProfileStore(directory, {
                isEncryptionAvailable: () => true,
                encryptString: value => safeStorage.encryptStringAsync(value),
                decryptString: async value => (await safeStorage.decryptStringAsync(value)).result,
            });

            await store.load();
            const saved = await store.save({...first, id: ''});

            assert.equal((await store.credentials(saved.id)).password, first.password);
            assert.equal((await readFile(join(directory, 'connections.json'), 'utf8')).includes(first.password), false);
        }

        let rendererConnected = false;

        ipcMain.handle('ptp:action', (event, action) => {
            assert.equal(action, 'snapshot');
            assert.equal(event.sender, hiddenWindow.webContents);
            assert.equal(event.senderFrame, hiddenWindow.webContents.mainFrame);
            rendererConnected = true;

            return {value: {profiles: [], bridges: [], logs: [], secureStorage: true, release: null}};
        });
        const hiddenWindow = createDesktopWindow(__dirname, false);

        await loadDesktopWindow(hiddenWindow, __dirname);

        await waitFor(() => rendererConnected);
        hiddenWindow.destroy();
        ipcMain.removeHandler('ptp:action');
        console.log('Desktop smoke passed: two real client workers, simultaneous FTP login/list, port conflicts, independent stop, shutdown, log redaction, OS password storage, sandboxed renderer/preload IPC.');
    } finally {
        clearTimeout(timeout);
        await manager.stopAll();
        await new Promise<void>(resolve => api.close(() => resolve()));

        if (dirname(directory) !== parent || !basename(directory).startsWith('desktop-smoke-')) {
            throw new Error('Unexpected smoke fixture path.');
        }

        await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
    }

    app.exit(0);
}).catch(error => {
    console.error(error);
    app.exit(1);
});
