import {createServer, Server} from 'net';
import {PassThrough} from 'stream';
import {createLogger, Logger, transports} from 'winston';
import {Config} from '../src/Config';
import {ServerUtils} from '../src/ServerUtils';

function listen(server: Server): Promise<number> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();

            if (!address || typeof address === 'string') {
                reject(new Error('Expected an ephemeral TCP port'));

                return;
            }

            resolve(address.port);
        });
    });
}

function close(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close(error => {
            if (error) {
                reject(error);

                return;
            }

            resolve();
        });
    });
}

async function freePort(): Promise<number> {
    const reservation = createServer();
    const port = await listen(reservation);

    await close(reservation);

    return port;
}

function configuration(port: number): Config {
    const config = new Config();

    Object.assign(config, {
        host: '127.0.0.1',
        port,
        passiveUrl: '127.0.0.1',
        apiUsername: 'fixture',
        apiPassword: 'fixture-password',
        apiEndPoint: 'https://example.invalid/ptp.php',
    });

    return config;
}

describe('FTP server lifecycle', () => {
    const bridge = ServerUtils.getInstance();
    let loggers: Logger[];
    let cleanup: Array<() => Promise<void>>;

    beforeEach(() => {
        loggers = [];
        cleanup = [];
        jest.spyOn(bridge as any, 'createApplicationLogger').mockImplementation(() => {
            const logger = createLogger({
                silent: true,
                transports: [new transports.Stream({stream: new PassThrough()})],
            });

            jest.spyOn(logger, 'close');
            loggers.push(logger);

            return logger;
        });
    });

    afterEach(async () => {
        await bridge.stopServer();

        for (const operation of cleanup) {
            await operation();
        }

        jest.restoreAllMocks();
    });

    test('closes loggers and resets state after startup failure, then permits retry', async () => {
        const occupied = createServer();
        const port = await listen(occupied);

        cleanup.push(() => close(occupied));
        await expect(bridge.startWithConfig(configuration(port))).rejects.toMatchObject({code: 'EADDRINUSE'});
        expect(bridge.getServer()).toBeNull();
        expect(bridge.getConfig()).toBeNull();
        expect(loggers[0].close).toHaveBeenCalledTimes(1);

        await bridge.startWithConfig(configuration(await freePort()));
        expect(bridge.getServer()).not.toBeNull();
        await bridge.stopServer();
        expect(loggers[1].close).toHaveBeenCalledTimes(1);
    });

    test('repeated startup and shutdown do not install process signal listeners', async () => {
        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        const listenerCounts = signals.map(signal => process.listenerCount(signal));

        for (let index = 0; index < 2; index++) {
            await bridge.startWithConfig(configuration(await freePort()));
            expect(bridge.getServer()?.options.endOnProcessSignal).toBe(false);
            await bridge.stopServer();
        }

        expect(signals.map(signal => process.listenerCount(signal))).toEqual(listenerCounts);
        expect(loggers.every(logger => (logger.close as jest.Mock).mock.calls.length === 1)).toBe(true);
    });

    test('releases a logger created for an external configuration without starting a server', async () => {
        bridge.setConfig(configuration(await freePort()));
        await bridge.stopServer();

        expect(loggers[0].close).toHaveBeenCalledTimes(1);
        expect(bridge.getServer()).toBeNull();
        expect(bridge.getConfig()).toBeNull();
    });
});
