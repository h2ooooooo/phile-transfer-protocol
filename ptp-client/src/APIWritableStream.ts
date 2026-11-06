import {Writable, WritableOptions} from 'stream';
import {createHash, Hash} from 'crypto';

export type ApiReadFunctionPath = {
    start?: number;
    path: string;
    encoding?: BufferEncoding;
};

export type ApiWriteFunction = {
    append: boolean;
    start?: number;
    encoding?: BufferEncoding;
};

export type ApiWriteFunctionData = ApiWriteFunction & {
    data: Buffer;
};

export type ApiWriteFunctionDataPromise = (path: string, options: ApiWriteFunctionData) => Promise<void>;

export interface ApiWritableStreamOptions extends WritableOptions {
    append?: boolean;
    start?: number;
    chunkSize?: number;
    finalize?: (size: number, sha256: string) => Promise<void>;
    abort?: () => Promise<void>;
}

export class APIWritableStream extends Writable {
    private readonly apiWriteFunction: ApiWriteFunctionDataPromise;
    private readonly path: string;
    private readonly options: ApiWritableStreamOptions;
    private readonly pending: Buffer;
    private readonly hash: Hash = createHash('sha256');
    private pendingBytes: number = 0;
    private uploadedBytes: number = 0;
    private position: number;
    private firstChunk: boolean = true;
    private completed: boolean = false;
    private operation: Promise<void> = Promise.resolve();

    public constructor(apiWriteFunction: ApiWriteFunctionDataPromise, path: string, options: ApiWritableStreamOptions) {
        const chunkSize = options.chunkSize ?? 1024 * 1024;

        if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 4 * 1024 * 1024) {
            throw new Error('Upload chunk size must be between 1 byte and 4 MiB');
        }

        super({...options, highWaterMark: chunkSize});

        this.apiWriteFunction = apiWriteFunction;
        this.path = path;
        this.options = options;
        this.pending = Buffer.allocUnsafe(chunkSize);
        this.position = options.start ?? 0;
    }

    public _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

        this.operation = this.bufferBytes(bytes);
        this.operation.then(() => callback(), error => callback(this.asError(error)));
    }

    private async bufferBytes(bytes: Buffer): Promise<void> {
        let offset = 0;

        while (offset < bytes.length) {
            if (this.destroyed) {
                throw new Error('PTP upload cancelled');
            }

            const copied = bytes.copy(this.pending, this.pendingBytes, offset, offset + this.pending.length - this.pendingBytes);

            this.pendingBytes += copied;
            offset += copied;

            if (this.pendingBytes === this.pending.length) {
                await this.flushPending();
            }
        }
    }

    private async flushPending(): Promise<void> {
        if (this.destroyed) {
            throw new Error('PTP upload cancelled');
        }

        const content = this.pending.subarray(0, this.pendingBytes);
        const isResuming = !this.options.append && (this.options.start ?? 0) > 0;
        const writeOptions: ApiWriteFunctionData = {append: true, data: content};

        if (this.firstChunk || isResuming) {
            writeOptions.append = !!this.options.append;
            writeOptions.start = this.position;
        }

        await this.apiWriteFunction(this.path, writeOptions);

        this.hash.update(content);
        this.uploadedBytes += content.length;
        this.position += content.length;
        this.pendingBytes = 0;
        this.firstChunk = false;
    }

    public _final(callback: (error?: Error | null) => void): void {
        this.operation = this.finishUpload();
        this.operation.then(() => callback(), error => callback(this.asError(error)));
    }

    private async finishUpload(): Promise<void> {
        if (this.pendingBytes > 0 || this.firstChunk) {
            await this.flushPending();
        }

        if (this.destroyed) {
            throw new Error('PTP upload cancelled');
        }

        if (this.options.finalize) {
            await this.options.finalize(this.uploadedBytes, this.hash.digest('hex'));
        }

        this.completed = true;
    }

    public _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        void this.cleanup().then(() => callback(error), cleanupError => {
            const failure = this.asError(cleanupError);

            if (error) {
                callback(new Error(error.message + '; upload cleanup failed: ' + failure.message));

                return;
            }

            callback(failure);
        });
    }

    private async cleanup(): Promise<void> {
        try {
            await this.operation;
        } catch {
            // The write/final callback reports the original failure.
        }

        if (!this.completed && this.options.abort) {
            await this.options.abort();
        }
    }

    private asError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }

        return new Error(String(error));
    }
}
