import fs from 'fs';
import {parse} from 'yaml';
import path from 'path';
import {validateEndpoint} from './util/validateEndpoint';

export class Config {
    public host: string = '';
    public port: number = 0;
    public apiUsername: string = '';
    public apiPassword: string = '';
    public apiEndPoint: string = '';
    public printCommands: boolean = false;
    public passiveUrl: string = '';
    public extends?: string;
    public requestTransport: 'encrypted' | 'legacy' = 'encrypted';

    public findConfigPath(basePath: string, configName: string): string {
        const cwd = process.cwd();

        let yamlPaths = [
            path.join(basePath, configName),
            path.join(basePath, `${configName}.yaml`),
            path.join(basePath, `/../config/${configName}`), // Path relative to the script, without .yaml
            path.join(basePath, `/../config/${configName}.yaml`), // Path relative to the script, with .yaml
            path.join(cwd, `${configName}`), // Path relative to cwd, without .yaml
            path.join(cwd, `${configName}.yaml`), // Path relative to cwd, with .yaml
            `${configName}`, // Full path, without .yaml
            `${configName}.yaml`, // Full path, with .yaml
        ];

        for (const yamlPathSingle of yamlPaths) {
            if (fs.existsSync(yamlPathSingle)) {
                return yamlPathSingle;
            }
        }

        throw new Error(`Could not find config "${configName}"`);
    }

    public loadConfig(filePath: string): void {
        const fileContents = fs.readFileSync(filePath, 'utf8');

        const config = parse(fileContents) as Partial<Config> & {extends?: string};

        // Handle extends property
        if (config.extends) {
            const baseConfigPath = path.join(path.dirname(filePath), config.extends);

            if (fs.existsSync(baseConfigPath)) {
                this.loadConfig(baseConfigPath);
            } else {
                throw new Error(`Could not find extended config "${config.extends}" referenced in "${filePath}"`);
            }
        }

        const configKeys = Object.keys(config) as Array<keyof Config>;

        for (const configKey of configKeys) {
            if (configKey in this && configKey !== 'extends') {
                (this as any)[configKey] = config[configKey];
            }
        }
    }

    public verifyIntegrity(): void {
        if (!['encrypted', 'legacy'].includes(this.requestTransport)) {
            throw new Error('Config.requestTransport must be encrypted or legacy');
        }

        if (!['127.0.0.1', '::1', 'localhost'].includes(this.host)) {
            throw new Error('The plaintext FTP bridge must bind to loopback');
        }

        // Checking if we got all of our config items
        const checkKeys = [
            'host',
            'port',
            'apiUsername',
            'apiPassword',
            'apiEndPoint'
        ] as const;

        for (const checkKey of checkKeys) {
            if (!this[checkKey]) {
                throw new Error(`Config.${checkKey} missing`);
            }
        }

        validateEndpoint(this.apiEndPoint);
    }
}
