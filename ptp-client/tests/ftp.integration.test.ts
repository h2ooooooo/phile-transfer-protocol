import {Client} from 'basic-ftp';
import {Config} from '../src/Config';
import {ServerUtils} from '../src/ServerUtils';
import * as fs from 'fs';
import * as path from 'path';
import {Readable, Writable} from 'stream';

describe('FTP Integration Tests', () => {
    let client: Client;
    let config: Config;
    const testFileName = 'integration-test.txt';
    const testContent = 'Hello from integration test!';

    beforeAll(async () => {
        config = new Config();
        const configPath = process.env.PTP_TEST_CONFIG || config.findConfigPath(__dirname, 'test.yaml');

        config.loadConfig(configPath);

        // Start the server
        const serverUtils = ServerUtils.getInstance();

        try {
            await serverUtils.startServer(configPath);
        } catch (err) {
            console.error('Failed to start FTP server for integration tests:', err);

            throw err;
        }

        client = new Client();
        client.ftp.verbose = false;

        try {
            await client.access({
                host: config.host,
                port: config.port,
                user: config.apiUsername,
                password: config.apiPassword,
                secure: false
            });
        } catch (err) {
            console.error('Failed to connect to FTP server for integration tests.');

            throw err;
        }
    });

    afterAll(async () => {
        if (client) {
            client.close();
        }

        await ServerUtils.getInstance().stopServer();
    });

    test('should list files', async () => {
        const list = await client.list();

        expect(Array.isArray(list)).toBe(true);
    });

    test('should upload, download, and delete a file', async () => {
        const localFilePath = path.join(__dirname, testFileName);

        fs.writeFileSync(localFilePath, testContent);

        try {
            // Upload
            await client.uploadFrom(localFilePath, testFileName);

            // List to verify
            const list = await client.list();

            expect(list.some(f => f.name === testFileName)).toBe(true);

            // Download
            const downloadPath = path.join(__dirname, 'downloaded-' + testFileName);

            await client.downloadTo(downloadPath, testFileName);
            const downloadedContent = fs.readFileSync(downloadPath, 'utf8');

            expect(downloadedContent).toBe(testContent);
            fs.unlinkSync(downloadPath);

            // Delete
            await client.remove(testFileName);
            const listAfterDelete = await client.list();

            expect(listAfterDelete.some(f => f.name === testFileName)).toBe(false);

        } finally {
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath);
            }
        }
    });

    test('should create and remove a directory', async () => {
        const dirName = 'test-dir-' + Date.now();

        try {
            await client.ensureDir(dirName);
            // If it didn't throw, we assume success or handle list inconsistencies separately
            expect(await client.pwd()).toBe('/' + dirName);
            await client.cd('..');

            await client.removeDir(dirName);
        } catch (err: any) {
            throw err;
        }
    });

    test('should handle magic commands via FTP paths', async () => {
        // According to RestFileSystem, accessing a path that is a command throws an error with the output.
        // In FTP, this might manifest as a failed CWD or SIZE or MDTM command.
        // Let's try to 'cd' into a command.
        await expect(client.cd('{MAGIC}')).rejects.toThrow('THE WORLD IS MAGIC');
    });

    async function download(name: string): Promise<Buffer> {
        const chunks: Buffer[] = [];

        await client.downloadTo(new Writable({write(chunk, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        }}), name);

        return Buffer.concat(chunks);
    }

    test.each(['overwrite.txt', 'a&b.txt', 'a#b.txt', 'a+b.txt', '0.txt'])('round-trips and overwrites %s', async name => {
        await client.uploadFrom(Readable.from([Buffer.from('OLD')]), name);
        await client.uploadFrom(Readable.from([Buffer.from('NEW'), Buffer.from([0, 255, 13, 10])]), name);
        expect(await download(name)).toEqual(Buffer.concat([Buffer.from('NEW'), Buffer.from([0, 255, 13, 10])]));
        await client.uploadFrom(Readable.from([]), name);
        expect(await download(name)).toEqual(Buffer.alloc(0));
        await client.remove(name);
    });

    test('appends and resumes files, and consumes each restart offset once', async () => {
        const name = 'append-and-resume.txt';

        try {
            await client.uploadFrom(Readable.from(['original']), name);
            await client.appendFrom(Readable.from(['-suffix']), name);
            expect((await download(name)).toString()).toBe('original-suffix');

            await client.send('REST 4');
            await client.uploadFrom(Readable.from(['-replacement']), name);
            expect((await download(name)).toString()).toBe('orig-replacement');

            await client.uploadFrom(Readable.from(['new']), name);
            expect((await download(name)).toString()).toBe('new');

            const chunks: Buffer[] = [];

            await client.downloadTo(new Writable({write(chunk, _encoding, callback) {
                chunks.push(Buffer.from(chunk));
                callback();
            }}), name, 1);
            expect(Buffer.concat(chunks).toString()).toBe('ew');
            expect((await download(name)).toString()).toBe('new');
        } finally {
            await client.remove(name, true);
        }
    });

    test('rejects missing CWD and ordinary files', async () => {
        await expect(client.cd('/no-such-directory')).rejects.toThrow();
        await expect(client.cd('/documents/index.txt')).rejects.toThrow();
        expect(await client.pwd()).toBe('/');
    });

    test('refuses read, write and rename through an escaping directory link', async () => {
        const root = process.env.PTP_TEST_ROOT!;
        const outside = path.join(path.dirname(root), 'outside');

        fs.mkdirSync(outside);
        const marker = path.join(outside, 'marker.txt');

        fs.writeFileSync(marker, 'UNCHANGED');
        const link = path.join(root, 'linked');

        fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');

        try {
            await expect(download('/linked/marker.txt')).rejects.toThrow();
            await expect(client.uploadFrom(Readable.from([Buffer.from('BAD')]), '/linked/marker.txt')).rejects.toThrow();
            await expect(client.rename('/documents/index.txt', '/linked/moved.txt')).rejects.toThrow();
            expect(fs.readFileSync(marker, 'utf8')).toBe('UNCHANGED');
            expect((await client.list('/')).some(file => file.name === 'linked')).toBe(false);
        } finally {
            fs.unlinkSync(link);
        }
    });
});
