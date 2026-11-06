import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open, readFile, rename, unlink} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import type {Artifact, Release} from '../shared/types';

export const releaseOrigin = 'https://phile-transfer-protocol.jalsoedesign.net';
const maximumArtifactSize = 64 * 1024 * 1024;

export function parseRelease(input: unknown, source: Release['source']): Release {
    const data = input as Release;

    if (!data || !/^\d+\.\d+\.\d+$/.test(data.version) || typeof data.published !== 'boolean' || !Array.isArray(data.artifacts)) {
        throw new Error('The release service returned an invalid manifest.');
    }

    const artifacts = data.artifacts.filter(artifact => artifact.name === 'ptp-server-' + data.version + '.zip' || artifact.name === 'ptp-wordpress-' + data.version + '.zip');

    if (artifacts.length !== 2 || new Set(artifacts.map(artifact => artifact.name)).size !== 2) {
        throw new Error('The manifest must include one server ZIP and one WordPress ZIP.');
    }

    for (const artifact of artifacts) {
        const expectedPath = '/releases/' + data.version + '/' + artifact.name;

        if (artifact.path !== expectedPath || artifact.url !== releaseOrigin + expectedPath || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > maximumArtifactSize) {
            throw new Error('A release download URL, size, or checksum is invalid.');
        }
    }

    return {version: data.version, published: data.published, source, artifacts};
}

export class ReleaseService {
    private release: Release | null = null;
    private readonly localDirectory: string;

    public constructor(localDirectory: string) {
        this.localDirectory = localDirectory;
    }

    public current(): Release | null {
        return this.release;
    }

    public async loadLocal(): Promise<void> {
        try {
            const manifest = JSON.parse(await readFile(join(this.localDirectory, 'latest.json'), 'utf8'));

            this.release = parseRelease(manifest, 'local');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    public async refresh(): Promise<Release> {
        const response = await fetch(releaseOrigin + '/releases/latest.json', {redirect: 'error', signal: AbortSignal.timeout(10000)});

        if (!response.ok) {
            throw new Error('The release service returned HTTP ' + response.status + '. Prepared local downloads remain available.');
        }

        const reader = response.body!.getReader();
        const chunks: Buffer[] = [];
        let size = 0;

        while (true) {
            const {done, value} = await reader.read();

            if (done) {
                break;
            }

            size += value.length;

            if (size > 65536) {
                await reader.cancel();

                throw new Error('The release manifest is too large.');
            }

            chunks.push(Buffer.from(value));
        }

        const release = parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'remote');

        if (!release.published) {
            throw new Error('This remote release is not marked as published. Use the prepared local downloads.');
        }

        this.release = release;

        return release;
    }

    public artifact(kind: string): Artifact {
        const artifact = this.release?.artifacts.find(item => item.name.startsWith('ptp-' + kind + '-'));

        if (!artifact || !['server', 'wordpress'].includes(kind)) {
            throw new Error('No verified download is available. Build the local releases or check the release service.');
        }

        return artifact;
    }

    public async download(kind: string, destination: string, progress: (received: number, total: number) => void): Promise<void> {
        const artifact = this.artifact(kind);
        const release = this.release!;
        const temporary = join(dirname(destination), '.ptp-' + randomUUID() + '.part');
        const file = await open(temporary, 'wx', 0o600);
        const hash = createHash('sha256');
        let size = 0;

        try {
            let stream: AsyncIterable<Uint8Array>;

            if (release.source === 'local') {
                stream = createReadStream(join(this.localDirectory, release.version, artifact.name));
            } else {
                const response = await fetch(artifact.url, {redirect: 'error', signal: AbortSignal.timeout(120000)});

                if (!response.ok || !response.body) {
                    throw new Error('Download failed: HTTP ' + response.status);
                }

                stream = response.body as unknown as AsyncIterable<Uint8Array>;
            }

            for await (const chunk of stream) {
                size += chunk.length;

                if (size > artifact.bytes) {
                    throw new Error('Download size does not match the release manifest.');
                }

                hash.update(chunk);
                await file.writeFile(chunk);
                progress(size, artifact.bytes);
            }

            if (size !== artifact.bytes || hash.digest('hex') !== artifact.sha256) {
                throw new Error('Download checksum verification failed. The ZIP has not been saved.');
            }

            await file.close();
            await rename(temporary, destination);
        } catch (error) {
            await file.close().catch(() => {});
            await unlink(temporary).catch(() => {});

            throw error;
        }
    }
}
