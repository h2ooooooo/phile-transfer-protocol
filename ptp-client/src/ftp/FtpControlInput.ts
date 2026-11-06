import type {FtpConnection} from './FtpEngine';

interface QueuedCommand {
    message: string;
    directive: string;
    bytes: number;
}

const MAX_COMMAND_BYTES = 4096;
const MAX_QUEUED_BYTES = 64 * 1024;
const MAX_QUEUED_COMMANDS = 128;
const TRANSFER_COMMANDS = new Set(['STOR', 'STOU', 'APPE', 'RETR', 'LIST', 'NLST', 'MLSD']);
const TRANSFER_INTERRUPTS = new Set(['ABOR', 'QUIT', 'NOOP']);

/** Frames TCP bytes before decoding or dispatching any FTP command. */
class FtpControlInput {
    private pending = Buffer.alloc(0);
    private queued: QueuedCommand[] = [];
    private queuedBytes = 0;
    private interruptBytes = 0;
    private interruptCount = 0;
    private running = false;
    private transferring = false;
    private closed = false;
    private interrupts: Promise<void> = Promise.resolve();

    public constructor(private readonly connection: FtpConnection) {
        const socket = connection.commandSocket;
        const initialListeners = socket.listeners('data');

        // The engine's initial listener assumes one packet contains complete commands.
        // Keep listeners registered later by application observers intact.
        for (const listener of initialListeners) {
            socket.removeListener('data', listener as (data: Buffer) => void);
        }

        socket.on('data', this.onData);
        socket.once('close', this.onClose);
        socket.on('pause', this.onPause);
    }

    private readonly onClose = (): void => {
        this.closed = true;
        this.pending = Buffer.alloc(0);
        this.queued = [];
        this.queuedBytes = 0;
        this.connection.commandSocket.off('data', this.onData);
        this.connection.commandSocket.off('pause', this.onPause);
    };

    private readonly onPause = (): void => {
        if (!this.transferring) {
            return;
        }

        // Data handlers pause the control channel, but ABOR and QUIT must stay usable.
        queueMicrotask(() => {
            if (!this.closed && this.transferring && !this.connection.commandSocket.destroyed) {
                this.connection.commandSocket.resume();
            }
        });
    };

    private readonly onData = (data: Buffer | string): void => {
        if (this.closed) {
            return;
        }

        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

        if (this.pending.length + this.queuedBytes + this.interruptBytes + chunk.length > MAX_QUEUED_BYTES) {
            this.fail('Too much pending FTP control input');

            return;
        }

        this.pending = Buffer.concat([this.pending, chunk]);
        let lineEnd = this.pending.indexOf('\r\n');

        while (lineEnd !== -1 && !this.closed) {
            const bytes = this.pending.subarray(0, lineEnd);

            this.pending = this.pending.subarray(lineEnd + 2);

            if (bytes.length > MAX_COMMAND_BYTES || bytes.includes(0) || bytes.includes(10) || bytes.includes(13)) {
                this.fail('Invalid or oversized FTP command');

                return;
            }

            if (bytes.length > 0) {
                const message = bytes.toString('utf8');
                const command = {message, directive: this.connection.commands.parse(message).directive, bytes: bytes.length};

                if (this.queued.length + this.interruptCount >= MAX_QUEUED_COMMANDS) {
                    this.fail('Too many pending FTP commands');

                    return;
                }

                this.queued.push(command);
                this.queuedBytes += bytes.length;
                this.drain();
            }

            lineEnd = this.pending.indexOf('\r\n');
        }

        // A final CR may be the first byte of a delimiter split across packets.
        const trailingDelimiterByte = this.pending.at(-1) === 13 ? 1 : 0;

        if (this.pending.length - trailingDelimiterByte > MAX_COMMAND_BYTES) {
            this.fail('Invalid or oversized FTP command');
        }
    };

    private takeCommand(): QueuedCommand | undefined {
        const command = this.queued.shift();

        if (command) {
            this.queuedBytes -= command.bytes;
        }

        return command;
    }

    private drain(): void {
        if (this.closed) {
            return;
        }

        if (this.transferring) {
            let command = this.takeCommand();

            while (command) {
                this.interruptTransfer(command);
                command = this.takeCommand();
            }

            return;
        }

        if (this.running || this.interruptCount > 0) {
            return;
        }

        const command = this.takeCommand();

        if (!command) {
            return;
        }

        this.running = true;
        this.transferring = TRANSFER_COMMANDS.has(command.directive);
        void this.connection.commands.handle(command.message).catch(() => {
            this.fail('FTP command failed');
        }).finally(() => {
            this.running = false;
            this.transferring = false;
            this.drain();
        });

        if (this.transferring) {
            this.drain();
        }
    }

    private interruptTransfer(command: QueuedCommand): void {
        this.interruptCount++;
        this.interruptBytes += command.bytes;

        // Interrupts cannot wait behind the transfer they are intended to stop.
        // Keep their responses bounded as well when a client does not read replies.
        this.interrupts = this.interrupts.then(async () => {
            if (this.closed) {
                return;
            }

            if (!TRANSFER_INTERRUPTS.has(command.directive)) {
                await this.connection.reply(450, 'A file transfer is in progress');

                return;
            }

            if (command.directive === 'ABOR' || command.directive === 'QUIT') {
                this.connection.connector.end();
            }

            await this.connection.commands.handle(command.message);
        }).catch(() => {
            this.fail('FTP command failed');
        }).finally(() => {
            this.interruptCount--;
            this.interruptBytes -= command.bytes;
            this.drain();
        });
    }

    private fail(message: string): void {
        if (this.closed) {
            return;
        }

        this.onClose();
        this.connection.log.warn('Closing FTP control connection after invalid input');
        void this.connection.close(500, message).catch(() => this.connection.commandSocket.destroy());
    }
}

export function installFtpControlInput(connection: FtpConnection): void {
    new FtpControlInput(connection);
}
