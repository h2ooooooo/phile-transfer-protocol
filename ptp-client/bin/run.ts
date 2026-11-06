import {spawn} from 'child_process';
import path from 'path';
import os from 'os';
import * as fs from 'fs';

function getNpmBinExtension(): string {
    const platform: string = os.platform();

    if (platform === 'win32') {
        if (process.env.ComSpec?.toLowerCase().endsWith('powershell.exe')) {
            // Check powershell script

            return '.ps1';
        } else {
            // Return cmd script

            return '.cmd';
        }
    }

    return ''; // No extension, probably a unix environment
}

function getNpmBin(binCommand: string): string {
    const binPath = path.join(__dirname, '..', 'node_modules', '.bin', binCommand + getNpmBinExtension());

    if (!fs.existsSync(binPath)) {
        throw new Error(`Could not find npm binary at ${binPath}`);
    }

    return binPath;
}

// This seems to be the only way to make
// "npm run start mysite.yaml"
// work like
// "ts-node-dev --respawn --transpile-only src/index.ts mysite.yaml
// since you otherwise can't give the extra npm arguments to ts-node-dev
const tsNodeDevPath: string = getNpmBin('ts-node-dev');

const additionalArgs: string[] = process.argv.slice(2);

const tsNodeDevArgs: string[] = ['--respawn', '--transpile-only', 'src/index.ts', ...additionalArgs];

console.log('Launching tsNodeDevProcess', tsNodeDevPath, tsNodeDevArgs);
const tsNodeDevProcess = spawn(tsNodeDevPath, tsNodeDevArgs, {stdio: 'inherit'});
