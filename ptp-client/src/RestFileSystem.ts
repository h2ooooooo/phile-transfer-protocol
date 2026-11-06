import {FtpConnection} from './ftp/FtpEngine';
import axios, {AxiosInstance} from 'axios';
import path from 'path';
import {randomUUID} from 'crypto';
import {APIWritableStream, ApiWriteFunction, ApiWriteFunctionData} from './APIWritableStream';
import {Logger} from 'winston';
import {CommandExecutor} from './CommandExecutor';
import {createPtpRequestError} from './util/PtpRequestError';
import {validateEndpoint} from './util/validateEndpoint';
import {Readable} from 'stream';
import {Socket} from 'net';
import {observeFtpAbort} from './util/observeFtpAbort';
import {encryptRequest, ENCRYPTED_TRANSPORT} from './util/encryptedRequest';

/**
 * Represents the options for configuring a REST file system connection.
 */
export interface RestFileSystemOptions {
    endPointUrl: string;
    logger: Logger;
    apiUsername: string;
    apiPassword: string;
    requestTransport?: 'encrypted' | 'legacy';
}

/**
 * Represents the details of a file.
 *
 * @interface FileDetails
 */
export interface FileDetails {
    name: string;
    size: number;
    modified: number;
    isDirectory: () => boolean;
}

/**
 * Represents the response object containing details of a file.
 */
export interface FileDetailResponse {
    name: string;
    size: number;
    mtime: Date;
    isDirectory: () => boolean;
}

/**
 *
 */
export class RestFileSystem {
    private readonly controlSocket?: Socket;

    /**
     * The command prefix used to identify bot commands.
     *
     * @type {string}
     */
    private commandPrefix: string = '> ';

    /**
     * Represents the working directory.
     *
     * @type {string}
     */
    protected workingDirectory: string = '/';

    /**
     * Represents an instance of Axios.
     *
     * @typedef {Object} AxiosInstance
     * @property {function} request - Sends an HTTP request.
     * @property {function} get - Sends an HTTP GET request.
     * @property {function} delete - Sends an HTTP DELETE request.
     * @property {function} head - Sends an HTTP HEAD request.
     * @property {function} post - Sends an HTTP POST request.
     * @property {function} put - Sends an HTTP PUT request.
     * @property {function} patch - Sends an HTTP PATCH request.
     * @property {function} getUri - Returns a URL based on specified parameters.
     *
     * @see {@link https://github.com/axios/axios|Axios GitHub Repository}
     */
    protected readonly axiosInstance: AxiosInstance;

    /**
     * Logger
     *
     * @typedef {Object} Logger
     * @property {Function} debug - Logs a debug message.
     * @property {Function} info - Logs an info message.
     * @property {Function} warn - Logs a warning message.
     * @property {Function} error - Logs an error message.
     */
    protected readonly logger: Logger;
    /**
     * Represents the URL of the endpoint to be used for communication.
     * @typedef {string} endPointUrl
     */
    protected readonly endPointUrl: string;

    /**
     * Represents a command executor.
     *
     * @class
     */
    protected readonly commandExecutor: CommandExecutor;

    /**
     * Constructor for the RestFileSystem class.
     * @param {FtpConnection} connection - The FTP connection.
     * @param {RestFileSystemOptions} restFileSystemOptions - The options for the RestFileSystem.
     */
    public constructor(connection: FtpConnection, options: RestFileSystemOptions) {
        validateEndpoint(options.endPointUrl);

        this.controlSocket = connection.commandSocket;
        this.logger = options.logger;
        this.endPointUrl = options.endPointUrl;
        this.commandExecutor = new CommandExecutor(this);
        this.axiosInstance = axios.create({
            timeout: 60000,
            maxRedirects: 0,
            auth: {username: options.apiUsername, password: options.apiPassword},
        });

        if (options.requestTransport === 'encrypted') {
            this.axiosInstance.interceptors.request.use(request => {
                const actionUrl = new URL(request.url!);
                const parameters = Object.fromEntries(actionUrl.searchParams);
                const endpoint = new URL(this.endPointUrl);

                for (const key of endpoint.searchParams.keys()) {
                    delete parameters[key];
                }

                const body = request.data === undefined ? Buffer.alloc(0) : request.data;

                if (!Buffer.isBuffer(body)) {
                    throw new Error('PTP encrypted requests require a binary upload buffer');
                }

                request.data = JSON.stringify(encryptRequest(request.method || 'GET', parameters, body, options.apiPassword));
                request.method = 'post';
                request.url = endpoint.toString();
                request.headers.set('Content-Type', 'application/json');
                request.headers.set('X-PTP-Transport', ENCRYPTED_TRANSPORT);
                request.maxBodyLength = 2 * 1024 * 1024;

                return request;
            });
        }

        // Axios errors contain request credentials: never pass them to FTP loggers.
        this.axiosInstance.interceptors.response.use(response => response, async error => {
            const requestError = await createPtpRequestError(error, options.apiPassword);

            throw requestError;
        });
    }

    /**
     * Fix the given path by normalizing it and replacing backslashes with forward slashes.
     *
     * @param {string} pathToFix - The path to fix.
     * @param {boolean} [addWorkingDirectory=true] - Whether or not to add the working directory to the path. Default is true.
     * @param {string} origin - The origin of the path.
     * @returns {string} The fixed path.
     */
    private fixPath(value: string, addWorkingDirectory = true, _origin = ''): string {
        return path.posix.resolve(addWorkingDirectory ? this.workingDirectory : '/', value.replace(/\\/g, '/'));
    }

    /**
     * Returns the current directory.
     *
     * @returns {string} The current directory.
     */
    public currentDirectory(): string {
        return this.workingDirectory;
    }

    /**
     * Checks if a given path contains a valid command.
     *
     * @param {string} path - The path to be checked.
     * @throws {Error} - Throws an error with the command output or 'N/A' if command execution fails.
     */
    public checkPathForCommand(path: string) {
        const parsedCommand: string | undefined = this.parseCommand(path);

        if (!parsedCommand) {
            return; // No command
        }

        const command = parsedCommand;

        if (!this.commandExecutor.isCommand(command)) {
            return; // Not a command
        }

        const commandOutput: string = this.commandExecutor.executeCommand(command);

        throw new Error(commandOutput || 'N/A');
    }

    /**
     * Retrieves information about a file or directory.
     *
     * @param {string} path - The path of the file or directory to retrieve information about.
     * @return {Promise<FileDetailResponse>} - A promise that resolves to an object containing file details.
     * @throws {Error} - If there was an error retrieving the information.
     */
    private requireSuccess(data: any): any {
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.success !== true) {
            throw new Error('Invalid PTP response');
        }

        return data;
    }
    private fileDetails(data: any): FileDetailResponse {
        if (!data || typeof data.name !== 'string' || !Number.isSafeInteger(data.size) || data.size < 0 ||
            typeof data.modified !== 'number' || !Number.isFinite(data.modified) ||
            typeof data.isDirectory !== 'boolean' || Number.isNaN(new Date(data.modified * 1000).getTime())) {
            throw new Error('Invalid PTP file metadata');
        }

        return {name: data.name, size: data.size, mtime: new Date(data.modified * 1000), isDirectory: () => data.isDirectory};
    }
    public async get(value: string): Promise<FileDetailResponse> {
        this.checkPathForCommand(value);
        const response = await this.axiosInstance.get(this.generateActionUrl('get', {path: this.fixPath(value)}));

        return this.fileDetails(this.requireSuccess(response.data).file);
    }

    /**
     * Lists contents of a directory.
     * @param {string} [path='.'] - The path of the directory. Default is the current directory.
     * @return {Promise<FileDetailResponse[]>} - A promise that resolves with an array of file details.
     * @throws Will throw an exception if there is an error listing the directory.
     */
    public async list(value = '.'): Promise<FileDetailResponse[]> {
        this.checkPathForCommand(value);
        const response = await this.axiosInstance.get(this.generateActionUrl('list', {path: this.fixPath(value)}));
        const data = this.requireSuccess(response.data);

        if (!Array.isArray(data.list)) {
            throw new Error('Invalid PTP directory listing');
        }

        return data.list.map((file: unknown) => this.fileDetails(file));
    }

    /**
     * Changes the current working directory.
     *
     * @param {string} path - The new directory path. Defaults to current directory if not provided.
     * @returns {Promise<string>} - A Promise that resolves to the new directory path.
     */
    public async chdir(value = '.'): Promise<string> {
        this.checkPathForCommand(value);
        const target = this.fixPath(value);

        if (!(await this.get(target)).isDirectory()) {
            throw new Error('Not a directory');
        }

        this.workingDirectory = target;

        return target;
    }

    /**
     * Creates a new directory.
     *
     * @param {string} path - The path of the directory to be created.
     * @returns {Promise<any>} - A Promise that resolves to the path if the directory is successfully created.
     * @throws {Error} - If an error occurs during the directory creation process.
     */
    public async mkdir(value: string): Promise<string> {
        const target = this.fixPath(value);

        this.requireSuccess((await this.axiosInstance.post(this.generateActionUrl('mkdir', {path: target}))).data);

        return target;
    }

    /**
     * Deletes a file or directory.
     *
     * @param {string} path - The path of the file or directory to delete.
     * @returns {Promise<any>} - A promise that resolves with the response data if the deletion is successful, otherwise rejects with an error.
     * @throws - Throws an error if there is an error during the deletion process.
     */
    public async delete(value: string): Promise<any> {
        const target = this.fixPath(value);
        const action = (await this.get(target)).isDirectory() ? 'rmdir' : 'delete';

        return this.requireSuccess((await this.axiosInstance.delete(this.generateActionUrl(action, {path: target}))).data);
    }

    /**
     * Renames a file or directory.
     *
     * @param {string} from - The current path of the file or directory to be renamed.
     * @param {string} to - The new path that the file or directory will be renamed to.
     *
     * @returns {Promise<any>} - A promise that resolves to the response data from the rename operation.
     *
     * @throws {Error} - If an error occurs during the rename operation, an error object will be thrown.
     */
    public async rename(from: string, to: string): Promise<any> {
        return this.requireSuccess((await this.axiosInstance.post(this.generateActionUrl('rename', {
            from: this.fixPath(from), to: this.fixPath(to),
        }))).data);
    }

    /**
     * Reads the content of a file.
     *
     * @param {string} path - The path of the file to be read.
     * @param {Object} [options] - Optional parameters for reading the file.
     * @param {any} [options.start] - The starting point for reading the file.
     *
     * @returns {Promise<any>} - A promise that resolves with the content of the file.
     *
     * @throws {Error} - If an error occurs during the reading process.
     */
    public async read(path: string, options?: {start?: number}): Promise<Readable> {
        path = this.fixPath(path, true, 'read');

        const start = options?.start || undefined;

        this.logger.debug('read', {path, start});

        try {
            const response = await this.axiosInstance.get(
                this.generateActionUrl('read', {path: path, start: start}),
                {
                    responseType: 'stream'
                }
            );

            const contentTypeHeader = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'content-type');
            const contentType = String(contentTypeHeader?.[1] ?? '').split(';')[0].trim().toLowerCase();

            if (contentType !== 'application/octet-stream' || !(response.data instanceof Readable)) {
                if (response.data instanceof Readable) {
                    response.data.destroy();
                }

                throw new Error('Invalid PTP download response: expected application/octet-stream');
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Error in read: ${error}`);

            throw error;
        }
    }

    /**
     * Writes content to a file.
     *
     * @param {string} path - The path of the file to write.
     * @param {ApiWriteFunction} config - The configuration options for the write operation.
     * @returns {Promise<APIWritableStream>} A promise that resolves to an APIWritableStream object.
     */
    public async write(value: string, config?: ApiWriteFunction): Promise<APIWritableStream> {
        const target = this.fixPath(value);
        const start = config?.start ?? 0;
        const append = config?.append ?? false;

        if (!Number.isSafeInteger(start) || start < 0 || (append && start !== 0)) {
            throw new Error('Invalid upload offset');
        }

        let abortRequested = false;
        const stopPendingAbort = observeFtpAbort(this.controlSocket, () => {
            abortRequested = true;
        });
        let beginResponse;

        try {
            beginResponse = await this.axiosInstance.post(this.generateActionUrl('uploadBegin', {
                path: target, append, start,
            }));
        } finally {
            stopPendingAbort();
        }

        const upload = this.requireSuccess(beginResponse.data).upload;

        if (!upload || typeof upload.id !== 'string' || !/^[a-f0-9]{64}$/.test(upload.id)) {
            throw new Error('Invalid PTP upload session');
        }

        const uploadId: string = upload.id;
        let cancelUpload: (() => void) | undefined;
        let stopObservingAbort = () => {};
        const releaseConnection = () => {
            stopObservingAbort();

            if (cancelUpload) {
                this.controlSocket?.off('close', cancelUpload);
            }
        };
        const abort = async () => {
            releaseConnection();

            const response = await this.axiosInstance.post(this.generateActionUrl('uploadAbort', {uploadId}));

            this.requireSuccess(response.data);
        };

        if (upload.offset !== 0 || !Number.isSafeInteger(upload.maxChunkSize) || upload.maxChunkSize < 1 || upload.maxChunkSize > 4 * 1024 * 1024) {
            await abort();

            throw new Error('Invalid PTP upload session limits');
        }

        const chunkSize = Math.min(upload.maxChunkSize, 1024 * 1024);
        let offset = 0;

        const write = async (_file: string, options: ApiWriteFunctionData) => {
            const nextOffset = offset + options.data.length;
            const response = await this.axiosInstance.post(this.generateActionUrl('uploadWrite', {
                uploadId, offset,
            }), options.data, {
                headers: {'Content-Type': 'application/octet-stream'},
                maxBodyLength: chunkSize,
            });
            const result = this.requireSuccess(response.data).upload;

            if (!result || result.id !== uploadId || result.offset !== nextOffset) {
                throw new Error('Invalid PTP upload acknowledgement');
            }

            offset = nextOffset;
        };

        const finalize = async (size: number, sha256: string) => {
            const response = await this.axiosInstance.post(this.generateActionUrl('uploadCommit', {
                uploadId, size, sha256,
            }));
            const result = this.requireSuccess(response.data);

            if (result.size !== size || result.sha256 !== sha256) {
                throw new Error('Invalid PTP upload commit acknowledgement');
            }

            releaseConnection();
        };

        if (abortRequested) {
            await abort();

            throw new Error('PTP upload aborted by FTP client');
        }

        if (this.controlSocket?.destroyed) {
            await abort();

            throw new Error('PTP FTP connection closed');
        }

        const stream = new APIWritableStream(write, target, {append, start, chunkSize, finalize, abort});

        cancelUpload = () => stream.destroy(new Error('PTP FTP connection closed'));
        this.controlSocket?.once('close', cancelUpload);
        stopObservingAbort = observeFtpAbort(this.controlSocket, () => stream.destroy(new Error('PTP upload aborted by FTP client')));

        return stream;
    }

    /**
     * Changes the file mode (chmod).
     * @param {string} path - The path of the file to change the mode.
     * @param {string} mode - The new mode to set for the file.
     * @returns {Promise<any>} - A Promise that resolves when the operation is complete.
     * @throws {Error} - If an error occurs while changing the mode.
     */
    public async chmod(value: string, mode: number | string): Promise<any> {
        const octal = typeof mode === 'number' ? mode.toString(8) : mode;

        if (!/^[0-7]{3,4}$/.test(octal)) {
            throw new Error('Invalid permission mode');
        }

        return this.requireSuccess((await this.axiosInstance.post(this.generateActionUrl('chmod', {
            path: this.fixPath(value), mode: octal,
        }))).data);
    }

    /**
     * Generates an action URL with given action and parameters.
     *
     * @param {string} action - The action to be performed.
     * @param {Object} [params={}] - The parameters for the action in key-value pairs.
     * @return {string} The generated action URL.
     */
    public generateActionUrl(action: string, params: Record<string, string | number | boolean | undefined> = {}): string {
        const url = new URL(this.endPointUrl);

        url.hash = '';
        url.searchParams.set('action', action);

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }

        return url.toString();
    }

    /**
     * Generates a unique name.
     *
     * @returns {string} The generated unique name.
     */
    public getUniqueName(): string {
        this.logger.debug('getUniqueName');

        return randomUUID().replace(/\W/g, '');
    }

    private formatCommand(command: string) {
        return `{${command}}`;
    }

    private parseCommand(command: string): string | undefined {
        const match = command.match(/^\{([^\}]+)\}$/);

        if (match && match.length >= 1 && match[1]) {
            return match[1];
        }

        return undefined;
    }
}
