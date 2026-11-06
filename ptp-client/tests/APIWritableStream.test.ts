import {once} from 'events';
import {APIWritableStream} from '../src/APIWritableStream';

describe('upload stream', () => {
    test.each([undefined, 0])('truncates first chunk and appends subsequent chunks (start=%s)', async start => {
        const write = jest.fn().mockResolvedValue(undefined);
        const stream = new APIWritableStream(write, '/file', {append: false, start, chunkSize: 3});

        stream.write(Buffer.from('ONE'));
        stream.end(Buffer.from('TWO'));
        await once(stream, 'finish');
        expect(write.mock.calls.map(call => call[1].append)).toEqual([false, true]);
    });
    test('creates/truncates an empty upload', async () => {
        const write = jest.fn().mockResolvedValue(undefined);
        const stream = new APIWritableStream(write, '/file', {append: false});

        stream.end();
        await once(stream, 'finish');
        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.calls[0][1].data.length).toBe(0);
        expect(write.mock.calls[0][1].append).toBe(false);
    });
    test('advances resume offsets by bytes without appending at EOF', async () => {
        const write = jest.fn().mockResolvedValue(undefined);
        const stream = new APIWritableStream(write, '/file', {append: false, start: 3, chunkSize: 2});

        stream.write(Buffer.from('XY'));
        stream.end(Buffer.from('Z'));
        await once(stream, 'finish');
        expect(write.mock.calls.map(call => [call[1].append, call[1].start])).toEqual([[false, 3], [false, 5]]);
    });
    test('propagates failures without reporting finish', async () => {
        const stream = new APIWritableStream(async () => {
            throw new Error('disk full');
        }, '/file', {});
        const finish = jest.fn();

        stream.on('finish', finish);
        const error = once(stream, 'error');

        stream.end(Buffer.from('x'));
        expect((await error)[0].message).toBe('disk full');
        expect(finish).not.toHaveBeenCalled();
    });
});
