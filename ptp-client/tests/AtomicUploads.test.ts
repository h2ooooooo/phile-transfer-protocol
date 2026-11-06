import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {createHash} from 'crypto';
import {EventEmitter, once} from 'events';
import {finished} from 'stream/promises';
import {APIWritableStream} from '../src/APIWritableStream';
import {RestFileSystem} from '../src/RestFileSystem';

const uploadId = 'a'.repeat(64);

function hashBytes(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

describe('atomic upload bridge', () => {
    let mock: MockAdapter;
    let remote: RestFileSystem;
    let chunks: Buffer[];
    let offsets: number[];
    let beginParameters: URLSearchParams;
    let commitParameters: URLSearchParams | undefined;
    let aborted: boolean;

    beforeEach(() => {
        mock = new MockAdapter(axios);
        chunks = [];
        offsets = [];
        aborted = false;
        commitParameters = undefined;
        remote = new RestFileSystem({} as any, {
            endPointUrl: 'https://example.com/ptp.php',
            apiUsername: 'test',
            apiPassword: 'test',
            logger: {debug: jest.fn(), error: jest.fn()} as any,
        });

        mock.onPost(/action=uploadBegin/).reply(config => {
            beginParameters = new URL(config.url!).searchParams;

            return [200, {success: true, upload: {id: uploadId, offset: 0, maxChunkSize: 4 * 1024 * 1024}}];
        });
        mock.onPost(/action=uploadWrite/).reply(config => {
            const parameters = new URL(config.url!).searchParams;
            const bytes = Buffer.from(config.data);
            const offset = Number(parameters.get('offset'));

            expect(parameters.get('uploadId')).toBe(uploadId);
            chunks.push(bytes);
            offsets.push(offset);

            return [200, {success: true, upload: {id: uploadId, offset: offset + bytes.length}}];
        });
        mock.onPost(/action=uploadCommit/).reply(config => {
            commitParameters = new URL(config.url!).searchParams;

            return [200, {
                success: true,
                size: Number(commitParameters.get('size')),
                sha256: commitParameters.get('sha256'),
            }];
        });
        mock.onPost(/action=uploadAbort/).reply(() => {
            aborted = true;

            return [200, {success: true}];
        });
    });

    afterEach(() => {
        mock.restore();
    });

    test('aggregates small chunks and verifies the complete transfer before finish', async () => {
        const stream = await remote.write('/large.bin');
        const done = finished(stream);
        const chunk = Buffer.alloc(65536, 42);

        for (let index = 0; index < 128; index++) {
            if (!stream.write(chunk)) {
                await once(stream, 'drain');
            }
        }

        stream.end();
        await done;

        expect(chunks).toHaveLength(8);
        expect(chunks.every(bytes => bytes.length === 1024 * 1024)).toBe(true);
        expect(offsets).toEqual(Array.from({length: 8}, (_, index) => index * 1024 * 1024));
        expect(commitParameters?.get('size')).toBe(String(8 * 1024 * 1024));
        expect(commitParameters?.get('sha256')).toBe(hashBytes(Buffer.alloc(8 * 1024 * 1024, 42)));
        expect(aborted).toBe(false);
    });

    test.each([
        [{append: true}, 'true', '0'],
        [{append: false, start: 7}, 'false', '7'],
    ])('preserves append and resume settings %#', async (options, append, start) => {
        const stream = await remote.write('/file', options);
        const done = finished(stream);

        stream.end(Buffer.from('payload'));
        await done;

        expect(beginParameters.get('append')).toBe(append);
        expect(beginParameters.get('start')).toBe(start);
        expect(offsets).toEqual([0]);
        expect(commitParameters?.get('sha256')).toBe(hashBytes(Buffer.from('payload')));
    });

    test('commits empty files with the empty payload checksum', async () => {
        const stream = await remote.write('/empty');
        const done = finished(stream);

        stream.end();
        await done;

        expect(commitParameters?.get('size')).toBe('0');
        expect(commitParameters?.get('sha256')).toBe(hashBytes(Buffer.alloc(0)));
        expect(aborted).toBe(false);
    });

    test('aborts cancellation without committing buffered bytes', async () => {
        const stream = await remote.write('/cancelled');
        const closed = once(stream, 'close');

        stream.write(Buffer.from('partial'));
        stream.destroy();
        await closed;

        expect(chunks).toHaveLength(0);
        expect(commitParameters).toBeUndefined();
        expect(aborted).toBe(true);
    });

    test('aborts staged data when the FTP control connection closes', async () => {
        const controlSocket = new EventEmitter();
        const connected = new RestFileSystem({commandSocket: controlSocket} as any, {
            endPointUrl: 'https://example.com/ptp.php', apiUsername: 'test', apiPassword: 'test',
            logger: {debug: jest.fn(), error: jest.fn()} as any,
        });
        const stream = await connected.write('/interrupted');
        const done = finished(stream);

        stream.write(Buffer.from('incomplete'));
        controlSocket.emit('close');

        await expect(done).rejects.toThrow('PTP FTP connection closed');
        expect(aborted).toBe(true);
        expect(commitParameters).toBeUndefined();
        expect(controlSocket.listenerCount('close')).toBe(0);
    });

    test('aborts a session begun after the FTP control connection already closed', async () => {
        const connected = new RestFileSystem({commandSocket: Object.assign(new EventEmitter(), {destroyed: true})} as any, {
            endPointUrl: 'https://example.com/ptp.php', apiUsername: 'test', apiPassword: 'test',
            logger: {debug: jest.fn(), error: jest.fn()} as any,
        });

        await expect(connected.write('/interrupted')).rejects.toThrow('PTP FTP connection closed');
        expect(aborted).toBe(true);
        expect(commitParameters).toBeUndefined();
    });
    test('aborts FTP ABOR while keeping the control connection open', async () => {
        const controlSocket = new EventEmitter();
        const connected = new RestFileSystem({commandSocket: controlSocket} as any, {
            endPointUrl: 'https://example.com/ptp.php', apiUsername: 'test', apiPassword: 'test',
            logger: {debug: jest.fn(), error: jest.fn()} as any,
        });
        const stream = await connected.write('/aborted');
        const done = finished(stream);

        stream.write(Buffer.from('incomplete'));
        controlSocket.emit('data', Buffer.from('NOOP\r\nAB'));
        expect(stream.destroyed).toBe(false);
        controlSocket.emit('data', Buffer.from('OR\r\n'));

        await expect(done).rejects.toThrow('PTP upload aborted by FTP client');
        expect(aborted).toBe(true);
        expect(commitParameters).toBeUndefined();
        expect(controlSocket.listenerCount('data')).toBe(0);
        expect(controlSocket.listenerCount('close')).toBe(0);
    });
    test('aborts a session when FTP ABOR arrives during upload setup', async () => {
        const controlSocket = new EventEmitter();
        const connected = new RestFileSystem({commandSocket: controlSocket} as any, {
            endPointUrl: 'https://example.com/ptp.php', apiUsername: 'test', apiPassword: 'test',
            logger: {debug: jest.fn(), error: jest.fn()} as any,
        });
        let completeBegin: (value: any) => void = () => {};

        mock.onPost(/action=uploadBegin/).reply(() => new Promise(resolve => {
            completeBegin = resolve;
        }));

        const pending = connected.write('/cancelled-before-start');

        controlSocket.emit('data', Buffer.from('ABOR\r\n'));
        completeBegin([200, {success: true, upload: {id: uploadId, offset: 0, maxChunkSize: 4 * 1024 * 1024}}]);

        await expect(pending).rejects.toThrow('PTP upload aborted by FTP client');
        expect(aborted).toBe(true);
        expect(commitParameters).toBeUndefined();
        expect(controlSocket.listenerCount('data')).toBe(0);
    });
    test('rejects invalid chunk acknowledgements and aborts the session', async () => {
        mock.onPost(/action=uploadWrite/).reply(200, {success: true, upload: {id: uploadId, offset: 999}});
        const stream = await remote.write('/failed');
        const done = finished(stream);

        stream.end(Buffer.from('partial'));

        await expect(done).rejects.toThrow('Invalid PTP upload acknowledgement');
        expect(commitParameters).toBeUndefined();
        expect(aborted).toBe(true);
    });

    test('reports conflicts and aborts without a legacy write fallback', async () => {
        mock.onPost(/action=uploadCommit/).reply(409, {success: false, error: 'Destination changed'});
        const stream = await remote.write('/conflict');
        const done = finished(stream);

        stream.end(Buffer.from('replacement'));

        await expect(done).rejects.toThrow('HTTP 409');
        expect(aborted).toBe(true);
        expect(mock.history.post.some(request => new URL(request.url!).searchParams.get('action') === 'write')).toBe(false);
    });

    test('does not fall back when an older server lacks upload sessions', async () => {
        mock.onPost(/action=uploadBegin/).reply(404);

        await expect(remote.write('/old-server')).rejects.toThrow('HTTP 404');
        expect(mock.history.post).toHaveLength(1);
    });
});

describe('bounded upload stream lifecycle', () => {
    test('holds backpressure until a full batch is acknowledged', async () => {
        let acknowledge: () => void = () => {};
        const write = jest.fn(() => new Promise<void>(resolve => {
            acknowledge = resolve;
        }));
        const finalize = jest.fn().mockResolvedValue(undefined);
        const stream = new APIWritableStream(write, '/file', {chunkSize: 4, finalize});
        const done = finished(stream);

        expect(stream.write(Buffer.from('ABCD'))).toBe(false);
        expect(write).toHaveBeenCalledTimes(1);
        expect(finalize).not.toHaveBeenCalled();
        stream.end();
        acknowledge();
        await done;

        expect(finalize).toHaveBeenCalledWith(4, hashBytes(Buffer.from('ABCD')));
    });

    test('splits oversized incoming chunks in order with bounded API requests', async () => {
        const chunks: Buffer[] = [];
        const stream = new APIWritableStream(async (_path, options) => {
            chunks.push(Buffer.from(options.data));
        }, '/file', {chunkSize: 3});
        const done = finished(stream);

        stream.end(Buffer.from('ABCDEFGHIJ'));
        await done;

        expect(chunks.map(bytes => bytes.toString())).toEqual(['ABC', 'DEF', 'GHI', 'J']);
    });

    test('waits for an in-flight write before aborting a cancelled transfer', async () => {
        let acknowledge: () => void = () => {};
        const abort = jest.fn().mockResolvedValue(undefined);
        const finalize = jest.fn().mockResolvedValue(undefined);
        const stream = new APIWritableStream(() => new Promise<void>(resolve => {
            acknowledge = resolve;
        }), '/file', {chunkSize: 4, abort, finalize});
        const closed = once(stream, 'close');

        stream.write(Buffer.from('ABCD'));
        stream.destroy();
        expect(abort).not.toHaveBeenCalled();
        acknowledge();
        await closed;

        expect(abort).toHaveBeenCalledTimes(1);
        expect(finalize).not.toHaveBeenCalled();
    });
});
