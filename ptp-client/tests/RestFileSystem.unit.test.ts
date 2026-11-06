import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {RestFileSystem} from '../src/RestFileSystem';
import {Logger} from 'winston';
import {FtpServer, FtpConnection} from '../src/ftp/FtpEngine';
import {FtpFileSystemAdapter} from '../src/ftp/FtpFileSystemAdapter';
import {Client} from 'basic-ftp';
import {Readable} from 'stream';

describe('RestFileSystem Mocked API', () => {
    let mock: MockAdapter;
    let fs: RestFileSystem;
    let logger: Logger;

    beforeEach(() => {
        mock = new MockAdapter(axios);
        logger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        } as any;

        // Mocking FtpConnection
        const connection = {
            reply: jest.fn(),
        } as any;

        fs = new RestFileSystem(connection, {
            logger,
            endPointUrl: 'https://api.example.com/ptp.php',
            apiUsername: 'test',
            apiPassword: 'test'
        });
    });

    afterEach(() => {
        mock.restore();
    });

    describe('path normalization (fixPath)', () => {
        test('should normalize relative paths', () => {
            // @ts-ignore - accessing private method for testing
            const path = fs.fixPath('folder/file.txt', true, 'test');

            expect(path).toBe('/folder/file.txt');
        });

        test('should handle absolute paths', () => {
            // @ts-ignore
            const path = fs.fixPath('/absolute/path', true, 'test');

            expect(path).toBe('/absolute/path');
        });

        test('should handle double slashes', () => {
            // @ts-ignore
            const path = fs.fixPath('//folder//file.txt', true, 'test');

            expect(path).toBe('/folder/file.txt');
        });

        test('should handle backslashes', () => {
            // @ts-ignore
            const path = fs.fixPath('folder\\file.txt', true, 'test');

            expect(path).toBe('/folder/file.txt');
        });

        test('should handle dot segments', () => {
            // @ts-ignore
            const path = fs.fixPath('folder/../file.txt', true, 'test');

            expect(path).toBe('/file.txt');
        });
    });

    describe('API response parsing', () => {
        test('should parse direct JSON response', async () => {
            mock.onGet(/action=get/).reply(200, {
                success: true,
                file: {
                    name: 'test.txt',
                    size: 100,
                    modified: 1700000000,
                    isDirectory: false
                }
            });

            const result = await fs.get('test.txt');

            expect(result.name).toBe('test.txt');
            expect(result.isDirectory()).toBe(false);
        });

        test('should reject a response contaminated with output', async () => {
            const responseWithNoise = `
                Some PHP warnings or logs here
                {"file": {"name": "noisy.txt", "size": 50, "isDirectory": false}}
            `;

            mock.onGet(/action=get/).reply(200, responseWithNoise);

            await expect(fs.get('noisy.txt')).rejects.toThrow('Invalid PTP response');
        });
    });

    describe('error handling', () => {
        test('should handle 404 error', async () => {
            mock.onGet(/action=get/).reply(404);

            await expect(fs.get('missing.txt')).rejects.toThrow();
        });

        test('should handle 401 error', async () => {
            mock.onGet(/action=get/).reply(401);

            await expect(fs.get('secret.txt')).rejects.toThrow();
        });
    });

    describe('directory listing', () => {
        test('should list directory contents', async () => {
            mock.onGet(/action=list/).reply(200, {
                success: true,
                list: [
                    {name: 'file1.txt', size: 10, modified: 1700000000, isDirectory: false},
                    {name: 'dir1', size: 0, modified: 1700000000, isDirectory: true}
                ]
            });

            const list = await fs.list('/');

            expect(list).toHaveLength(2);
            expect(list[0].name).toBe('file1.txt');
            expect(list[1].isDirectory()).toBe(true);
        });
    });

    test.each(['a&b.txt', 'a#b.txt', 'a+b.txt', 'a?b.txt', '100%.txt'])('encodes filename %s exactly', name => {
        const url = new URL(fs.generateActionUrl('read', {path: '/' + name}));

        expect(url.searchParams.get('path')).toBe('/' + name);
        expect(url.hash).toBe('');
    });

    test('rejects an HTML listing rather than inventing an empty directory', async () => {
        mock.onGet(/action=list/).reply(200, '<html>Hosting error</html>');
        await expect(fs.list('/')).rejects.toThrow('Invalid PTP response');
    });

    test('propagates API unavailability without leaking request credentials', async () => {
        mock.onGet(/action=list/).networkError();
        await expect(fs.list('/')).rejects.toThrow('PTP connection failed');
    });

    test('forwards every WordPress access blocker', async () => {
        mock.onGet(/action=get/).reply(403, {
            code: 'ptp_disabled',
            message: 'PTP access is disabled.',
            data: {blockers: {
                ptp_disabled: 'PTP access is disabled.',
                ptp_edit_themes: 'This account lacks the edit_themes permission.',
            }},
        });

        await expect(fs.get('/')).rejects.toThrow('PTP request failed (HTTP 403): PTP access is disabled. This account lacks the edit_themes permission.');
    });

    test('forwards authentication guidance from WordPress', async () => {
        mock.onGet(/action=get/).reply(401, {
            code: 'ptp_auth',
            message: 'WordPress did not authenticate this request with an Application Password.',
        });

        await expect(fs.get('/')).rejects.toThrow('WordPress did not authenticate this request with an Application Password.');
    });

    test('removes credentials and line breaks from access errors', async () => {
        mock.onGet(/action=get/).reply(403, {
            code: 'ptp_disabled',
            message: 'Password test\r\nInjected FTP reply',
        });

        await expect(fs.get('/')).rejects.toThrow('Password [redacted]  Injected FTP reply');
    });

    test.each([
        ['ptp_read_only', 'PTP permissions are set to Read only.'],
        ['ptp_folder_denied', 'Folder access is disabled for /plugins/private.'],
        ['ptp_root_invalid', 'The FTP root is unavailable.'],
        ['ptp_no_folders', 'No folders are selected for FTP access.'],
    ])('forwards the %s access reason', async (code, message) => {
        mock.onGet(/action=get/).reply(403, {code, message});

        await expect(fs.get('/')).rejects.toThrow(message);
    });

    test('does not forward arbitrary remote error bodies', async () => {
        mock.onGet(/action=get/).reply(403, {
            code: 'hosting_error',
            message: 'Password test',
        });

        await expect(fs.get('/')).rejects.toThrow('PTP request failed (HTTP 403)');
    });

    test('forwards access errors from streamed download responses', async () => {
        const body = JSON.stringify({code: 'ptp_edit_themes', message: 'This account lacks the edit_themes permission.'});

        mock.onGet(/action=read/).reply(403, Readable.from([body]));

        await expect(fs.read('/file.txt')).rejects.toThrow('This account lacks the edit_themes permission.');
    });

    test.each(['text/html', 'application/json', ''])('rejects and closes a successful %s download response', async contentType => {
        const body = Readable.from(['<html>Sign in</html>']);

        mock.onGet(/action=read/).reply(200, body, {'Content-Type': contentType});

        await expect(fs.read('/file.txt')).rejects.toThrow('Invalid PTP download response');
        expect(body.destroyed).toBe(true);
    });

    test('accepts binary download responses with media type parameters', async () => {
        const body = Readable.from([Buffer.from([0, 255, 13, 10])]);

        mock.onGet(/action=read/).reply(200, body, {'Content-Type': 'Application/Octet-Stream; charset=binary'});

        expect(await fs.read('/file.bin')).toBe(body);
        body.destroy();
    });

    test('returns the WordPress reason in the FTP control reply', async () => {
        mock.onGet(/action=get/).reply(403, {
            code: 'ptp_edit_themes',
            message: 'This account lacks the edit_themes permission.',
        });

        const server = new FtpServer({
            endOnProcessSignal: false,
            url: 'ftp://127.0.0.1:0',
            pasv_url: '127.0.0.1',
            log: {
                trace: jest.fn(),
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                fatal: jest.fn(),
                child() {
                    return this;
                },
            },
        });

        server.on('login', (data: {connection: FtpConnection}, resolve: Function) => {
            resolve({fs: new FtpFileSystemAdapter(data.connection, fs)});
        });

        const client = new Client();

        try {
            await server.listen();
            const port = (server as any).server.address().port;

            await client.access({host: '127.0.0.1', port, user: 'test', password: 'test'});

            await expect(client.cd('/')).rejects.toThrow('This account lacks the edit_themes permission.');
            await expect(client.list('/')).rejects.toThrow('This account lacks the edit_themes permission.');
        } finally {
            client.close();
            await server.close();
        }
    });

    test('does not change working directory after an invalid CWD', async () => {
        mock.onGet(/action=get/).reply(404);
        await expect(fs.chdir('/missing')).rejects.toThrow();
        expect(fs.currentDirectory()).toBe('/');
        mock.onGet(/action=get/).reply(200, {success: true, file: {name: 'file', size: 1, modified: 1700000000, isDirectory: false}});
        await expect(fs.chdir('/file')).rejects.toThrow('Not a directory');
        expect(fs.currentDirectory()).toBe('/');
    });

    test('returns Read only errors to FTP uploads', async () => {
        mock.onPost(/action=uploadBegin/).reply(403, {code: 'ptp_read_only', message: 'PTP permissions are set to Read only.'});
        const server = new FtpServer({
            endOnProcessSignal: false,
            url: 'ftp://127.0.0.1:0',
            pasv_url: '127.0.0.1',
            log: {
                trace: jest.fn(),
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                fatal: jest.fn(),
                child() {
                    return this;
                },
            },
        });

        server.on('login', (data: {connection: FtpConnection}, resolve: Function) => {
            resolve({fs: new FtpFileSystemAdapter(data.connection, fs)});
        });
        const client = new Client();

        try {
            await server.listen();
            const port = (server as any).server.address().port;

            await client.access({host: '127.0.0.1', port, user: 'test', password: 'test'});

            await expect(client.uploadFrom(Readable.from(['blocked']), 'readonly.txt')).rejects.toThrow('PTP permissions are set to Read only.');
        } finally {
            client.close();
            await server.close();
        }
    });

    test('serializes the FTP numeric chmod mode as octal', async () => {
        mock.onPost(/action=chmod/).reply(config => {
            expect(new URL(config.url!).searchParams.get('mode')).toBe('644');

            return [200, {success: true}];
        });
        await fs.chmod('/file', 0o644);
    });

    test('preserves endpoint query parameters', () => {
        const remote = new RestFileSystem({} as any, {logger, endPointUrl: 'https://example.com/ptp.php?site=1', apiUsername: 'test', apiPassword: 'test'});
        const url = new URL(remote.generateActionUrl('read', {path: '/a'}));

        expect(url.searchParams.get('site')).toBe('1');
        expect(url.searchParams.get('action')).toBe('read');
    });
});
