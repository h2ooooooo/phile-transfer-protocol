import {once} from 'events';
import {createConnection, Socket} from 'net';
import {setTimeout as delay} from 'timers/promises';
import {Logger} from 'winston';
import {FtpConnection, FtpServer} from '../src/ftp/FtpEngine';
import {installFtpControlInput} from '../src/ftp/FtpControlInput';
import {FtpLogger} from '../src/util/FtpLogger';

async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 3000;

    while (!condition()) {
        if (Date.now() >= deadline) {
            throw new Error('Timed out waiting for FTP control processing');
        }

        await delay(5);
    }
}

function fakeConnection(handle: (message: string) => Promise<void>) {
    const socket = new Socket();
    const connection = {
        commandSocket: socket,
        commands: {
            parse: (message: string) => ({directive: message.split(' ')[0].toUpperCase()}),
            handle: jest.fn(handle),
        },
        connector: {end: jest.fn()},
        log: {warn: jest.fn()},
        reply: jest.fn(async () => {}),
        close: jest.fn(async () => socket.destroy()),
    };

    return {socket, connection, install: () => installFtpControlInput(connection as unknown as FtpConnection)};
}

function receive(socket: Socket, message: string | Buffer): void {
    socket.emit('data', Buffer.isBuffer(message) ? message : Buffer.from(message));
}

describe('FTP control input scheduling', () => {
    test('frames fragmented commands and preserves observers registered after installation', async () => {
        const fixture = fakeConnection(async () => {});
        const originalListener = jest.fn();
        const observer = jest.fn();

        fixture.socket.on('data', originalListener);
        fixture.install();
        fixture.socket.on('data', observer);
        receive(fixture.socket, 'US');
        receive(fixture.socket, 'ER fixture\r');
        expect(fixture.connection.commands.handle).not.toHaveBeenCalled();
        receive(fixture.socket, '\nPASS password\r\n');
        await waitFor(() => fixture.connection.commands.handle.mock.calls.length === 2);

        expect(fixture.connection.commands.handle.mock.calls.map(call => call[0])).toEqual(['USER fixture', 'PASS password']);
        expect(originalListener).not.toHaveBeenCalled();
        expect(observer).toHaveBeenCalledTimes(3);
        fixture.socket.destroy();
    });

    test('serializes normal commands across TCP chunks', async () => {
        let completeFirst!: () => void;
        const pendingFirst = new Promise<void>(resolve => completeFirst = resolve);
        const fixture = fakeConnection(async message => {
            if (message.startsWith('USER')) {
                await pendingFirst;
            }
        });

        fixture.install();
        receive(fixture.socket, 'USER fixture\r\n');
        receive(fixture.socket, 'PASS password\r\nNOOP\r\n');
        expect(fixture.connection.commands.handle).toHaveBeenCalledTimes(1);
        completeFirst();
        await waitFor(() => fixture.connection.commands.handle.mock.calls.length === 3);
        fixture.socket.destroy();
    });

    test.each(['STOR', 'STOU', 'APPE', 'RETR', 'LIST', 'NLST', 'MLSD'])('preempts pipelined %s with ABOR and QUIT', async directive => {
        let completeTransfer!: () => void;
        const transfer = new Promise<void>(resolve => completeTransfer = resolve);
        const fixture = fakeConnection(async message => {
            if (message.startsWith(directive + ' ')) {
                await transfer;
            }

            if (message === 'ABOR') {
                completeTransfer();
            }
        });

        fixture.install();
        receive(fixture.socket, 'USER fixture\r\nPASS password\r\n' + directive + ' file\r\nCWD other\r\nABOR\r\nQUIT\r\n');
        await waitFor(() => fixture.connection.commands.handle.mock.calls.length === 5);

        expect(fixture.connection.commands.handle.mock.calls.map(call => call[0])).toEqual(['USER fixture', 'PASS password', directive + ' file', 'ABOR', 'QUIT']);
        expect(fixture.connection.reply).toHaveBeenCalledWith(450, 'A file transfer is in progress');
        expect(fixture.connection.connector.end).toHaveBeenCalledTimes(2);
        fixture.socket.destroy();
    });

    test('resumes a paused control socket during data commands', async () => {
        let completeTransfer!: () => void;
        const transfer = new Promise<void>(resolve => completeTransfer = resolve);
        const fixture = fakeConnection(async () => transfer);
        const resume = jest.spyOn(fixture.socket, 'resume');

        fixture.install();
        receive(fixture.socket, 'LIST /\r\n');
        fixture.socket.pause();
        await waitFor(() => resume.mock.calls.length > 0);
        completeTransfer();
        fixture.socket.destroy();
    });

    test('bounds interrupted commands retained behind a pending response', async () => {
        let completeTransfer!: () => void;
        let completeNoop!: () => void;
        const transfer = new Promise<void>(resolve => completeTransfer = resolve);
        const noop = new Promise<void>(resolve => completeNoop = resolve);
        const fixture = fakeConnection(async message => {
            if (message.startsWith('STOR')) {
                await transfer;
            } else {
                await noop;
            }
        });

        fixture.install();
        receive(fixture.socket, 'STOR file\r\n');

        for (let index = 0; index < 130; index++) {
            receive(fixture.socket, 'NOOP\r\n');
        }

        expect(fixture.connection.close).toHaveBeenCalledWith(500, 'Too many pending FTP commands');
        completeNoop();
        completeTransfer();
        fixture.socket.destroy();
    });

    test('bounds pending control bytes and handles rejected transfer responses', async () => {
        const byteFixture = fakeConnection(async () => {});

        byteFixture.install();
        receive(byteFixture.socket, Buffer.alloc(65537, 65));
        expect(byteFixture.connection.close).toHaveBeenCalledWith(500, 'Too much pending FTP control input');

        let completeTransfer!: () => void;
        const transfer = new Promise<void>(resolve => completeTransfer = resolve);
        const replyFixture = fakeConnection(async () => transfer);

        replyFixture.connection.reply.mockRejectedValueOnce(new Error('Socket closed'));
        replyFixture.install();
        receive(replyFixture.socket, 'RETR file\r\nCWD other\r\n');
        await waitFor(() => replyFixture.connection.close.mock.calls.length === 1);
        expect(replyFixture.connection.close).toHaveBeenCalledWith(500, 'FTP command failed');
        completeTransfer();
        byteFixture.socket.destroy();
        replyFixture.socket.destroy();
    });
});

describe('real FTP control TCP framing', () => {
    let server: FtpServer;
    let socket: Socket;
    let lines: string[];
    let output: jest.Mock;
    let login: jest.Mock;
    let changeDirectory: jest.Mock;

    beforeEach(async () => {
        output = jest.fn();
        login = jest.fn();
        changeDirectory = jest.fn(async (directory: string) => directory);
        server = new FtpServer({
            url: 'ftp://127.0.0.1:0',
            log: new FtpLogger({log: output} as unknown as Logger),
            endOnProcessSignal: false,
        });
        server.on('login', async ({username, password}, resolve) => {
            login(username, password);
            await delay(10);
            resolve({fs: {chdir: changeDirectory}});
        });
        await server.listen();
        const address = server.server.address();

        if (!address || typeof address === 'string') {
            throw new Error('Expected a real FTP TCP listener');
        }

        socket = createConnection({host: '127.0.0.1', port: address.port});
        lines = [];
        let buffer = '';

        socket.on('data', chunk => {
            buffer += chunk.toString('utf8');
            let end = buffer.indexOf('\r\n');

            while (end !== -1) {
                const line = buffer.slice(0, end);

                buffer = buffer.slice(end + 2);

                if (/^\d{3} /.test(line)) {
                    lines.push(line);
                }

                end = buffer.indexOf('\r\n');
            }
        });
        await once(socket, 'connect');
        await waitFor(() => lines.length === 1);
    });

    afterEach(async () => {
        socket?.destroy();
        await server?.close();
    });

    test('accepts fragmented credentials and UTF8 filenames without logging password fragments', async () => {
        socket.write('US');
        await delay(15);
        socket.write('ER fixture\r');
        await delay(15);
        socket.write('\nPA');
        await delay(15);
        socket.write('SS never-log');
        await delay(15);
        socket.write('-this\r\n');
        await waitFor(() => lines.length === 3);
        expect(login).toHaveBeenCalledWith('fixture', 'never-log-this');
        expect(lines.map(line => line.slice(0, 3))).toEqual(['220', '331', '230']);

        const filename = '目录-🎉.txt';
        const command = Buffer.from('CWD ' + filename + '\r\n');
        const split = command.indexOf(Buffer.from('🎉')) + 2;

        socket.write(command.subarray(0, split));
        await delay(15);
        socket.write(command.subarray(split, command.length - 1));
        await delay(15);
        socket.write(command.subarray(command.length - 1));
        await waitFor(() => lines.length === 4);
        expect(changeDirectory).toHaveBeenCalledWith(filename);
        expect(lines[3]).toContain('250');
        expect(JSON.stringify(output.mock.calls)).not.toContain('never-log');
        expect(JSON.stringify(output.mock.calls)).not.toContain('-this');
    });

    test('processes authentication and following commands from one TCP packet in order', async () => {
        socket.write('USER fixture\r\nPASS packet-secret\r\nCWD folder\r\nNOOP\r\n');
        await waitFor(() => lines.length === 5);

        expect(lines.map(line => line.slice(0, 3))).toEqual(['220', '331', '230', '250', '200']);
        expect(login).toHaveBeenCalledWith('fixture', 'packet-secret');
        expect(changeDirectory).toHaveBeenCalledWith('folder');
        expect(JSON.stringify(output.mock.calls)).not.toContain('packet-secret');
    });

    test('closes oversized fragmented commands with a fixed response and no raw payload logs', async () => {
        const closed = once(socket, 'close');

        socket.write('PASS ' + 'sensitive-fragment'.repeat(250));
        await closed;

        expect(lines.at(-1)).toBe('500 Invalid or oversized FTP command');
        expect(login).not.toHaveBeenCalled();
        expect(JSON.stringify(output.mock.calls)).not.toContain('sensitive-fragment');
        expect(Object.keys(server.connections)).toHaveLength(0);
    });
});
