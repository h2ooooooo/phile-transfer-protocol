import {contextBridge, ipcRenderer} from 'electron';
import type {Action, DesktopAPI, Snapshot} from '../shared/types';

const actions: Action[] = ['snapshot', 'save', 'remove', 'import', 'start', 'stop', 'test', 'refresh', 'download', 'clearLogs', 'docs', 'copyPassword'];
const api: DesktopAPI = {
    invoke: (action, payload) => {
        if (!actions.includes(action)) {
            return Promise.resolve({error: 'Unsupported desktop action.'});
        }

        return ipcRenderer.invoke('ptp:action', action, payload);
    },
    subscribe: listener => {
        const handler = (_event: Electron.IpcRendererEvent, state: Snapshot) => listener(state);

        ipcRenderer.on('ptp:state', handler);

        return () => ipcRenderer.removeListener('ptp:state', handler);
    },
};

contextBridge.exposeInMainWorld('ptp', api);
