import type {Credentials} from '../shared/types';
import {validateEndpoint} from './profiles';
import {createRequire} from 'node:module';

const clientRequire = createRequire(require.resolve('@jalsoedesign/phile-transfer-protocol-client/package.json'));
const transport = clientRequire('./dist/src/util/encryptedRequest.js') as {
    encryptRequest(method: string, parameters: Record<string, string>, body: Buffer, password: string): unknown;
    ENCRYPTED_TRANSPORT: string;
};

export async function testEndpoint(profile: Credentials): Promise<string> {
    const url = validateEndpoint(profile.apiEndPoint);

    const headers: Record<string, string> = {Authorization: 'Basic ' + Buffer.from(profile.apiUsername + ':' + profile.password).toString('base64')};
    let method = 'POST';
    let requestBody: string | undefined;

    if (profile.requestTransport === 'legacy') {
        method = 'GET';
        url.searchParams.set('action', 'list');
        url.searchParams.set('path', '/');
    } else {
        headers['Content-Type'] = 'application/json';
        headers['X-PTP-Transport'] = transport.ENCRYPTED_TRANSPORT;
        requestBody = JSON.stringify(transport.encryptRequest('GET', {action: 'list', path: '/'}, Buffer.alloc(0), profile.password));
    }

    const response = await fetch(url, {
        method, body: requestBody, headers,
        redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const reader = response.body?.getReader();
    const chunks: Buffer[] = [];
    let size = 0;

    while (reader) {
        const {done, value} = await reader.read();

        if (done) {
            break;
        }

        size += value.length;

        if (size > 2 * 1024 * 1024) {
            await reader.cancel();

            throw new Error('The endpoint listing exceeded 2 MiB. Test a smaller FTP root.');
        }

        chunks.push(Buffer.from(value));
    }

    let body;

    try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new Error('HTTP ' + response.status + ': the host returned a non-PTP response. Check the endpoint URL, hosting access rules, and any proxy or firewall.');
    }

    if (!response.ok || body.success === false || body.code) {
        const details = body.message || body.error?.message || body.error || response.statusText;
        const message = typeof details === 'string' ? details : 'Access denied by the endpoint.';

        throw new Error('HTTP ' + response.status + ': ' + message.split(profile.password).join('[redacted]'));
    }

    if (!Array.isArray(body.list)) {
        throw new Error('The URL did not return a PTP directory listing. Copy the exact endpoint from the server or WordPress.');
    }

    return 'Authenticated successfully. Root listing returned ' + body.list.length + ' entries. Write permissions were not tested.';
}
