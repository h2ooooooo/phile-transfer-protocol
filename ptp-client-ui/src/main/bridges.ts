import {utilityProcess} from 'electron';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import type {BridgeStatus, Credentials, LogEntry} from '../shared/types';

interface Session {
    child: Electron.UtilityProcess;
    status: BridgeStatus;
    port: number;
    finished: Promise<void>;
}

export function redact(message: string, profile: Credentials): string {
    let result = message.replace(/\x1b\[[0-9;]*m/g, '');
    const secrets = [profile.password, Buffer.from(profile.apiUsername + ':' + profile.password).toString('base64')];

    for (const secret of secrets) {
        if (secret) {
            result = result.split(secret).join('[redacted]');
            result = result.split(encodeURIComponent(secret)).join('[redacted]');
        }
    }

    return result.replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/g, '$1?[redacted]').slice(0, 12000);
}

export class BridgeManager {
    private readonly sessions = new Map<string, Session>();
    private readonly logs = new Map<string, LogEntry[]>();
    private sequence = 0;
    private readonly directory: string;
    private readonly changed: () => void;
    private readonly workerPath: string;

    public constructor(directory: string, changed: () => void, workerPath: string) {
        this.directory = directory;
        this.changed = changed;
        this.workerPath = workerPath;
    }

    public statuses(): BridgeStatus[] {
        return [...this.sessions.values()].map(session => ({...session.status}));
    }

    public entries(): LogEntry[] {
        return [...this.logs.values()].flat().sort((left, right) => left.id - right.id);
    }

    public active(id: string): boolean {
        const phase = this.sessions.get(id)?.status.phase;

        return phase === 'starting' || phase === 'running' || phase === 'stopping';
    }

    public clear(id: string): void {
        this.logs.delete(id);
        this.changed();
    }

    public async start(profile: Credentials): Promise<void> {
        if (this.active(profile.id)) {
            throw new Error('This bridge is already running or changing state.');
        }

        for (const session of this.sessions.values()) {
            if (this.active(session.status.profileId!) && session.port === profile.port) {
                throw new Error('Port ' + profile.port + ' is already used by another PTP bridge. Choose a different port.');
            }
        }

        const directory = join(this.directory, profile.id);

        await mkdir(join(directory, 'logs'), {recursive: true, mode: 0o700});
        const child = utilityProcess.fork(this.workerPath, [], {
            cwd: directory, stdio: 'pipe', serviceName: 'PTP bridge: ' + profile.name,
        });
        const status: BridgeStatus = {phase: 'starting', profileId: profile.id, error: '', startedAt: null};
        const finished = new Promise<void>(resolve => child.once('exit', () => resolve()));
        const session: Session = {child, status, finished, port: profile.port};

        this.sessions.set(profile.id, session);
        this.append(profile.id, 'info', 'Starting bridge on 127.0.0.1:' + profile.port);

        for (const [stream, level] of [[child.stdout, 'info'], [child.stderr, 'error']] as const) {
            const decoder = new StringDecoder('utf8');
            let pending = '';

            stream?.on('data', (data: Buffer) => {
                pending += decoder.write(data);
                const lines = pending.split(/\r?\n/);

                pending = lines.pop() || '';

                for (const line of lines) {
                    this.capture(profile, line, level);
                }

                if (pending.length > 16000) {
                    this.capture(profile, pending, level);
                    pending = '';
                }
            });
            stream?.on('end', () => {
                this.capture(profile, pending + decoder.end(), level);
            });
        }

        const startup = setTimeout(() => {
            if (status.phase === 'starting') {
                status.phase = 'error';
                status.error = 'The bridge did not start within 15 seconds. Review the client log and try again.';
                child.kill();
                this.changed();
            }
        }, 15000);

        child.on('message', (message: {phase?: string; error?: string}) => {
            if (message.phase === 'running' && status.phase === 'starting') {
                clearTimeout(startup);
                status.phase = 'running';
                status.startedAt = new Date().toISOString();
            } else if (message.phase === 'error') {
                clearTimeout(startup);
                status.phase = 'error';
                status.error = redact(message.error || 'The client failed to start.', profile);
                this.append(profile.id, 'error', status.error);
            }

            this.changed();
        });
        child.on('exit', code => {
            clearTimeout(startup);

            if (status.phase !== 'error') {
                if (status.phase === 'stopping' || code === 0) {
                    status.phase = 'stopped';
                } else {
                    status.phase = 'error';
                    status.error = 'The client process exited with code ' + code + '. Review the log, then restart the bridge.';
                }
            }

            this.append(profile.id, status.phase === 'error' ? 'error' : 'info', status.error || 'Bridge stopped.');
        });
        child.postMessage({action: 'start', profile});
        this.changed();
    }

    public async stop(id: string): Promise<void> {
        const session = this.sessions.get(id);

        if (!session || !this.active(id)) {
            return;
        }

        session.status.phase = 'stopping';
        session.child.postMessage({action: 'stop'});
        this.changed();
        const timeout = setTimeout(() => session.child.kill(), 5000);

        await session.finished;
        clearTimeout(timeout);
    }

    public async stopAll(): Promise<void> {
        await Promise.all([...this.sessions.keys()].map(id => this.stop(id)));
    }

    private capture(profile: Credentials, line: string, level: LogEntry['level']): void {
        if (!line.trim()) {
            return;
        }

        let message = line;

        try {
            const parsed = JSON.parse(line);

            message = parsed.message || parsed.msg || line;

            if (parsed.err?.message && !message.includes(parsed.err.message)) {
                message += ': ' + parsed.err.message;
            }

            if (parsed.level === 'error' || parsed.level >= 50) {
                level = 'error';
            } else if (parsed.level === 'warn' || parsed.level === 40) {
                level = 'warn';
            }
        } catch {
            // Non-JSON diagnostics from Node and the client remain visible.
        }

        this.append(profile.id, level, redact(String(message), profile));
    }

    private append(profileId: string, level: LogEntry['level'], message: string): void {
        const entries = this.logs.get(profileId) || [];

        entries.push({id: ++this.sequence, time: new Date().toISOString(), profileId, level, message});
        this.logs.set(profileId, entries.slice(-500));
        this.changed();
    }
}
