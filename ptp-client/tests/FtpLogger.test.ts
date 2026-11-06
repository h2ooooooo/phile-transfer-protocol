import {Logger} from 'winston';
import {FtpLogger} from '../src/util/FtpLogger';

describe('FTP logger', () => {
    let output: jest.Mock;
    let logger: FtpLogger;

    beforeEach(() => {
        output = jest.fn();
        logger = new FtpLogger({log: output} as unknown as Logger, ['secret password', 'Basic encoded-credentials']);
    });

    test('maps FTP log levels to Winston without taking ownership of the logger', () => {
        logger.trace('trace');
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');
        logger.fatal('fatal');

        expect(output.mock.calls.map(call => call[0].level)).toEqual(['debug', 'debug', 'info', 'warn', 'error', 'error']);
    });

    test('redacts secrets and raw command metadata including unknown login attempts', () => {
        logger.child({id: 'connection', password: 'unknown-attempt'}).info({
            command: {directive: 'PASS', arg: 'unknown-attempt', raw: 'PASS unknown-attempt'},
            request: {headers: {Authorization: 'Basic encoded-credentials'}},
            note: 'secret password secretpassword secret%20password Basic encoded-credentials',
        }, 'PASS unknown-attempt');

        const record = output.mock.calls[0][0];
        const serialized = JSON.stringify(record);

        expect(record.id).toBe('connection');
        expect(record.component).toBe('ftp-server');
        expect(record.password).toBe('[redacted]');
        expect(record.command).toBe('[redacted]');
        expect(record.request).toBe('[redacted]');
        expect(serialized).not.toContain('unknown-attempt');
        expect(serialized).not.toContain('secret password');
        expect(serialized).not.toContain('secretpassword');
        expect(serialized).not.toContain('secret%20password');
        expect(serialized).not.toContain('encoded-credentials');
    });

    test('does not serialize credential-bearing error requests or stacks', () => {
        const error = Object.assign(new Error('Failed using secret password'), {
            code: 'EACCES',
            request: {password: 'unknown-attempt'},
        });

        error.stack = 'sensitive-stack unknown-attempt';
        logger.error(error, 'File request failed');
        const record = output.mock.calls[0][0];

        expect(record.error).toEqual({name: 'Error', message: 'Failed using [redacted]', code: 'EACCES'});
        expect(record.message).toBe('Failed using [redacted] File request failed');
        expect(JSON.stringify(record)).not.toContain('unknown-attempt');
    });

    test('redacts raw socket command arrays, binary buffers, and error codes', () => {
        logger.trace(['USER fixture', 'PASS unknown-attempt']);
        logger.trace(Buffer.from('PASS unknown-attempt'));
        logger.error(Object.assign(new Error('Request failed'), {code: 'secret password'}));

        expect(output.mock.calls[0][0].data).toEqual(['USER fixture', 'PASS [redacted]']);
        expect(output.mock.calls[1][0].data).toBe('[binary data]');
        expect(output.mock.calls[2][0].error.code).toBe('[redacted]');
        expect(JSON.stringify(output.mock.calls)).not.toContain('unknown-attempt');
    });
    test('keeps child bindings separate and bounds cyclic records', () => {
        const child = logger.child({id: 'first'});
        const cyclic: Record<string, unknown> = {};

        cyclic.self = cyclic;
        child.info(cyclic, 'child');
        logger.info('parent');

        expect(output.mock.calls[0][0].id).toBe('first');
        expect(output.mock.calls[0][0].self).toBe('[nested data]');
        expect(output.mock.calls[1][0].id).toBeUndefined();
    });
});
