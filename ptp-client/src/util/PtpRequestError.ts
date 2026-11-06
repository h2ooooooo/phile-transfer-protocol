import {AxiosError} from 'axios';
import {Readable} from 'stream';

interface PtpAccessError {
    code?: unknown;
    message?: unknown;
    error?: unknown;
    data?: {blockers?: unknown};
}

const accessErrorCodes = new Set([
    'ptp_https',
    'ptp_auth',
    'ptp_disabled',
    'ptp_manage_options',
    'ptp_edit_themes',
    'ptp_file_mods',
    'ptp_file_mods_disabled',
    'ptp_file_edit_disabled',
    'ptp_folder_denied',
    'ptp_read_only',
    'ptp_root_invalid',
    'ptp_no_folders',
    'ptp_transport_invalid',
    'ptp_transport_unavailable',
]);

function sanitizeMessage(message: string, password: string): string {
    let sanitized = message;
    const passwordValues = [password, password.replace(/\s/g, '')];

    for (const passwordValue of passwordValues) {
        if (passwordValue) {
            sanitized = sanitized.split(passwordValue).join('[redacted]');
        }
    }

    // FTP replies must stay on one line, including when a remote error contains controls.
    return sanitized.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1000);
}

async function readErrorResponse(response: unknown): Promise<unknown> {
    if (!(response instanceof Readable)) {
        return response;
    }

    let body = '';

    response.setEncoding('utf8');

    try {
        for await (const chunk of response) {
            body += chunk;

            if (body.length > 16384) {
                return undefined;
            }
        }

        return JSON.parse(body);
    } catch {
        // An unreadable or non-JSON error body falls back to the HTTP status.
        return undefined;
    } finally {
        response.destroy();
    }
}

export async function createPtpRequestError(error: AxiosError, password: string): Promise<Error> {
    const status = error.response?.status;

    if (!status) {
        return new Error('PTP connection failed');
    }

    const summary = 'PTP request failed (HTTP ' + status + ')';
    const response = await readErrorResponse(error.response?.data);

    // Only forward structured PTP access errors, never arbitrary HTML or Axios request data.
    if (!response || typeof response !== 'object') {
        return new Error(summary);
    }

    const data = response as PtpAccessError;

    if (data.message === undefined && typeof data.error === 'string') {
        data.message = data.error;
    }

    if (typeof data.code !== 'string' || !accessErrorCodes.has(data.code) || typeof data.message !== 'string') {
        return new Error(summary);
    }

    const messages: string[] = [];
    const blockers = data.data?.blockers;

    if (blockers && typeof blockers === 'object' && !Array.isArray(blockers)) {
        for (const [code, message] of Object.entries(blockers)) {
            if (accessErrorCodes.has(code) && typeof message === 'string') {
                messages.push(message);
            }
        }
    }

    if (messages.length === 0) {
        messages.push(data.message);
    }

    const detail = sanitizeMessage(messages.join(' '), password);

    return new Error(summary + ': ' + detail);
}
