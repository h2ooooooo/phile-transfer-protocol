import {BrowserWindow} from 'electron';
import {join} from 'node:path';

export function createDesktopWindow(directory: string, show = true): BrowserWindow {
    const window = new BrowserWindow({
        width: 1260, height: 860, minWidth: 900, minHeight: 650, show,
        title: 'PTP', backgroundColor: '#f5f7f5', autoHideMenuBar: true,
        webPreferences: {preload: join(directory, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false},
    });

    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    return window;
}

export async function loadDesktopWindow(window: BrowserWindow, directory: string): Promise<void> {
    if (process.env.ELECTRON_RENDERER_URL) {
        await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        await window.loadFile(join(directory, '../renderer/index.html'));
    }

}
