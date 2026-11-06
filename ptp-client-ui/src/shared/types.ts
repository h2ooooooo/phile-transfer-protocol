export interface Connection {
    id: string;
    name: string;
    kind: 'wordpress' | 'php';
    apiEndPoint: string;
    apiUsername: string;
    host: string;
    port: number;
    passiveUrl: string;
    hasPassword: boolean;
    requestTransport?: 'encrypted' | 'legacy';
}

export interface ConnectionDraft extends Omit<Connection, 'hasPassword'> {
    password: string;
}

export interface Credentials extends Connection {
    password: string;
}

export interface BridgeStatus {
    phase: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
    profileId: string | null;
    error: string;
    startedAt: string | null;
}

export interface LogEntry {
    id: number;
    profileId: string;
    time: string;
    level: 'info' | 'error' | 'warn';
    message: string;
}

export interface Artifact {
    name: string;
    url: string;
    path: string;
    bytes: number;
    sha256: string;
}

export interface Release {
    version: string;
    published: boolean;
    source: 'local' | 'remote';
    artifacts: Artifact[];
}

export interface Snapshot {
    profiles: Connection[];
    bridges: BridgeStatus[];
    logs: LogEntry[];
    secureStorage: boolean;
    release: Release | null;
}

export interface Result<T> {
    value?: T;
    error?: string;
}

export type Action = 'snapshot' | 'save' | 'remove' | 'import' | 'start' | 'stop' | 'test' | 'refresh' | 'download' | 'clearLogs' | 'docs' | 'copyPassword';

export interface DesktopAPI {
    invoke<T>(action: Action, payload?: unknown): Promise<Result<T>>;
    subscribe(listener: (state: Snapshot) => void): () => void;
}
