import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {parse} from 'yaml';
import type {Connection, ConnectionDraft, Credentials} from '../shared/types';

interface Encryption {
    isEncryptionAvailable(): boolean | Promise<boolean>;
    encryptString(value: string): Buffer | Promise<Buffer>;
    decryptString(value: Buffer): string | Promise<string>;
}

interface StoredConnection extends Connection {
    secret: string;
}

export function importProfile(source: string, name: string): ConnectionDraft {
    if (source.length > 65536) {
        throw new Error('Choose a YAML profile smaller than 64 KiB.');
    }

    const data = parse(source, {maxAliasCount: 20});

    if (!data || typeof data !== 'object' || Array.isArray(data) || data.extends) {
        throw new Error('Import a self-contained YAML profile. Merge inherited settings before importing.');
    }

    for (const address of [data.host, data.passiveUrl]) {
        if (address && !['127.0.0.1', 'localhost', '::1'].includes(address)) {
            throw new Error('The desktop importer accepts only loopback FTP hosts and passive addresses.');
        }
    }

    const apiEndPoint = String(data.apiEndPoint || '');
    let kind: ConnectionDraft['kind'] = 'php';

    if (apiEndPoint.includes('/wp-json/') || apiEndPoint.includes('rest_route=')) {
        kind = 'wordpress';
    }

    return {
        id: '', name: name.replace(/\.ya?ml$/i, ''), kind,
        apiEndPoint, apiUsername: String(data.apiUsername || ''),
        password: String(data.apiPassword || ''), host: '127.0.0.1',
        port: Number(data.port || 8021), passiveUrl: '127.0.0.1', requestTransport: data.requestTransport || 'encrypted',
    };
}

export function validateEndpoint(value: string): URL {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || (isIP(url.hostname) === 4 && url.hostname.startsWith('127.'));

    if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
        throw new Error('Use an HTTPS endpoint without embedded credentials or a fragment. HTTP is allowed only on loopback.');
    }

    return url;
}

export function validateDraft(input: unknown): ConnectionDraft {
    if (!input || typeof input !== 'object') {
        throw new Error('Connection details are missing.');
    }

    const draft = input as ConnectionDraft;

    for (const field of ['id', 'name', 'apiEndPoint', 'apiUsername', 'host', 'passiveUrl', 'password'] as const) {
        if (typeof draft[field] !== 'string' || draft[field].length > 4096) {
            throw new Error('Invalid connection field: ' + field);
        }
    }

    if (!draft.name.trim() || !draft.apiUsername.trim()) {
        throw new Error('Enter a connection name and username.');
    }

    if (draft.id && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(draft.id)) {
        throw new Error('Invalid saved connection identifier.');
    }

    if (draft.kind !== 'wordpress' && draft.kind !== 'php') {
        throw new Error('Choose WordPress or standalone PHP.');
    }

    if (draft.requestTransport !== undefined && !['encrypted', 'legacy'].includes(draft.requestTransport)) {
        throw new Error('Request transport must be encrypted or legacy.');
    }

    if (draft.host !== '127.0.0.1' || !['', '127.0.0.1'].includes(draft.passiveUrl)) {
        throw new Error('The desktop bridge uses 127.0.0.1 for its FTP host and passive address.');
    }

    if (!Number.isInteger(draft.port) || draft.port < 1024 || draft.port > 65535) {
        throw new Error('Choose an FTP port between 1024 and 65535.');
    }

    validateEndpoint(draft.apiEndPoint);

    return {...draft, name: draft.name.trim(), apiUsername: draft.apiUsername.trim(), apiEndPoint: draft.apiEndPoint.trim()};
}

export class ProfileStore {
    private profiles: StoredConnection[] = [];
    private readonly directory: string;
    private readonly encryption: Encryption;

    public constructor(directory: string, encryption: Encryption) {
        this.directory = directory;
        this.encryption = encryption;
    }

    public async load(): Promise<void> {
        try {
            const data = JSON.parse(await readFile(join(this.directory, 'connections.json'), 'utf8'));

            if (data.schemaVersion !== 1 || !Array.isArray(data.profiles)) {
                throw new Error('Unsupported connection storage format.');
            }

            this.profiles = data.profiles.map((profile: StoredConnection) => {
                validateDraft({...profile, password: ''});

                if (typeof profile.secret !== 'string') {
                    throw new Error('Invalid encrypted connection password.');
                }

                return profile;
            });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    public list(): Connection[] {
        return this.profiles.map(({secret, ...profile}) => ({...profile, hasPassword: Boolean(secret)}));
    }

    public async credentials(id: string): Promise<Credentials> {
        const profile = this.profiles.find(item => item.id === id);

        if (!profile) {
            throw new Error('Select a saved connection.');
        }

        try {
            return {...this.list().find(item => item.id === id)!, password: await this.encryption.decryptString(Buffer.from(profile.secret, 'base64'))};
        } catch {
            throw new Error('The operating system could not unlock this password. Enter it again and save the connection.');
        }
    }

    public async save(input: unknown): Promise<Connection> {
        const draft = validateDraft(input);
        const previous = this.profiles.find(item => item.id === draft.id);

        if (!draft.password && !previous?.secret) {
            throw new Error('Enter the API password or WordPress Application Password.');
        }

        if (!await this.encryption.isEncryptionAvailable()) {
            throw new Error('OS password encryption is unavailable. Unlock the system keyring and restart PTP.');
        }

        let secret = previous?.secret || '';

        if (draft.password) {
            secret = (await this.encryption.encryptString(draft.password)).toString('base64');
        }

        const profile: StoredConnection = {
            id: previous?.id || randomUUID(), name: draft.name, kind: draft.kind,
            apiEndPoint: draft.apiEndPoint, apiUsername: draft.apiUsername,
            host: draft.host, port: draft.port, passiveUrl: draft.passiveUrl,
            hasPassword: true, secret,
            requestTransport: draft.requestTransport || 'encrypted',
        };
        const profiles = this.profiles.filter(item => item.id !== profile.id).concat(profile);

        await this.persist(profiles);
        this.profiles = profiles;

        return this.list().find(item => item.id === profile.id)!;
    }

    public async remove(id: string): Promise<void> {
        const profiles = this.profiles.filter(item => item.id !== id);

        await this.persist(profiles);
        this.profiles = profiles;
    }

    private async persist(profiles: StoredConnection[]): Promise<void> {
        await mkdir(this.directory, {recursive: true, mode: 0o700});
        const temporary = join(this.directory, 'connections-' + randomUUID() + '.tmp');

        await writeFile(temporary, JSON.stringify({schemaVersion: 1, profiles}, null, 2), {mode: 0o600, flag: 'wx'});
        await rename(temporary, join(this.directory, 'connections.json'));
    }
}
