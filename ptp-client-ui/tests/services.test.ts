import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCipheriv, createDecipheriv, randomBytes, createHash} from 'node:crypto';
import {ProfileStore, importProfile, validateDraft} from '../src/main/profiles';
import {ReleaseService, parseRelease, releaseOrigin} from '../src/main/releases';
import {testEndpoint} from '../src/main/endpoint';
import type {ConnectionDraft, Credentials} from '../src/shared/types';

const draft: ConnectionDraft = {id: '', name: 'Fixture', kind: 'php', host: '127.0.0.1', port: 18021, passiveUrl: '127.0.0.1', apiEndPoint: 'https://example.invalid/ptp.php', apiUsername: 'fixture', password: 'private-test-password'};
const key = randomBytes(32);
const encryption = {
    isEncryptionAvailable: () => true,
    encryptString(value: string): Buffer {
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, nonce);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

        return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value: Buffer): string {
        const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));

        decipher.setAuthTag(value.subarray(12, 28));

        return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
};

test('profiles persist encrypted credentials, retain a blank password, and survive reload', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ptp-ui-test-'));

    try {
        const store = new ProfileStore(directory, encryption);

        await store.load();
        const profile = await store.save(draft);
        const contents = await readFile(join(directory, 'connections.json'), 'utf8');

        assert.equal(contents.includes(draft.password), false);
        assert.equal('secret' in profile, false);
        assert.equal('password' in profile, false);
        await store.save({...draft, id: profile.id, name: 'Renamed', password: ''});
        const reloaded = new ProfileStore(directory, encryption);

        await reloaded.load();
        assert.equal((await reloaded.credentials(profile.id)).password, draft.password);
        assert.equal(reloaded.list()[0].name, 'Renamed');
        await reloaded.remove(profile.id);
        assert.deepEqual(reloaded.list(), []);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('profile validation rejects unsafe endpoints, nonlocal FTP, and invalid ports', () => {
    for (const changes of [{apiEndPoint: 'http://remote.invalid/ptp'}, {apiEndPoint: 'https://user:secret@example.invalid'}, {port: 8021.5}, {port: 80}, {host: '0.0.0.0'}]) {
        assert.throws(() => validateDraft({...draft, ...changes}));
    }

    assert.equal(validateDraft({...draft, apiEndPoint: 'http://127.0.0.1:8080/ptp.php'}).port, draft.port);
});

test('WordPress YAML import keeps the endpoint and credentials and normalizes loopback FTP', () => {
    const imported = importProfile('host: localhost\nport: 8022\napiEndPoint: https://example.invalid/?rest_route=/ptp/v1/files\napiUsername: operator\napiPassword: private-wordpress-password\n', 'site.yaml');

    assert.equal(imported.kind, 'wordpress');
    assert.equal(imported.apiEndPoint, 'https://example.invalid/?rest_route=/ptp/v1/files');
    assert.equal(imported.password, 'private-wordpress-password');
    assert.equal(imported.host, '127.0.0.1');
    assert.equal(imported.port, 8022);
    assert.equal(imported.name, 'site');
    assert.throws(() => importProfile('extends: ../../private.yaml', 'site.yaml'), /self-contained/);
    assert.throws(() => importProfile('host: 0.0.0.0', 'site.yaml'), /only loopback/);
    assert.throws(() => importProfile('[]', 'site.yaml'), /self-contained/);
});

test('profile storage refuses an unavailable keyring and corrupted files without overwriting them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ptp-ui-test-'));

    try {
        const unavailable = new ProfileStore(directory, {...encryption, isEncryptionAvailable: () => false});

        await assert.rejects(unavailable.save(draft), /encryption is unavailable/);
        await writeFile(join(directory, 'connections.json'), 'broken JSON');
        await assert.rejects(new ProfileStore(directory, encryption).load());
        assert.equal(await readFile(join(directory, 'connections.json'), 'utf8'), 'broken JSON');
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('release downloads verify size and SHA-256 and leave an existing file intact on failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ptp-ui-test-'));
    const data = Buffer.from('synthetic ZIP payload');
    const artifacts = ['server', 'wordpress'].map(kind => {
        const name = 'ptp-' + kind + '-0.2.0.zip';
        const path = '/releases/0.2.0/' + name;

        return {name, path, url: releaseOrigin + path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')};
    });
    const manifest = {version: '0.2.0', published: false, artifacts};

    try {
        await mkdir(join(directory, '0.2.0'));
        await writeFile(join(directory, 'latest.json'), JSON.stringify(manifest));
        await writeFile(join(directory, '0.2.0', artifacts[0].name), data);
        const service = new ReleaseService(directory);
        const destination = join(directory, 'download.zip');

        await service.loadLocal();
        await service.download('server', destination, () => {});
        assert.deepEqual(await readFile(destination), data);
        await writeFile(join(directory, '0.2.0', artifacts[0].name), Buffer.alloc(data.length));
        await assert.rejects(service.download('server', destination, () => {}), /checksum/);
        assert.deepEqual(await readFile(destination), data);
        assert.throws(() => parseRelease({...manifest, artifacts: artifacts.map(item => ({...item, url: 'https://untrusted.invalid/file.zip'}))}, 'remote'), /invalid/);
        const pagesOrigin = new URL(releaseOrigin).origin;

        assert.throws(() => parseRelease({...manifest, artifacts: artifacts.map(item => ({...item, url: pagesOrigin + item.path}))}, 'remote'), /invalid/);
        assert.throws(() => service.artifact('../client'), /No verified download/);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('access test authenticates and reports real WordPress blockers and non-PTP failures', async () => {
    let mode = 'success';
    const server = createServer((request, response) => {
        assert.equal(request.headers.authorization, 'Basic ' + Buffer.from(draft.apiUsername + ':' + draft.password).toString('base64'));
        assert.equal(request.method, 'POST');
        assert.equal(request.url, '/ptp.php');
        assert.equal(request.headers['x-ptp-transport'], 'encrypted-v1');

        if (mode === 'success') {
            response.end(JSON.stringify({success: true, list: []}));
        } else if (mode === 'wordpress') {
            response.writeHead(403, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({code: 'ptp_disabled', message: 'PTP access is disabled. Enable it under Tools > PTP.'}));
        } else {
            response.writeHead(403);
            response.end('<html>Gateway denied</html>');
        }
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as {port: number}).port;
    const profile: Credentials = {...draft, id: 'fixture', hasPassword: true, apiEndPoint: 'http://127.0.0.1:' + port + '/ptp.php'};

    try {
        assert.match(await testEndpoint(profile), /0 entries/);
        mode = 'wordpress';
        await assert.rejects(testEndpoint(profile), /HTTP 403: PTP access is disabled/);
        mode = 'html';
        await assert.rejects(testEndpoint(profile), /non-PTP response/);
    } finally {
        server.close();
    }
});
