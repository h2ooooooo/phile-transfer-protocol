const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {once} = require('node:events');
const {createRequire} = require('node:module');
const {root, fixture, cleanup, startPhp, stop} = require('./test-support.cjs');

const clientRequire = createRequire(path.join(root, 'ptp-client/package.json'));
const {RestFileSystem} = clientRequire('./dist/src/RestFileSystem.js');
const {encryptRequest} = clientRequire('./dist/src/util/encryptedRequest.js');
const temporary = fixture();
const password = 'encrypted-fixture-password';
const authorization = 'Basic ' + Buffer.from('fixture:' + password).toString('base64');
let server;
let proxy;

async function main() {
    const served = path.join(temporary, 'files');

    fs.mkdirSync(served);
    const names = ['wp-config.php', '.htaccess', 'xmlrpc.php', 'plugins/acf/assets/images/index.php', 'themes/framework/vendor/bin/carbon', 'unicode/æøå.txt'];

    for (const name of names) {
        const file = path.join(served, name);

        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, Buffer.from('Synthetic content for ' + name + '\0\xff', 'utf8'));
    }

    server = await startPhp(path.join(root, 'ptp-server/src'), {PTP_ROOT_PATH: served, PTP_USERNAME: 'fixture', PTP_PASSWORD: password});
    let blocked = 0;
    let accepted = 0;
    const nonces = new Set();

    proxy = http.createServer(async (request, response) => {
        try {
            const chunks = [];

            for await (const chunk of request) {
                chunks.push(chunk);
            }

            const body = Buffer.concat(chunks);
            const plaintext = decodeURIComponent(request.url) + body.toString('utf8');

            // Disposable false-positive simulator, not a production firewall configuration.
            if (/wp-config|\.htaccess|xmlrpc|index\.php|vendor\/bin\/carbon/i.test(plaintext)) {
                blocked++;
                response.writeHead(403, {'Content-Type': 'text/html'});
                response.end('<h1>Fixture filename filter</h1>');

                return;
            }

            if (request.headers['x-ptp-transport']) {
                assert.equal(request.method, 'POST');
                assert.equal(request.url, '/ptp-server.php');
                assert.match(request.headers['content-type'], /^application\/json/);
                const envelope = JSON.parse(body.toString('utf8'));

                assert.equal(nonces.has(envelope.nonce), false);
                nonces.add(envelope.nonce);
                accepted++;
            }

            const upstream = await fetch(server.origin + request.url, {
                method: request.method,
                headers: {Authorization: request.headers.authorization || '', 'Content-Type': request.headers['content-type'] || '', 'X-PTP-Transport': request.headers['x-ptp-transport'] || ''},
                body: body.length ? body : undefined,
                redirect: 'error',
            });

            response.writeHead(upstream.status, {'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream'});
            response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
            response.writeHead(500);
            response.end(error.message);
        }
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const endpoint = 'http://127.0.0.1:' + proxy.address().port + '/ptp-server.php';
    const logger = {info() {}, error() {}, warn() {}, debug() {}};
    const filesystem = new RestFileSystem({}, {endPointUrl: endpoint, logger, apiUsername: 'fixture', apiPassword: password, requestTransport: 'encrypted'});
    const legacy = await fetch(endpoint + '?action=read&path=/wp-config.php', {headers: {Authorization: authorization}});

    assert.equal(legacy.status, 403);

    for (const name of names) {
        const stream = await filesystem.read('/' + name);
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        assert.deepEqual(Buffer.concat(chunks), fs.readFileSync(path.join(served, name)));
    }

    assert.equal((await filesystem.get('/wp-config.php')).isDirectory(), false);
    assert.ok((await filesystem.list('/')).some(file => file.name === 'wp-config.php'));
    await filesystem.mkdir('/new-folder');
    const payload = Buffer.concat([Buffer.from('wp-config.php\0<?php synthetic;'), Buffer.alloc(1024 * 1024 + 7, 0xaa)]);
    const upload = await filesystem.write('/new-folder/wp-config.php');
    const finished = once(upload, 'finish');

    upload.end(payload);
    await finished;
    assert.deepEqual(fs.readFileSync(path.join(served, 'new-folder/wp-config.php')), payload);
    await filesystem.rename('/new-folder/wp-config.php', '/new-folder/renamed.php');
    await filesystem.chmod('/new-folder/renamed.php', '644');
    await filesystem.delete('/new-folder/renamed.php');
    await filesystem.delete('/new-folder');

    const direct = server.origin + '/ptp-server.php';
    const envelope = encryptRequest('GET', {action: 'read', path: '/wp-config.php'}, Buffer.alloc(0), password);
    const post = (data, auth = authorization) => fetch(direct, {method: 'POST', headers: {Authorization: auth, 'Content-Type': 'application/json', 'X-PTP-Transport': 'encrypted-v1'}, body: JSON.stringify(data)});
    const changed = {...envelope, tag: Buffer.alloc(16).toString('base64')};

    assert.equal((await post(changed)).status, 400);
    assert.equal((await post(envelope, '')).status, 401);
    assert.equal((await post({...envelope, version: 2})).status, 400);
    const wrongMethod = encryptRequest('DELETE', {action: 'read', path: '/wp-config.php'}, Buffer.alloc(0), password);

    assert.equal((await post(wrongMethod)).status, 405);
    assert.equal((await post(encryptRequest('GET', {action: 'read', path: '/../outside'}, Buffer.alloc(0), password))).status, 401);
    assert.equal(blocked, 1);
    assert.ok(accepted > 15);
    console.log('Encrypted transport passed: ' + names.length + ' formerly filtered paths, binary multi-chunk upload, listing/stat/rename/chmod/delete, unique nonces, tamper/auth/method/root checks. Only the legacy plaintext request was blocked by the fixture firewall.');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    if (proxy) {
        proxy.closeAllConnections();
        await new Promise(resolve => proxy.close(resolve));
    }

    await stop(server?.child);
    cleanup(temporary);
});
