import {Logger} from 'winston';

type LogFields = Record<string, unknown>;

export class FtpLogger {
    private readonly logger: Logger;
    private readonly secrets: string[];
    private readonly bindings: LogFields;

    public constructor(logger: Logger, secrets: string[] = [], bindings: LogFields = {}) {
        this.logger = logger;
        this.secrets = [...new Set(secrets.flatMap(secret => [secret, secret.replace(/\s/g, ''), encodeURIComponent(secret)]).filter(Boolean))].sort((first, second) => second.length - first.length);
        this.bindings = bindings;
    }

    public child(bindings: LogFields): FtpLogger {
        return new FtpLogger(this.logger, this.secrets, {...this.bindings, ...bindings});
    }

    public trace(...values: unknown[]): void {
        this.write('debug', values);
    }

    public debug(...values: unknown[]): void {
        this.write('debug', values);
    }

    public info(...values: unknown[]): void {
        this.write('info', values);
    }

    public warn(...values: unknown[]): void {
        this.write('warn', values);
    }

    public error(...values: unknown[]): void {
        this.write('error', values);
    }

    public fatal(...values: unknown[]): void {
        this.write('error', values);
    }

    private sanitizeText(value: string): string {
        let sanitized = value;

        for (const secret of this.secrets) {
            sanitized = sanitized.split(secret).join('[redacted]');
        }

        return sanitized.replace(/\bPASS(?:\s|:|=)+[^\r\n]*/gi, 'PASS [redacted]').slice(0, 2000);
    }

    private sanitize(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
        if (typeof value === 'string') {
            return this.sanitizeText(value);
        }

        if (value === null || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (typeof value !== 'object') {
            return undefined;
        }

        if (Buffer.isBuffer(value)) {
            return '[binary data]';
        }

        if (value instanceof Error) {
            const error = value as Error & {code?: string | number};

            return {
                name: this.sanitizeText(error.name),
                message: this.sanitizeText(error.message),
                code: this.sanitize(error.code, seen, depth + 1),
            };
        }

        if (seen.has(value) || depth >= 5) {
            return '[nested data]';
        }

        seen.add(value);

        if (Array.isArray(value)) {
            return value.slice(0, 50).map(entry => this.sanitize(entry, seen, depth + 1));
        }

        const result: LogFields = {};

        for (const [key, entry] of Object.entries(value).slice(0, 50)) {
            if (/^(?:password|passwd|pass|authorization|cookie|set-cookie|headers|command|raw|arg|args|body|payload|request|response|config)$/i.test(key)) {
                result[key] = '[redacted]';

                continue;
            }

            result[key] = this.sanitize(entry, seen, depth + 1);
        }

        return result;
    }

    private write(level: string, values: unknown[]): void {
        const fields = this.sanitize(this.bindings, new WeakSet()) as LogFields;
        const messages: string[] = [];

        for (const value of values) {
            if (typeof value === 'string') {
                messages.push(this.sanitizeText(value));
            } else if (value instanceof Error) {
                messages.push(this.sanitizeText(value.message));
                fields.error = this.sanitize(value, new WeakSet());
            } else if (Array.isArray(value) || Buffer.isBuffer(value)) {
                fields.data = this.sanitize(value, new WeakSet());
            } else if (value && typeof value === 'object') {
                Object.assign(fields, this.sanitize(value, new WeakSet()));
            }
        }

        this.logger.log({
            ...fields,
            component: 'ftp-server',
            level,
            message: messages.join(' ') || 'FTP server event',
        });
    }
}
