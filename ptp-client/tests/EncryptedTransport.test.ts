import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {encryptRequest, decryptRequest} from '../src/util/encryptedRequest';
import {RestFileSystem} from '../src/RestFileSystem';

describe('encrypted request transport', () => {
    test('hides metadata and binary payload, uses distinct nonces, and detects tampering', () => {
        const parameters = {action: 'read', path: '/wp-config.php'};
        const body = Buffer.from('\0\xff<?php wp-config.php');
        const first = encryptRequest('GET', parameters, body, 'private fixture password');
        const second = encryptRequest('GET', parameters, body, 'private fixture password');

        expect(JSON.stringify(first)).not.toContain('wp-config');
        expect(JSON.stringify(first)).not.toContain('private fixture password');
        expect(first.nonce).not.toEqual(second.nonce);
        expect(decryptRequest(first, 'private fixture password')).toEqual({method: 'GET', parameters, body});
        expect(() => decryptRequest({...first, tag: Buffer.alloc(16).toString('base64')}, 'private fixture password')).toThrow();
        expect(() => decryptRequest(first, 'wrong password')).toThrow();
        expect(() => encryptRequest('POST', parameters, Buffer.alloc(1024 * 1024 + 1), 'password')).toThrow(/limit/);
    });

    test('sends ordinary JSON POST to the unchanged WordPress endpoint, preserving rest_route', async () => {
        const mock = new MockAdapter(axios);
        const endpoint = 'https://example.invalid/?rest_route=/ptp/v1/files';
        const remote = new RestFileSystem({} as any, {
            logger: {debug() {}, error() {}, info() {}} as any,
            endPointUrl: endpoint, apiUsername: 'operator', apiPassword: 'fixture password', requestTransport: 'encrypted',
        });

        try {
            mock.onPost().reply(request => {
                expect(request.url).toBe(new URL(endpoint).toString());
                expect(request.url).not.toContain('wp-config');
                expect(request.headers!['Content-Type']).toBe('application/json');
                expect(request.headers!['X-PTP-Transport']).toBe('encrypted-v1');
                const envelope = JSON.parse(request.data);
                const decoded = decryptRequest(envelope, 'fixture password');

                expect(decoded.parameters).toEqual({action: 'get', path: '/wp-config.php'});
                expect(decoded.method).toBe('GET');

                return [200, {success: true, file: {name: 'wp-config.php', size: 12, modified: 1700000000, isDirectory: false}}];
            });
            expect((await remote.get('/wp-config.php')).size).toBe(12);
        } finally {
            mock.restore();
        }
    });
});
