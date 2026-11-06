import {FtpServer, FtpServerOptions} from './ftp/FtpEngine';
import {FtpFileSystemAdapter} from './ftp/FtpFileSystemAdapter';
import {RestFileSystem} from './RestFileSystem';
import {Logger, createLogger, format, transports} from 'winston';
import {Config} from './Config';
import {FtpLogger} from './util/FtpLogger';

export class ServerUtils {
    private static instance: ServerUtils | null = null;
    private server: FtpServer | null = null;
    private config: Config | null = null;
    private logger: Logger | null = null;

    private constructor() {}

    public static getInstance(): ServerUtils {
        if (!ServerUtils.instance) {
            ServerUtils.instance = new ServerUtils();
        }

        return ServerUtils.instance;
    }

    public async startServer(configPath: string): Promise<void> {
        const config = new Config();
        const configFullPath = config.findConfigPath(__dirname, configPath);

        config.loadConfig(configFullPath);
        await this.startWithConfig(config);
    }

    /** Start from an in-memory configuration, without writing credentials to YAML. */
    public async startWithConfig(config: Config): Promise<void> {
        config.verifyIntegrity();
        await this.stopServer();
        this.config = config;
        this.logger = this.createApplicationLogger();

        const logger = this.logger;
        const credentials = Buffer.from(config.apiUsername + ':' + config.apiPassword).toString('base64');
        const ftpLogger = new FtpLogger(logger, [config.apiPassword, credentials]);
        let host = config.host;

        if (host.includes(':')) {
            host = '[' + host + ']';
        }

        const ftpUrl = 'ftp://' + host + ':' + config.port;
        const ftpOptions: FtpServerOptions = {
            url: ftpUrl,
            log: ftpLogger,
            // The CLI and desktop worker own shutdown; a library must never exit their process.
            endOnProcessSignal: false,
        };

        if (config.passiveUrl) {
            ftpOptions.pasv_url = config.passiveUrl;
        }

        try {
            logger.info('Starting FTP server..');
            this.logConfiguration(logger, config);
            const server = new FtpServer(ftpOptions);

            this.server = server;
            server.on('login', ({connection, username, password}, resolve, reject) => {
                if (this.server !== server || username !== config.apiUsername || password !== config.apiPassword) {
                    reject(new Error('Invalid username or password'));

                    return;
                }

                const restFileSystem = new RestFileSystem(connection, {
                    logger,
                    endPointUrl: config.apiEndPoint,
                    apiUsername: config.apiUsername,
                    apiPassword: config.apiPassword,
                    requestTransport: config.requestTransport,
                });

                logger.info('Accepted connection from user ' + username);
                resolve({fs: new FtpFileSystemAdapter(connection, restFileSystem)});
            });

            await server.listen();
            logger.info('FTP Server started at ' + ftpUrl);
        } catch (error) {
            try {
                await this.stopServer();
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'FTP startup and cleanup failed');
            }

            throw error;
        }
    }

    public async stopServer(): Promise<void> {
        const server = this.server;

        this.server = null;
        this.config = null;

        try {
            if (server) {
                await server.close();
            }
        } finally {
            await this.closeLogger();
        }

        if (server) {
            console.log('FTP Server stopped');
        }
    }

    public getServer(): FtpServer | null {
        return this.server;
    }

    public getConfig(): Config | null {
        return this.config;
    }

    public setConfig(config: Config): void {
        this.config = config;

        if (!this.logger) {
            this.logger = this.createApplicationLogger();
        }

        this.logger.info('Using external server configuration');
        this.logConfiguration(this.logger, config);
    }

    private createApplicationLogger(): Logger {
        return createLogger({
            level: 'info',
            format: format.combine(format.timestamp(), format.json()),
            defaultMeta: {service: 'ftp-file-proxy'},
            transports: [
                new transports.Console(),
                new transports.File({filename: 'logs/error.log', level: 'error'}),
                new transports.File({filename: 'logs/combined.log'}),
            ],
        });
    }

    private logConfiguration(logger: Logger, config: Config): void {
        const endpoint = new URL(config.apiEndPoint);

        logger.info('Info: ', {
            'API Username': config.apiUsername,
            'API End point URL:': endpoint.origin + endpoint.pathname,
        });
    }

    private async closeLogger(): Promise<void> {
        const logger = this.logger;

        this.logger = null;

        if (!logger) {
            return;
        }

        try {
            await new Promise<void>((resolve, reject) => {
                logger.once('finish', resolve);
                logger.once('error', reject);
                logger.end();
            });
        } finally {
            logger.close();
        }
    }
}
