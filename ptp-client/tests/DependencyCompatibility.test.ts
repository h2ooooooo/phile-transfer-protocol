import {createLogger} from 'winston';
import {FtpLogger} from '../src/util/FtpLogger';
import {createRequire} from 'module';
import {spawnSync} from 'child_process';
import path from 'path';

describe('PTP development startup', () => {
    test('loads the source entry dependencies in an independent tsx process', () => {
        const environment = {...process.env};

        // Verify the project config works without an environment-variable workaround.
        delete environment.TS_NODE_FILES;
        const result = spawnSync(process.execPath, [
            '--import', 'tsx',
            '-e', 'require(\'./src/RestFileSystem\'); console.log(\'PTP startup source loaded\');',
        ], {
            cwd: path.resolve(__dirname, '..'),
            env: environment,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 20000,
        });

        expect(result.error).toBeUndefined();
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('PTP startup source loaded');
    });
});

describe('FTP engine compatibility', () => {
    test('loads the maintained engine through its public CommonJS entry', () => {
        expect(typeof require('@electerm/ftp-srv')).toBe('function');
    });

    test('does not ship the former FTP server or Bunyan dependencies', () => {
        const manifest = require('../package.json');

        for (const name of ['ftp-srv', 'bunyan', '@types/bunyan']) {
            expect(manifest.dependencies[name]).toBeUndefined();
            expect(manifest.devDependencies[name]).toBeUndefined();
            expect(manifest.bundleDependencies).not.toContain(name);
            expect(() => require.resolve(name)).toThrow();
        }
    });

    test.each([
        ['ftp://[::1]:21', 21],
        ['ftp://[::1]:2121', 2121],
        ['ftp://[::1]:0', 0],
        ['ftps://[::1]:990', 990],
    ])('preserves the configured port for %s', async (url, port) => {
        const {FtpServer} = require('../src/ftp/FtpEngine');
        const server = new FtpServer({url, endOnProcessSignal: false, log: new FtpLogger(createLogger({silent: true}))});

        expect(server.port).toBe(port);
        await server.close();
    });

    test('binds IPv6 loopback with an ephemeral port', async () => {
        const {FtpServer} = require('../src/ftp/FtpEngine');
        const server = new FtpServer({url: 'ftp://[::1]:0', endOnProcessSignal: false, log: new FtpLogger(createLogger({silent: true}))});

        try {
            await server.listen();
            expect(server.server.address()).toMatchObject({address: '::1', family: 'IPv6'});
        } finally {
            await server.close();
        }
    });
});

describe('FTP disconnect deadlines', () => {
    test.each([false, true])('cleans up its deadline and socket after stalled close=%s', async stalled => {
        const {FtpServer} = require('../src/ftp/FtpEngine');
        const server = new FtpServer({endOnProcessSignal: false, timeout: 25, log: new FtpLogger(createLogger({silent: true}))});
        const client = {
            close: jest.fn(async () => {
                if (stalled) {
                    await new Promise(() => {});
                }
            }),
            connector: {end: jest.fn()},
            commandSocket: {destroy: jest.fn()},
        };

        jest.useFakeTimers();

        try {
            server.connections.fixture = client;
            const disconnected = server.disconnectClient('fixture');

            if (stalled) {
                await jest.advanceTimersByTimeAsync(25);
            }

            await disconnected;
            expect(jest.getTimerCount()).toBe(0);
            expect(server.connections.fixture).toBeUndefined();
            expect(client.commandSocket.destroy).toHaveBeenCalledTimes(Number(stalled));
            expect(client.connector.end).toHaveBeenCalledTimes(Number(stalled));
        } finally {
            jest.useRealTimers();
            await server.close();
        }
    });
});
const jestRequire = createRequire(require.resolve('jest-config/package.json'));
const merge = jestRequire('deepmerge');

describe('Jest merge dependency security and compatibility', () => {
    test.each(['target', 'source'])('drops prototype keys from the %s input', placement => {
        const payload = JSON.parse('{"__proto__":{"ptpPrototypePoisoned":true},"safe":1}');
        const target = placement === 'target' ? payload : {};
        const source = placement === 'source' ? payload : {};
        const result = merge(target, source);

        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
        expect(result.ptpPrototypePoisoned).toBeUndefined();
        expect(result.safe).toBe(1);
        expect(({} as Record<string, unknown>).ptpPrototypePoisoned).toBeUndefined();
    });

    test.each(['target', 'source'])('blocks nested prototype poisoning from the %s input', placement => {
        const payload = JSON.parse('{"nested":{"__proto__":{"ptpPrototypePoisoned":true},"safe":1}}');
        const result = placement === 'target' ? merge(payload, {}) : merge({}, payload);

        expect(Object.getPrototypeOf(result.nested)).toBe(Object.prototype);
        expect(result.nested.ptpPrototypePoisoned).toBeUndefined();
        expect(result.nested.safe).toBe(1);
    });

    test('merges preset globals recursively without mutating either input', () => {
        const preset = {nested: {preset: true, overridden: 'preset'}, list: [1]};
        const options = {nested: {local: true, overridden: 'local'}, list: [2]};
        const result = merge(preset, options);

        expect(result).toEqual({
            nested: {preset: true, local: true, overridden: 'local'},
            list: [1, 2],
        });
        expect(preset).toEqual({nested: {preset: true, overridden: 'preset'}, list: [1]});
        expect(options).toEqual({nested: {local: true, overridden: 'local'}, list: [2]});
    });
});

const patchedGlob = jestRequire('glob');
const transformRequire = createRequire(require.resolve('@jest/transform'));
const istanbulRequire = createRequire(transformRequire.resolve('babel-plugin-istanbul'));
const TestExclude = istanbulRequire('test-exclude');

describe('Jest patched glob and coverage compatibility', () => {
    test('honors cancellation before traversing test directories', async () => {
        const controller = new AbortController();

        controller.abort();

        await expect(patchedGlob.glob('**/*', {
            cwd: __dirname,
            signal: controller.signal,
        })).rejects.toMatchObject({name: 'AbortError'});
    });

    test('preserves coverage inclusion and exclusion through patched glob and minimatch', async () => {
        const sourceRoot = path.resolve(__dirname, '../src');
        const exclusion = new TestExclude({
            cwd: sourceRoot,
            extension: ['.ts'],
            include: ['**/*.ts'],
            exclude: ['**/util/**'],
        });
        const synchronous = exclusion.globSync();
        const asynchronous = await exclusion.glob();

        expect(synchronous).toContain('Config.ts');
        expect(synchronous.some((file: string) => file.replace(/\\/g, '/').startsWith('util/'))).toBe(false);
        expect([...asynchronous].sort()).toEqual([...synchronous].sort());
        expect(exclusion.shouldInstrument(path.join(sourceRoot, 'Config.ts'))).toBe(true);
        expect(exclusion.shouldInstrument(path.join(sourceRoot, 'util/validateEndpoint.ts'))).toBe(false);
    });
});
