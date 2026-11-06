const assert = require('node:assert/strict');
const {createHash, randomBytes} = require('node:crypto');

async function checkApiContract(endpoint, authorization) {
    const prefix = 'contract-' + randomBytes(6).toString('hex');
    let checks = 0;

    async function request(action, parameters = {}, method = 'GET', body) {
        const url = new URL(endpoint);

        url.searchParams.set('action', action);

        for (const [name, value] of Object.entries(parameters)) {
            url.searchParams.set(name, String(value));
        }

        return fetch(url, {
            method,
            headers: {Authorization: authorization, 'Content-Type': 'application/octet-stream'},
            body,
            signal: AbortSignal.timeout(30000),
        });
    }

    async function json(action, parameters, method, body, expectedStatus = 200) {
        const response = await request(action, parameters, method, body);
        const raw = await response.text();
        let result;

        try {
            result = JSON.parse(raw);
        } catch {
            throw new Error(action + ' returned HTTP ' + response.status + ': ' + raw.slice(0, 500));
        }

        assert.equal(response.status, expectedStatus, action + ': ' + JSON.stringify(result));
        checks++;

        if (expectedStatus === 200) {
            assert.equal(result.success, true);
            checks++;
        }

        return result;
    }

    const filePath = prefix + '.bin';
    const original = Buffer.from([0, 1, 2, 0xff, 0x50, 0x54, 0x50]);

    await json('write', {path: filePath}, 'POST', original);
    const metadata = await json('get', {path: filePath});

    assert.equal(metadata.file.size, original.length);
    checks++;

    const readResponse = await request('read', {path: filePath});

    assert.equal(readResponse.headers.get('content-type')?.split(';')[0], 'application/octet-stream');
    assert.equal(readResponse.headers.get('content-length'), String(original.length));
    assert.deepEqual(Buffer.from(await readResponse.arrayBuffer()), original);
    checks += 3;

    const wrongMethod = await request('write', {path: filePath});
    const wrongMethodError = await wrongMethod.json();

    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');
    assert.equal(wrongMethodError.code, 'ptp_method_not_allowed');
    checks += 3;

    await json('write', {}, 'POST', Buffer.from('invalid'), 400);
    await json('write', {path: prefix + '/new/file.bin', start: 1}, 'POST', Buffer.from('invalid'), 400);
    await json('get', {path: prefix + '/new/file.bin'}, 'GET', undefined, 404);
    await json('get', {path: prefix}, 'GET', undefined, 404);

    const invalidAction = new URL(endpoint);

    invalidAction.searchParams.set('action[]', 'read');
    const invalidResponse = await fetch(invalidAction, {
        headers: {Authorization: authorization},
        signal: AbortSignal.timeout(30000),
    });
    const invalidError = await invalidResponse.json();

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidError.code, 'ptp_invalid_request');
    assert.doesNotMatch(JSON.stringify(invalidError), /TypeError|called in|\\.php on line/i);
    checks += 3;

    const payload = Buffer.from('committed payload');
    const begin = await json('uploadBegin', {path: filePath}, 'POST');
    const uploadId = begin.upload.id;

    assert.match(uploadId, /^[a-f0-9]{64}$/);
    assert.equal(begin.upload.offset, 0);
    checks += 2;

    await json('uploadWrite', {uploadId, offset: 0}, 'POST', payload);
    await json('uploadWrite', {uploadId, offset: 0}, 'POST', payload, 409);
    await json('uploadCommit', {uploadId, size: payload.length, sha256: '0'.repeat(64)}, 'POST', undefined, 409);
    const beforeCommit = await request('read', {path: filePath});

    assert.deepEqual(Buffer.from(await beforeCommit.arrayBuffer()), original);
    checks++;

    const sha256 = createHash('sha256').update(payload).digest('hex');

    await json('uploadCommit', {uploadId, size: payload.length, sha256}, 'POST');
    const afterCommit = await request('read', {path: filePath});

    assert.deepEqual(Buffer.from(await afterCommit.arrayBuffer()), payload);
    checks++;

    const aborted = await json('uploadBegin', {path: filePath}, 'POST');

    await json('uploadWrite', {uploadId: aborted.upload.id, offset: 0}, 'POST', original);
    await json('uploadAbort', {uploadId: aborted.upload.id}, 'POST');
    const afterAbort = await request('read', {path: filePath});

    assert.deepEqual(Buffer.from(await afterAbort.arrayBuffer()), payload);
    checks++;

    const listing = await json('list', {path: '/'});

    assert.equal(listing.list.some(file => file.name.includes(uploadId)), false);
    checks++;

    await json('delete', {path: filePath}, 'DELETE');

    return checks;
}

module.exports = {checkApiContract};
