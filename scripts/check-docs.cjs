const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {root, run, fixture, cleanup, isolatedEnvironment, startPhp, stop} = require('./test-support.cjs');
const {checkRenderedLinks, checkReadmeLinks} = require('./docs-links.cjs');

function htmlLinks() {
    const built = path.join(root, 'docs/.vitepress/dist');

    assert.ok(fs.existsSync(path.join(root, 'docs/acceptable-use.md')), 'The acceptable-use source page is missing.');
    assert.ok(fs.existsSync(path.join(built, 'acceptable-use.html')), 'The acceptable-use page must be present in the built docs.');
    checkReadmeLinks(root);

    return checkRenderedLinks({built, base: process.env.DOCS_BASE || '/'});
}

async function main() {
    if (process.argv.includes('--links-only')) {
        console.log('Verified ' + htmlLinks() + ' rendered local links/assets, including anchors and downloads.');

        return;
    }

    const temporary = fixture();
    let server;

    try {
        const served = path.join(temporary, 'served');

        fs.mkdirSync(served);
        const notes = path.join(served, 'notes.txt');

        fs.writeFileSync(notes, 'PTP\n');
        server = await startPhp(path.join(root, 'ptp-server/src'), {PTP_ENV_FILE: '', PTP_USERNAME: 'fixture', PTP_PASSWORD: 'fixture-password', PTP_ROOT_PATH: served});
        const example = path.join(root, 'docs/examples/api-list');
        const endpoint = server.origin + '/ptp-server.php';
        const environment = isolatedEnvironment({PTP_ENDPOINT: endpoint, PTP_USERNAME: 'fixture', PTP_PASSWORD: 'fixture-password'});

        run(process.execPath, [
            'ptp-client/node_modules/typescript/bin/tsc', '--noEmit', '--target', 'ES2022',
            '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--types', 'node',
            '--typeRoots', 'ptp-client/node_modules/@types', '--skipLibCheck',
            'docs/examples/api-list/list.ts',
        ]);

        for (const extension of ['ts', 'js', 'mjs', 'cjs']) {
            const source = path.join(example, 'list.' + extension);
            const download = path.join(root, 'docs/public/examples/api-list/list.' + extension);

            assert.equal(fs.readFileSync(source, 'utf8'), fs.readFileSync(download, 'utf8'));
            let args = [source];

            if (extension === 'ts') {
                args = ['--experimental-strip-types', source];
            }

            const result = run(process.execPath, args, {cwd: example, env: environment});

            assert.equal(result.replace(/\r\n/g, '\n'), fs.readFileSync(path.join(example, 'output.txt'), 'utf8').replace(/\r\n/g, '\n').trim());
            fs.unlinkSync(notes);
            const empty = run(process.execPath, args, {cwd: example, env: environment});

            assert.equal(empty.replace(/\r\n/g, '\n'), fs.readFileSync(path.join(example, 'empty.txt'), 'utf8').replace(/\r\n/g, '\n').trim());
            fs.writeFileSync(notes, 'PTP\n');
            const denied = spawnSync(process.execPath, args, {cwd: example, env: {...environment, PTP_PASSWORD: 'incorrect'}, encoding: 'utf8', windowsHide: true});

            assert.equal(denied.status, 1);
            assert.match(denied.stderr, /PTP request failed \(HTTP 401\)/);
            assert.ok(!denied.stderr.includes('fixture-password'));
            console.log(extension + ': listing, empty directory, failure and downloadable source verified');
        }
    } finally {
        await stop(server?.child);
        cleanup(temporary);
    }

    console.log('TypeScript example checked. Verified ' + htmlLinks() + ' rendered local links/assets, including anchors and downloads.');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
