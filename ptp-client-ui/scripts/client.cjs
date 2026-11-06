const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const client = path.resolve(__dirname, '../../ptp-client');
const npm = process.env.npm_execpath;

function run(args) {
    const result = spawnSync(process.execPath, [npm, ...args], {cwd: client, stdio: 'inherit', windowsHide: true});

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

if (!fs.existsSync(path.join(client, 'node_modules/typescript'))) {
    run(['ci']);
}

run(['run', 'build']);
