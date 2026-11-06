import {createCipheriv, createDecipheriv, hkdfSync, randomBytes} from 'crypto';

export const ENCRYPTED_TRANSPORT = 'encrypted-v1';
export const MAX_ENCRYPTED_PAYLOAD = 512 * 1024;
const context = 'PTP encrypted request v1';
const maximumMetadata = 16384;

export interface EncryptedRequest {
    version: 1;
    nonce: string;
    tag: string;
    data: string;
}

export function encryptRequest(method: string, parameters: Record<string, string>, body: Buffer, password: string): EncryptedRequest {
    const metadata = Buffer.from(JSON.stringify({method: method.toUpperCase(), parameters}), 'utf8');

    if (!password || metadata.length > maximumMetadata || body.length > MAX_ENCRYPTED_PAYLOAD) {
        throw new Error('PTP encrypted request exceeds its metadata or payload limit, or has no password');
    }

    const length = Buffer.alloc(4);

    length.writeUInt32BE(metadata.length);
    const nonce = randomBytes(12);
    const key = Buffer.from(hkdfSync('sha256', password, nonce, context, 32));
    const cipher = createCipheriv('aes-256-gcm', key, nonce);

    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(Buffer.concat([length, metadata, body])), cipher.final()]);

    return {version: 1, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64')};
}

/** Used by local protocol fixtures as well as integrations requiring the wire format. */
export function decryptRequest(envelope: EncryptedRequest, password: string): {method: string; parameters: Record<string, string>; body: Buffer} {
    if (envelope.version !== 1) {
        throw new Error('Unsupported PTP encrypted request version');
    }

    const nonce = Buffer.from(envelope.nonce, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');

    if (nonce.length !== 12 || tag.length !== 16) {
        throw new Error('Invalid PTP encrypted request nonce or tag');
    }

    const key = Buffer.from(hkdfSync('sha256', password, nonce, context, 32));
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);

    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    const length = plaintext.readUInt32BE();

    if (length > maximumMetadata || length > plaintext.length - 4 || plaintext.length - length - 4 > MAX_ENCRYPTED_PAYLOAD) {
        throw new Error('Invalid PTP encrypted request length');
    }

    const metadata = JSON.parse(plaintext.subarray(4, 4 + length).toString('utf8'));

    return {...metadata, body: plaintext.subarray(4 + length)};
}
