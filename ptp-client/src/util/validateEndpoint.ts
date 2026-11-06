import {isIP} from 'net';

export function validateEndpoint(value: string): URL {
    let endpoint: URL;

    try {
        endpoint = new URL(value);
    } catch {
        throw new Error('The PTP API endpoint must be a valid HTTP or HTTPS URL');
    }

    if (endpoint.username !== '' || endpoint.password !== '') {
        throw new Error('The PTP API endpoint must not contain embedded credentials');
    }

    if (endpoint.protocol === 'https:') {
        return endpoint;
    }

    const hostname = endpoint.hostname;
    const isLoopbackAddress = hostname === '[::1]' || (isIP(hostname) === 4 && hostname.startsWith('127.'));
    const isLocalEndpoint = hostname === 'localhost' || isLoopbackAddress;

    if (endpoint.protocol !== 'http:' || !isLocalEndpoint) {
        throw new Error('Remote PTP API endpoints must use HTTPS; HTTP is allowed only on loopback');
    }

    return endpoint;
}
