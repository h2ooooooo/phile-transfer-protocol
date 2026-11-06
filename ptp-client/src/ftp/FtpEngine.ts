import {installFtpControlInput} from './FtpControlInput';
import type UpstreamFtpServer from '@electerm/ftp-srv' with {'resolution-mode': 'import'};
import type {FtpConnection as UpstreamFtpConnection} from '@electerm/ftp-srv' with {'resolution-mode': 'import'};

// The CommonJS entry exports the constructor directly and publishes ESM declarations.
const Engine: typeof UpstreamFtpServer = require('@electerm/ftp-srv');

export type FtpConnection = UpstreamFtpConnection;
export type FtpServerOptions = NonNullable<ConstructorParameters<typeof Engine>[0]>;

export class FtpServer extends Engine {
    public constructor(options: FtpServerOptions = {}) {
        super(options);

        this.on('connect', ({connection}: {connection: FtpConnection}) => {
            installFtpControlInput(connection);
        });
    }

    public override get port(): number {
        if (this.url.port) {
            return Number(this.url.port);
        }

        if (this.url.protocol === 'ftps:') {
            return 990;
        }

        return 21;
    }

    public override async disconnectClient(id: string): Promise<void> {
        const client = this.connections[id];

        if (!client) {
            return;
        }

        delete this.connections[id];
        let timeout: ReturnType<typeof setTimeout> | undefined;

        try {
            const deadline = new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error('Timed out disconnecting the client')), this.options.timeout || 1000);
            });

            await Promise.race([client.close(), deadline]);
        } catch (error) {
            this.log.error({error, id}, 'Error closing connection');
            client.connector.end();
            client.commandSocket.destroy();
        } finally {
            clearTimeout(timeout);
        }
    }
    public override listen(): Promise<string> {
        // WHATWG URL retains IPv6 brackets; net.Server expects the bare address.
        const hostname = this.url.hostname.replace(/^\[|\]$/g, '');
        const port = this.port;

        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, hostname, () => {
                this.server.removeListener('error', reject);
                this.log.info({protocol: this.url.protocol.replace(/\W/g, ''), ip: hostname, port}, 'Listening');
                resolve('Listening');
            });
        });
    }
}
