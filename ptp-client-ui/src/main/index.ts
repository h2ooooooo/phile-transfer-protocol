import {app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell} from 'electron';
import {join, basename} from 'node:path';
import {readFile, stat} from 'node:fs/promises';
import {ProfileStore, importProfile} from './profiles';
import {BridgeManager, redact} from './bridges';
import {ReleaseService, releaseOrigin} from './releases';
import {testEndpoint} from './endpoint';
import {createDesktopWindow, loadDesktopWindow} from './window';
import type {Action, ConnectionDraft, Snapshot} from '../shared/types';

app.setName('PTP');

if (!app.requestSingleInstanceLock()) {
    app.exit(0);
}

let window: BrowserWindow | null = null;
let closing = false;
let store: ProfileStore;
let bridges: BridgeManager;
let releases: ReleaseService;
let storageAvailable = false;

app.on('second-instance', () => {
    window?.restore();
    window?.focus();
});

function snapshot(): Snapshot {
    return {profiles: store.list(), bridges: bridges.statuses(), logs: bridges.entries(), secureStorage: storageAvailable, release: releases.current()};
}

function changed(): void {
    if (window && !window.isDestroyed()) {
        window.webContents.send('ptp:state', snapshot());
    }
}

function profileId(payload: unknown): string {
    if (typeof payload !== 'string' || !store.list().some(profile => profile.id === payload)) {
        throw new Error('Select a saved connection.');
    }

    return payload;
}

async function action(name: Action, payload: unknown): Promise<unknown> {
    if (name === 'snapshot') {
        return snapshot();
    }

    if (name === 'save') {
        const draft = payload as ConnectionDraft;

        if (bridges.active(draft?.id)) {
            throw new Error('Stop this bridge before editing its connection. Other bridges can stay running.');
        }

        const profile = await store.save(payload);

        changed();

        return profile;
    }

    if (name === 'import') {
        const selection = await dialog.showOpenDialog(window!, {title: 'Import PTP YAML', properties: ['openFile'], filters: [{name: 'PTP connection', extensions: ['yaml', 'yml']}]});

        if (selection.canceled) {
            return null;
        }

        if ((await stat(selection.filePaths[0])).size > 65536) {
            throw new Error('Choose a YAML profile smaller than 64 KiB.');
        }

        const source = await readFile(selection.filePaths[0], 'utf8');

        return importProfile(source, basename(selection.filePaths[0]));
    }

    if (name === 'start') {
        await bridges.start(await store.credentials(profileId(payload)));

        return null;
    }

    if (name === 'stop') {
        await bridges.stop(profileId(payload));

        return null;
    }

    if (name === 'remove') {
        const id = profileId(payload);

        if (bridges.active(id)) {
            throw new Error('Stop this bridge before deleting the connection.');
        }

        await store.remove(id);
        bridges.clear(id);
        changed();

        return null;
    }

    if (name === 'test') {
        const profile = await store.credentials(profileId(payload));

        try {
            return await testEndpoint(profile);
        } catch (error) {
            throw new Error(redact((error as Error).message, profile));
        }
    }

    if (name === 'clearLogs') {
        bridges.clear(profileId(payload));

        return null;
    }

    if (name === 'copyPassword') {
        clipboard.writeText((await store.credentials(profileId(payload))).password);

        return null;
    }

    if (name === 'refresh') {
        const release = await releases.refresh();

        changed();

        return release;
    }

    if (name === 'download') {
        const kind = String(payload);
        const artifact = releases.artifact(kind);
        const result = await dialog.showSaveDialog(window!, {title: 'Save verified PTP ZIP', defaultPath: join(app.getPath('downloads'), artifact.name), filters: [{name: 'ZIP archive', extensions: ['zip']}]});

        if (result.canceled || !result.filePath) {
            return null;
        }

        await releases.download(kind, result.filePath, () => {});

        return result.filePath;
    }

    if (name === 'docs') {
        const routes: Record<string, string> = {wordpress: '/guide/wordpress.html', server: '/guide/quick-start.html', home: '/'};
        const route = routes[String(payload)];

        if (!route) {
            throw new Error('Unknown documentation page.');
        }

        await shell.openExternal(releaseOrigin + route);

        return null;
    }

    throw new Error('Unsupported desktop action.');
}

async function createWindow(): Promise<void> {
    window = createDesktopWindow(__dirname);
    window.on('close', event => {
        if (!closing) {
            event.preventDefault();
            app.quit();
        }
    });

    await loadDesktopWindow(window, __dirname);

}

app.whenReady().then(async () => {
    storageAvailable = await safeStorage.isAsyncEncryptionAvailable();

    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
        storageAvailable = false;
    }

    store = new ProfileStore(app.getPath('userData'), {
        isEncryptionAvailable: () => storageAvailable,
        encryptString: value => safeStorage.encryptStringAsync(value),
        decryptString: async value => (await safeStorage.decryptStringAsync(value)).result,
    });
    bridges = new BridgeManager(join(app.getPath('userData'), 'bridges'), changed, join(__dirname, 'worker.js'));
    releases = new ReleaseService(join(__dirname, '../../../docs/public/releases'));
    await store.load();
    await releases.loadLocal();
    ipcMain.handle('ptp:action', async (event, name: Action, payload: unknown) => {
        if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
            return {error: 'This desktop request is not allowed.'};
        }

        try {
            return {value: await action(name, payload)};
        } catch (error) {
            return {error: (error as Error).message};
        }
    });
    await createWindow();
}).catch(error => {
    dialog.showErrorBox('PTP could not start', (error as Error).message);
    closing = true;
    app.quit();
});

app.on('before-quit', event => {
    if (!closing && bridges) {
        event.preventDefault();
        closing = true;
        void bridges.stopAll().finally(() => app.quit());
    }
});

app.on('window-all-closed', () => app.quit());
