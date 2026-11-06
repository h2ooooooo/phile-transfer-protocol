import type {Action, DesktopAPI, Snapshot} from '../shared/types';

// This visual fixture never starts a bridge or accesses credentials or the network.
export function previewAPI(): DesktopAPI {
    const snapshot: Snapshot = {
        profiles: [
            {id: 'preview-wordpress', name: 'WordPress example', kind: 'wordpress', apiEndPoint: 'https://example.com/wp-json/ptp/v1/files', apiUsername: 'operator', host: '127.0.0.1', port: 8021, passiveUrl: '127.0.0.1', hasPassword: true},
            {id: 'preview-php', name: 'PHP example', kind: 'php', apiEndPoint: 'https://example.org/ptp-server.php', apiUsername: 'operator', host: '127.0.0.1', port: 8022, passiveUrl: '127.0.0.1', hasPassword: true},
        ],
        bridges: [], logs: [], secureStorage: true, release: null,
    };

    return {
        async invoke<T>(action: Action) {
            if (action === 'snapshot') {
                return {value: snapshot as T};
            }

            return {error: 'Browser preview only. Run npm run dev in ptp-client-ui to use desktop actions.'};
        },
        subscribe: () => () => {},
    };
}
