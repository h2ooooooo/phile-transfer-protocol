import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {Client} from 'basic-ftp';
import {once} from 'events';
import {Socket, createConnection} from 'net';
import {Readable, Writable} from 'stream';
import {Logger} from 'winston';
import {FtpServer, FtpConnection} from '../src/ftp/FtpEngine';
import {FtpFileSystemAdapter} from '../src/ftp/FtpFileSystemAdapter';
import {RestFileSystem} from '../src/RestFileSystem';

class ControlClient {
    private readonly replies: string[] = [];
    private pending?: (reply: string) => void;
    private buffer: string = '';

    public constructor(public readonly socket: Socket) {
        socket.on('data', bytes => {
            this.buffer += bytes.toString('utf8');

            while (this.buffer.includes('\r\n')) {
                const end = this.buffer.indexOf('\r\n');
                const line = this.buffer.slice(0, end);

                this.buffer = this.buffer.slice(end + 2);

                if (!/^\d{3} /.test(line)) {
                    continue;
                }

                if (this.pending) {
                    const resolve = this.pending;

                    this.pending = undefined;
                    resolve(line);
                } else {
                    this.replies.push(line);
                }
            }
        });
    }

    public async reply(): Promise<string> {
        const queued = this.replies.shift();

        if (queued) {
            return queued;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending = undefined;
                reject(new Error('Timed out waiting for FTP reply'));
            }, 10000);

            this.pending = reply => {
                clearTimeout(timeout);
                resolve(reply);
            };
        });
    }

    public async command(command: string): Promise<string> {
        this.socket.write(command + '\r\n');

        return this.reply();
    }

    public async passiveData(localAddress?: string): Promise<Socket> {
        const reply = await this.command('PASV');
        const match = reply.match(/\((\d+,\d+,\d+,\d+,\d+,\d+)\)/);

        expect(match).not.toBeNull();

        const address = match![1].split(',').map(Number);
        const socket = createConnection({host: '127.0.0.1', port: address[4] * 256 + address[5], localAddress});

        await once(socket, 'connect');

        return socket;
    }
}

describe('FTP engine filesystem adapter', () => {
    let mock: MockAdapter;
    let server: FtpServer;
    let port: number;
    let client: Client;
    let beginRequests: URL[];
    let aborts: number;
    let commits: number;
    const uploadId = 'a'.repeat(64);
    const openSockets: Socket[] = [];

    beforeEach(async () => {
        mock = new MockAdapter(axios);
        beginRequests = [];
        aborts = 0;
        commits = 0;

        const logger = {debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()} as unknown as Logger;

        server = new FtpServer({
            url: 'ftp://127.0.0.1:0',
            pasv_url: '127.0.0.1',
            endOnProcessSignal: false,
            log: {
                trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
                child() {
                    return this;
                },
            },
        });
        server.on('login', (data: {connection: FtpConnection}, resolve: Function) => {
            const remote = new RestFileSystem(data.connection, {
                endPointUrl: 'https://api.example.com/ptp.php',
                apiUsername: 'test', apiPassword: 'test', logger,
            });

            resolve({fs: new FtpFileSystemAdapter(data.connection, remote)});
        });
        mock.onPost(/action=uploadBegin/).reply(config => {
            beginRequests.push(new URL(config.url!));

            return [200, {success: true, upload: {id: uploadId, offset: 0, maxChunkSize: 4}}];
        });
        mock.onPost(/action=uploadWrite/).reply(config => {
            const offset = Number(new URL(config.url!).searchParams.get('offset')) + Buffer.byteLength(config.data);

            return [200, {success: true, upload: {id: uploadId, offset}}];
        });
        mock.onPost(/action=uploadCommit/).reply(config => {
            const query = new URL(config.url!).searchParams;

            commits++;

            return [200, {success: true, size: Number(query.get('size')), sha256: query.get('sha256')}];
        });
        mock.onPost(/action=uploadAbort/).reply(() => {
            aborts++;

            return [200, {success: true}];
        });

        await server.listen();
        const address = server.server.address();

        if (!address || typeof address === 'string') {
            throw new Error('Missing FTP listener address');
        }

        port = address.port;
        client = new Client();
        await client.access({host: '127.0.0.1', port, user: 'test', password: 'test'});
    });

    afterEach(async () => {
        client.close();

        for (const socket of openSockets.splice(0)) {
            socket.destroy();
        }

        await server.close();
        mock.restore();
    });

    async function rawClient(): Promise<ControlClient> {
        const socket = createConnection({host: '127.0.0.1', port});
        const control = new ControlClient(socket);

        openSockets.push(socket);
        expect(await control.reply()).toMatch(/^220 /);
        expect(await control.command('USER test')).toMatch(/^331 /);
        expect(await control.command('PASS test')).toMatch(/^230 /);

        return control;
    }

    test('STOR waits for remote commit and also commits empty files', async () => {
        let acknowledgeCommit!: () => void;
        const commitStarted = new Promise<void>(resolve => {
            mock.onPost(/action=uploadCommit/).reply(config => new Promise(response => {
                acknowledgeCommit = () => {
                    const query = new URL(config.url!).searchParams;

                    response([200, {success: true, size: Number(query.get('size')), sha256: query.get('sha256')}]);
                };

                resolve();
            }));
        });
        let completed = false;
        const upload = client.uploadFrom(Readable.from(['hello']), '/file.bin').then(() => {
            completed = true;
        });

        await commitStarted;
        expect(completed).toBe(false);
        acknowledgeCommit();
        await upload;
        expect(completed).toBe(true);

        mock.onPost(/action=uploadCommit/).reply(config => {
            const query = new URL(config.url!).searchParams;

            expect(query.get('size')).toBe('0');

            return [200, {success: true, size: 0, sha256: query.get('sha256')}];
        });
        await client.uploadFrom(Readable.from([]), '/empty.bin');
    });

    test('propagates setup and commit failures without reporting upload success', async () => {
        mock.onPost(/action=uploadBegin/).reply(403, {code: 'ptp_read_only', message: 'Uploads are disabled'});
        await expect(client.uploadFrom(Readable.from(['blocked']), '/blocked')).rejects.toThrow('Uploads are disabled');

        mock.onPost(/action=uploadBegin/).reply(200, {success: true, upload: {id: uploadId, offset: 0, maxChunkSize: 4}});
        mock.onPost(/action=uploadCommit/).reply(409, {code: 'ptp_upload_conflict', message: 'Commit conflict'});
        await expect(client.uploadFrom(Readable.from(['conflict']), '/conflict')).rejects.toThrow('HTTP 409');
        expect(aborts).toBe(1);
    });

    test('consumes REST once for downloads and uploads, and supports APPE', async () => {
        const readOffsets: Array<string | null> = [];

        mock.onGet(/action=read/).reply(config => {
            readOffsets.push(new URL(config.url!).searchParams.get('start'));

            return [200, Readable.from(['content']), {'Content-Type': 'application/octet-stream'}];
        });
        const sink = () => new Writable({write(_bytes, _encoding, callback) {
            callback();
        }});

        await client.downloadTo(sink(), '/file', 3);
        await client.downloadTo(sink(), '/file');
        expect(readOffsets).toEqual(['3', null]);

        await client.send('REST 2');
        await client.uploadFrom(Readable.from(['resumed']), '/file');
        await client.uploadFrom(Readable.from(['replacement']), '/file');
        await client.appendFrom(Readable.from(['suffix']), '/file');

        expect(beginRequests.map(request => [request.searchParams.get('start'), request.searchParams.get('append')])).toEqual([
            ['2', 'false'], ['0', 'false'], ['0', 'true'],
        ]);
    });

    test('formats directory and ordinary file metadata for LIST and STAT', async () => {
        const directory = {name: '/', size: 0, modified: 1700000000, isDirectory: true};
        const file = {name: 'file with spaces.txt', size: 7, modified: 1700000000, isDirectory: false};

        mock.onGet(/action=get/).reply(200, {success: true, file: directory});
        mock.onGet(/action=list/).reply(200, {success: true, list: [file, {...directory, name: 'folder'}]});
        const list = await client.list('/');

        expect(list.map(entry => [entry.name, entry.size, entry.isDirectory])).toEqual([
            ['file with spaces.txt', 7, false], ['folder', 0, true],
        ]);
        expect((await client.send('STAT /')).code).toBe(213);
    });

    test('ABOR cancels a live upload and keeps commands from altering its session', async () => {
        const control = await rawClient();
        const data = await control.passiveData();

        openSockets.push(data);
        expect(await control.command('STOR /cancelled')).toMatch(/^150 /);
        data.write('partial-data');
        expect(await control.command('CWD /other')).toMatch(/^450 /);
        const abortReply = await control.command('ABOR');
        const transferReply = await control.reply();

        expect([abortReply, transferReply].some(reply => /^225 /.test(reply))).toBe(true);
        expect([abortReply, transferReply].some(reply => /^451 /.test(reply))).toBe(true);
        expect(aborts).toBe(1);
        expect(commits).toBe(0);
        expect(await control.command('NOOP')).toMatch(/^200 /);
    });

    test('a reset data socket aborts its remote upload', async () => {
        const control = await rawClient();
        const data = await control.passiveData();
        const firstChunk = new Promise<void>(resolve => {
            mock.onPost(/action=uploadWrite/).reply(config => {
                const offset = Number(new URL(config.url!).searchParams.get('offset')) + Buffer.byteLength(config.data);

                resolve();

                return [200, {success: true, upload: {id: uploadId, offset}}];
            });
        });

        expect(await control.command('STOR /disconnected')).toMatch(/^150 /);
        data.write('partial-data');
        await firstChunk;
        data.resetAndDestroy();

        expect(await control.reply()).toMatch(/^451 /);
        expect(aborts).toBe(1);
        expect(commits).toBe(0);
    });

    test('ABOR during remote session setup cleans up the late session', async () => {
        let finishSetup!: () => void;
        const setupStarted = new Promise<void>(resolve => {
            mock.onPost(/action=uploadBegin/).reply(() => new Promise(response => {
                finishSetup = () => response([200, {success: true, upload: {id: uploadId, offset: 0, maxChunkSize: 4}}]);
                resolve();
            }));
        });
        const control = await rawClient();
        const data = await control.passiveData();

        openSockets.push(data);
        expect(await control.command('STOR /cancelled-during-setup')).toMatch(/^150 /);
        data.write('partial-data');
        await setupStarted;
        expect(await control.command('ABOR')).toMatch(/^225 /);
        finishSetup();
        expect(await control.reply()).toMatch(/^451 /);
        expect(aborts).toBe(1);
        expect(commits).toBe(0);
    });

    test('a reset download data socket closes the upstream response', async () => {
        const response = new Readable({read() {}});

        mock.onGet(/action=read/).reply(200, response, {'Content-Type': 'application/octet-stream'});
        const control = await rawClient();
        const data = await control.passiveData();

        expect(await control.command('RETR /large-file')).toMatch(/^150 /);
        response.push(Buffer.alloc(64 * 1024));
        data.resetAndDestroy();

        expect(await control.reply()).toMatch(/^550 /);
        expect(response.destroyed).toBe(true);
    });

    test('does not open an HTTP response when the data connection never arrives', async () => {
        const control = await rawClient();

        expect(await control.command('PASV')).toMatch(/^227 /);
        expect(await control.command('RETR /not-opened')).toMatch(/^550 /);
        expect(mock.history.get).toHaveLength(0);
    });

    test.each(['RETR', 'STOR'])('rejects %s after its passive data socket has already closed', async directive => {
        const control = await rawClient();
        const data = await control.passiveData();
        const connection = Object.values(server.connections).find(candidate => candidate.commandSocket.remotePort === control.socket.localPort)!;
        const serverData = connection.connector.socket!;
        const closed = new Promise<void>(resolve => serverData.once('close', () => resolve()));

        data.resetAndDestroy();
        await closed;

        expect(await control.command(directive + ' /stale-data')).toMatch(/^150 /);
        expect(await control.reply()).toMatch(/^(451|550) /);
        expect(mock.history.get).toHaveLength(0);
        expect(beginRequests).toHaveLength(0);
        expect(commits).toBe(0);
    });

    test('ABOR during a pending HTTP read closes the late response', async () => {
        const response = new Readable({read() {}});
        let finishRead!: () => void;
        const readStarted = new Promise<void>(resolve => {
            mock.onGet(/action=read/).reply(() => new Promise(result => {
                finishRead = () => result([200, response, {'Content-Type': 'application/octet-stream'}]);
                resolve();
            }));
        });
        const control = await rawClient();
        const data = await control.passiveData();

        openSockets.push(data);
        expect(await control.command('RETR /pending')).toMatch(/^150 /);
        await readStarted;
        expect(await control.command('CWD /other')).toMatch(/^450 /);
        const abortReply = await control.command('ABOR');
        const transferReply = await control.reply();

        expect([abortReply, transferReply].some(reply => /^225 /.test(reply))).toBe(true);
        expect([abortReply, transferReply].some(reply => /^550 /.test(reply))).toBe(true);
        const closed = once(response, 'close');

        finishRead();
        await closed;
        expect(response.destroyed).toBe(true);
    });

    test('closing the control connection during a pending read closes the late response', async () => {
        const response = new Readable({read() {}});
        let finishRead!: () => void;
        const readStarted = new Promise<void>(resolve => {
            mock.onGet(/action=read/).reply(() => new Promise(result => {
                finishRead = () => result([200, response, {'Content-Type': 'application/octet-stream'}]);
                resolve();
            }));
        });
        const control = await rawClient();
        const data = await control.passiveData();

        openSockets.push(data);
        expect(await control.command('RETR /pending')).toMatch(/^150 /);
        await readStarted;

        const closed = once(response, 'close');

        control.socket.destroy();
        finishRead();
        await closed;
        expect(response.destroyed).toBe(true);
    });

    test('rejects active transfers to a different peer', async () => {
        const control = await rawClient();

        expect(await control.command('PORT 127,0,0,2,192,0')).toMatch(/^500 /);
        expect(await control.command('EPRT |1|127.0.0.2|49152|')).toMatch(/^500 /);
    });

    test('forwards SITE CHMOD modes without changing their octal representation', async () => {
        mock.onPost(/action=chmod/).reply(config => {
            const query = new URL(config.url!).searchParams;

            expect(query.get('mode')).toBe('644');
            expect(query.get('path')).toBe('/file with spaces');

            return [200, {success: true}];
        });
        expect((await client.send('SITE CHMOD 644 /file with spaces')).code).toBe(200);
    });

    test('rejects a passive data connection from a different peer', async () => {
        const control = await rawClient();
        const data = await control.passiveData('127.0.0.2');

        openSockets.push(data);
        expect(await control.reply()).toMatch(/^550 /);
        expect(beginRequests).toHaveLength(0);
    });
});
