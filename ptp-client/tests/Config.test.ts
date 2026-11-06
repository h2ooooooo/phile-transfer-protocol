import {Config} from '../src/Config';
import * as fs from 'fs';
import * as path from 'path';

describe('Config', () => {
    const tempConfigPath = path.join(__dirname, 'temp-config.yaml');
    const tempBaseConfigPath = path.join(__dirname, 'temp-base.yaml');

    afterEach(() => {
        if (fs.existsSync(tempConfigPath)) {
            fs.unlinkSync(tempConfigPath);
        }

        if (fs.existsSync(tempBaseConfigPath)) {
            fs.unlinkSync(tempBaseConfigPath);
        }
    });

    test('should load simple config', () => {
        const configContent = `
host: 127.0.0.2
port: 9000
apiUsername: user1
apiPassword: pass1
apiEndPoint: http://api.example.com
`;

        fs.writeFileSync(tempConfigPath, configContent);

        const config = new Config();

        config.loadConfig(tempConfigPath);

        expect(config.host).toBe('127.0.0.2');
        expect(config.port).toBe(9000);
        expect(config.apiUsername).toBe('user1');
        expect(config.apiPassword).toBe('pass1');
        expect(config.apiEndPoint).toBe('http://api.example.com');
    });

    test('should extend base config', () => {
        const baseContent = `
host: 127.0.0.1
port: 8021
apiUsername: baseuser
`;
        const childContent = `
extends: temp-base.yaml
apiUsername: childuser
apiPassword: childpassword
apiEndPoint: http://child.example.com
`;

        fs.writeFileSync(tempBaseConfigPath, baseContent);
        fs.writeFileSync(tempConfigPath, childContent);

        const config = new Config();

        config.loadConfig(tempConfigPath);

        expect(config.host).toBe('127.0.0.1'); // From base
        expect(config.port).toBe(8021);       // From base
        expect(config.apiUsername).toBe('childuser'); // Overridden
        expect(config.apiPassword).toBe('childpassword');
        expect(config.apiEndPoint).toBe('http://child.example.com');
    });

    test('should verify integrity', () => {
        const config = new Config();

        config.host = '127.0.0.1';
        // Missing port, etc.

        expect(() => config.verifyIntegrity()).toThrow('Config.port missing');

        config.port = 8021;
        config.apiUsername = 'user';
        config.apiPassword = 'pass';
        config.apiEndPoint = 'https://api.com';

        expect(() => config.verifyIntegrity()).not.toThrow();
    });

    test.each([
        'http://example.com/ptp.php',
        'http://127.0.0.1.example.com/ptp.php',
        'http://localhost.example.com/ptp.php',
        'http://192.168.1.2/ptp.php',
        'ftp://127.0.0.1/ptp.php',
        'https://user:password@example.com/ptp.php',
        'https://user@example.com/ptp.php',
        'not a URL',
    ])('rejects unsafe endpoint %s', apiEndPoint => {
        const config = Object.assign(new Config(), {
            host: '127.0.0.1', port: 8021, apiUsername: 'user', apiPassword: 'pass', apiEndPoint,
        });

        expect(() => config.verifyIntegrity()).toThrow();
    });

    test.each([
        'https://example.com/ptp.php',
        'http://localhost:8000/ptp.php',
        'http://127.0.0.1:8000/ptp.php',
        'http://127.0.0.2:8000/ptp.php',
        'http://[::1]:8000/ptp.php',
    ])('accepts secure or loopback endpoint %s', apiEndPoint => {
        const config = Object.assign(new Config(), {
            host: '127.0.0.1', port: 8021, apiUsername: 'user', apiPassword: 'pass', apiEndPoint,
        });

        expect(() => config.verifyIntegrity()).not.toThrow();
    });

    test('should find config path', () => {
        const config = new Config();
        const configName = 'test-config-file.yaml';
        const configFullPath = path.join(__dirname, configName);

        fs.writeFileSync(configFullPath, 'host: localhost');

        try {
            // Test finding it in the same directory
            const foundPath = config.findConfigPath(__dirname, configName);

            expect(foundPath).toContain(configName);
            expect(fs.existsSync(foundPath)).toBe(true);
        } finally {
            if (fs.existsSync(configFullPath)) {
                fs.unlinkSync(configFullPath);
            }
        }
    });

    test('should throw error for missing config', () => {
        const config = new Config();

        expect(() => config.findConfigPath(__dirname, 'non-existent.yaml')).toThrow('Could not find config "non-existent.yaml"');
    });

    test('should throw error for missing extended config', () => {
        const configContent = 'extends: missing-base.yaml';

        fs.writeFileSync(tempConfigPath, configContent);

        const config = new Config();

        expect(() => config.loadConfig(tempConfigPath)).toThrow('Could not find extended config "missing-base.yaml"');
    });
});
