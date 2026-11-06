import {createServer, createConnection, Socket} from 'node:net';
import type {AddressInfo} from 'node:net';
import {FtpServer} from '../src/ftp/FtpEngine';

interface FtpReply {
    code: number;
    message: string;
}

interface PendingReply {
    resolve: (reply: FtpReply) => void;
    reject: (error: Error) => void;
}

class ReplyReader {
    private buffer = '';
    private replies: FtpReply[] = [];
    private pending: PendingReply[] = [];
    private failure: Error | undefined;

    public constructor(private readonly socket: Socket) {
        this.socket.setTimeout(5000, () => {
            this.socket.destroy(new Error('FTP control socket timed out'));
        });

        this.socket.on('data', chunk => {
            this.buffer += chunk.toString('utf8');
            let lineEnd = this.buffer.indexOf('\r\n');

            while (lineEnd !== -1) {
                const line = this.buffer.slice(0, lineEnd);

                this.buffer = this.buffer.slice(lineEnd + 2);
                const match = /^(\d{3}) (.*)$/.exec(line);

                if (match) {
                    const reply = {code: Number(match[1]), message: match[2]};
                    const waiter = this.pending.shift();

                    if (waiter) {
                        waiter.resolve(reply);
                    } else {
                        this.replies.push(reply);
                    }
                }

                lineEnd = this.buffer.indexOf('\r\n');
            }
        });

        this.socket.on('error', error => this.fail(error));
        this.socket.on('close', () => this.fail(new Error('FTP control socket closed')));
    }

    public send(command: string): void {
        this.socket.write(`${command}\r\n`);
    }

    public next(): Promise<FtpReply> {
        const reply = this.replies.shift();

        if (reply) {
            return Promise.resolve(reply);
        }

        if (this.failure) {
            return Promise.reject(this.failure);
        }

        return new Promise((resolve, reject) => {
            this.pending.push({resolve, reject});
        });
    }

    private fail(error: Error): void {
        this.failure = error;

        for (const waiter of this.pending.splice(0)) {
            waiter.reject(error);
        }
    }
}

const silentLogger = {
    child: () => silentLogger,
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
};

async function unusedPort(): Promise<number> {
    const listener = createServer();

    await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(0, '127.0.0.1', resolve);
    });

    const port = (listener.address() as AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
        listener.close(error => {
            if (error) {
                reject(error);

                return;
            }

            resolve();
        });
    });

    return port;
}

describe('FTP data peer protection', () => {
    let server: FtpServer;
    let replies: ReplyReader;
    let control: Socket;
    const sockets = new Set<Socket>();
    const getDirectory = jest.fn(async () => ({isDirectory: () => true}));
    const listDirectory = jest.fn(async () => []);

    async function connect(port: number, localAddress = '127.0.0.1'): Promise<Socket> {
        const socket = createConnection({host: '127.0.0.1', port, localAddress});

        sockets.add(socket);

        // A rejected data peer can receive ECONNRESET while the control reply arrives.
        socket.on('error', () => {});

        await new Promise<void>((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });

        return socket;
    }

    async function passivePort(): Promise<number> {
        replies.send('PASV');
        const reply = await replies.next();

        expect(reply.code).toBe(227);
        const address = /\((\d+,\d+,\d+,\d+),(\d+),(\d+)\)/.exec(reply.message);

        expect(address).not.toBeNull();

        return Number(address![2]) * 256 + Number(address![3]);
    }

    beforeEach(async () => {
        getDirectory.mockClear();
        listDirectory.mockClear();
        const controlPort = await unusedPort();
        const dataPort = await unusedPort();

        server = new FtpServer({
            url: `ftp://127.0.0.1:${controlPort}`,
            pasv_url: '127.0.0.1',
            pasv_min: dataPort,
            pasv_max: dataPort,
            endOnProcessSignal: false,
            log: silentLogger,
        });
        server.on('login', (_login, resolve) => {
            resolve({fs: {get: getDirectory, list: listDirectory}});
        });
        await server.listen();

        control = createConnection({host: '127.0.0.1', port: controlPort});
        sockets.add(control);
        replies = new ReplyReader(control);
        expect((await replies.next()).code).toBe(220);
        replies.send('USER peer-test');
        expect((await replies.next()).code).toBe(331);
        replies.send('PASS peer-test');
        expect((await replies.next()).code).toBe(230);
    });

    afterEach(async () => {
        for (const socket of sockets) {
            socket.destroy();
        }

        sockets.clear();

        if (server) {
            await server.close();
        }
    });

    test.each([
        ['PORT', 'PORT 127,0,0,2,195,80'],
        ['EPRT', 'EPRT |1|127.0.0.2|50000|'],
    ])('rejects a foreign data address supplied through %s', async (_directive, command) => {
        replies.send(command);
        expect((await replies.next()).code).toBe(500);
        expect(getDirectory).not.toHaveBeenCalled();

        replies.send('NOOP');
        expect((await replies.next()).code).toBe(200);
    });

    test.each([
        ['PORT', 'PORT 127,0,0,1,195,80'],
        ['EPRT', 'EPRT |1|127.0.0.1|50000|'],
    ])('accepts the control peer data address supplied through %s', async (_directive, command) => {
        replies.send(command);
        expect((await replies.next()).code).toBe(200);
    });

    test('rejects a passive connection from a different peer before accessing files', async () => {
        const port = await passivePort();
        const data = await connect(port, '127.0.0.2');
        const closed = new Promise<void>(resolve => data.once('close', () => resolve()));

        expect((await replies.next()).code).toBe(550);
        await closed;
        expect(getDirectory).not.toHaveBeenCalled();
        expect(listDirectory).not.toHaveBeenCalled();

        await expect(connect(port)).rejects.toThrow();
    });

    test('allows a passive listing from the control peer', async () => {
        const port = await passivePort();
        const data = await connect(port);
        const closed = new Promise<void>(resolve => data.once('close', () => resolve()));

        data.resume();
        replies.send('LIST');

        expect((await replies.next()).code).toBe(150);
        expect((await replies.next()).code).toBe(226);
        await closed;
        expect(getDirectory).toHaveBeenCalledTimes(1);
        expect(listDirectory).toHaveBeenCalledTimes(1);
    });
});
