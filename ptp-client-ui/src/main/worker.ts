import {createRequire} from 'node:module';
import type {Credentials} from '../shared/types';

// The worker loads the real client, with its own lifecycle and client-owned logs.
const clientRequire = createRequire(require.resolve('@jalsoedesign/phile-transfer-protocol-client/package.json'));
const {ServerUtils} = clientRequire('./dist/src/ServerUtils.js');
const {Config} = clientRequire('./dist/src/Config.js');
const bridge = ServerUtils.getInstance();
const parent = (process as unknown as {
    parentPort: {on(event: string, listener: (event: {data: {action: string; profile?: Credentials}}) => void): void; postMessage(value: unknown): void};
}).parentPort;

parent.on('message', async ({data}) => {
    try {
        if (data.action === 'start' && data.profile) {
            const profile = data.profile;
            const config = new Config();

            Object.assign(config, {
                host: profile.host, port: profile.port, passiveUrl: profile.passiveUrl,
                apiEndPoint: profile.apiEndPoint, apiUsername: profile.apiUsername,
                apiPassword: profile.password, printCommands: false,
                requestTransport: profile.requestTransport || 'encrypted',
            });
            await bridge.startWithConfig(config);
            parent.postMessage({phase: 'running'});
        } else if (data.action === 'stop') {
            await bridge.stopServer();
            process.exit(0);
        }
    } catch (error) {
        parent.postMessage({phase: 'error', error: (error as Error).message});
        process.exit(1);
    }
});
