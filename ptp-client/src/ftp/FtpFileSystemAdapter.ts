import path from 'path';
import {Writable, Readable} from 'stream';
import {FtpConnection} from './FtpEngine';
import {RestFileSystem, FileDetailResponse} from '../RestFileSystem';

interface WriteOptions {
    append?: boolean;
    start?: number;
}

interface EngineFileDetails extends FileDetailResponse {
    uid: number;
    gid: number;
    nlink: number;
    isSymbolicLink: () => boolean;
}

/** Keeps ABOR available while preventing a second command from changing a transfer. */
class FtpTransferController {
    private activeStream?: Readable | Writable;

    public constructor(private readonly connection: FtpConnection) {
        const handleCommand = connection.commands.handle.bind(connection.commands);

        connection.commands.handle = async command => {
            const parsed = typeof command === 'string' ? connection.commands.parse(command) : command;

            if (this.activeStream) {
                if (!['ABOR', 'NOOP', 'QUIT'].includes(parsed.directive)) {
                    await connection.reply(450, 'A file transfer is in progress');

                    return;
                }

                if (parsed.directive === 'ABOR' || parsed.directive === 'QUIT') {
                    this.activeStream.destroy(new Error('PTP transfer aborted by FTP client'));
                }
            }

            await handleCommand(command);
        };
    }

    public watch(stream: Readable | Writable): boolean {
        const socket = this.connection.commandSocket;
        const dataSocket = this.connection.connector.socket;

        if (!dataSocket || dataSocket.destroyed || dataSocket.closed || socket.destroyed) {
            stream.destroy(new Error('PTP FTP data connection is already closed'));

            return false;
        }

        this.activeStream = stream;

        let receivedEnd = dataSocket?.readableEnded ?? false;
        const onEnd = () => {
            receivedEnd = true;
        };
        const onDataClose = () => {
            if (stream instanceof Writable && !receivedEnd) {
                stream.destroy(new Error('PTP FTP data connection closed before upload completed'));
            }

            if (stream instanceof Readable && !stream.readableEnded) {
                stream.destroy(new Error('PTP FTP data connection closed before download completed'));
            }
        };
        const onDataError = (error: Error) => stream.destroy(error);
        const onControlClose = () => stream.destroy(new Error('PTP FTP connection closed'));
        const resumeControl = () => {
            // The engine pauses all control input during data transfer, including ABOR.
            queueMicrotask(() => {
                if (this.activeStream === stream && !socket.destroyed) {
                    socket.resume();
                }
            });
        };
        const release = () => {
            if (this.activeStream === stream) {
                this.activeStream = undefined;
            }

            socket.off('pause', resumeControl);
            socket.off('close', onControlClose);
            dataSocket?.off('end', onEnd);
            dataSocket?.off('close', onDataClose);
            dataSocket?.off('error', onDataError);
        };

        socket.on('pause', resumeControl);
        socket.once('close', onControlClose);
        dataSocket?.once('end', onEnd);
        dataSocket?.once('close', onDataClose);
        dataSocket?.once('error', onDataError);
        stream.once('close', release);

        if (socket.isPaused()) {
            resumeControl();
        }

        return true;
    }
}

/** Bridges the engine's synchronous stream factory to PTP's atomic HTTP upload. */
class DeferredUploadStream extends Writable {
    private pendingUpload?: Promise<Writable>;
    private upload?: Writable;

    public constructor(private readonly beginUpload: () => Promise<Writable>) {
        super({highWaterMark: 64 * 1024});
    }

    private async getUpload(): Promise<Writable> {
        if (!this.pendingUpload) {
            this.pendingUpload = this.beginUpload().then(upload => {
                this.upload = upload;
                upload.on('error', error => this.destroy(error));

                if (this.destroyed) {
                    upload.destroy(new Error('PTP upload cancelled'));
                }

                return upload;
            });
        }

        return this.pendingUpload;
    }

    public _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        void this.getUpload().then(upload => {
            upload.write(chunk, encoding, callback);
        }, error => callback(this.asError(error)));
    }

    public _final(callback: (error?: Error | null) => void): void {
        void this.getUpload().then(upload => {
            // finish includes the remote commit acknowledgement, not just socket EOF.
            upload.once('finish', callback);
            upload.end();
        }, error => callback(this.asError(error)));
    }

    public _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        void this.closeUpload(error).then(() => callback(error), failure => callback(this.asError(failure)));
    }

    private async closeUpload(error: Error | null): Promise<void> {
        if (!this.pendingUpload) {
            return;
        }

        try {
            await this.pendingUpload;
        } catch {
            return;
        }

        const upload = this.upload!;

        if (upload.closed) {
            return;
        }

        await new Promise<void>(resolve => {
            upload.once('close', resolve);
            upload.destroy(error || undefined);
        });
    }

    private asError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }

        return new Error(String(error));
    }
}

/** Opens the HTTP response only after the engine has established its data socket. */
class DeferredDownloadStream extends Readable {
    private source?: Readable;
    private started: boolean = false;

    public constructor(private readonly beginDownload: () => Promise<Readable>) {
        super({highWaterMark: 64 * 1024});
    }

    public _read(): void {
        if (this.source) {
            this.source.resume();

            return;
        }

        if (this.started) {
            return;
        }

        this.started = true;

        void this.beginDownload().then(source => {
            this.source = source;
            source.on('error', error => this.destroy(error));

            if (this.destroyed) {
                source.destroy();

                return;
            }

            source.on('data', chunk => {
                if (!this.push(chunk)) {
                    source.pause();
                }
            });
            source.once('end', () => this.push(null));
        }, error => this.destroy(error));
    }

    public _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        this.source?.destroy();
        callback(error);
    }
}

/** Only this boundary uses the engine's {stream, clientPath} transfer contract. */
export class FtpFileSystemAdapter {
    private readonly transfers: FtpTransferController;

    public constructor(private readonly connection: FtpConnection, private readonly remote: RestFileSystem) {
        this.transfers = new FtpTransferController(connection);
    }

    public currentDirectory(): string {
        return this.remote.currentDirectory();
    }

    public async get(fileName: string): Promise<EngineFileDetails> {
        return this.fileDetails(await this.remote.get(fileName));
    }

    public async list(directory?: string): Promise<EngineFileDetails[]> {
        return (await this.remote.list(directory)).map(file => this.fileDetails(file));
    }

    public chdir(directory: string): Promise<string> {
        return this.remote.chdir(directory);
    }

    public write(fileName: string, options: WriteOptions = {}): {stream: Writable; clientPath: string} {
        this.connection.restByteCount = 0;

        const stream = new DeferredUploadStream(() => this.remote.write(fileName, {
            append: options.append ?? false,
            start: options.start,
        }));

        stream.once('pipe', () => this.transfers.watch(stream));

        return {stream, clientPath: this.clientPath(fileName)};
    }

    public async read(fileName: string, options?: {start?: number}): Promise<{stream: Readable; clientPath: string}> {
        this.connection.restByteCount = 0;

        const stream = new DeferredDownloadStream(() => {
            if (!this.transfers.watch(stream)) {
                return Promise.reject(new Error('PTP FTP data connection is already closed'));
            }

            return this.remote.read(fileName, options);
        });

        return {stream, clientPath: this.clientPath(fileName)};
    }

    public delete(fileName: string): Promise<unknown> {
        return this.remote.delete(fileName);
    }

    public mkdir(directory: string): Promise<string> {
        return this.remote.mkdir(directory);
    }

    public rename(from: string, to: string): Promise<unknown> {
        return this.remote.rename(from, to);
    }

    public chmod(fileName: string, mode: number | string): Promise<unknown> {
        return this.remote.chmod(fileName, mode);
    }

    public getUniqueName(): string {
        return this.remote.getUniqueName();
    }

    private fileDetails(file: FileDetailResponse): EngineFileDetails {
        // PTP resolves and confines paths server-side; its API exposes resolved entries.
        return {...file, uid: 0, gid: 0, nlink: 1, isSymbolicLink: () => false};
    }

    private clientPath(fileName: string): string {
        return path.posix.resolve(this.remote.currentDirectory(), fileName.replace(/\\/g, '/'));
    }
}
