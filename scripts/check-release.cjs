const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createRequire} = require('node:module');
const {createHash} = require('node:crypto');
const {root, run, phpBinary, fixture, cleanup, freePort, isolatedEnvironment, startPhp, stop} = require('./test-support.cjs');
const {checkApiContract} = require('./api-contract.cjs');
const release = require('../release.json');
const manifest = require('../releases/' + release.version + '/manifest.json');
const temporary = fixture();
const php = phpBinary();
let phpServer;
let clientProcess;

function extract(name, target) {
    fs.mkdirSync(target, {recursive: true});
    run(php, [path.join(root, 'scripts/extract-release.php'), path.join(root, 'releases', release.version, name), target]);
}

async function main() {
    for (const artifact of manifest.artifacts) {
        const file = path.join(root, 'releases', release.version, artifact.name);

        assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), artifact.sha256);
        assert.equal(fs.statSync(file).size, artifact.bytes);
    }

    const installed = path.join(temporary, 'consumer');

    fs.mkdirSync(installed);
    fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"ptp-clean-consumer","private":true}');
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const tarball = path.join(root, 'releases', release.version, 'ptp-client-' + release.version + '.tgz');

    run(process.execPath, [npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {cwd: installed});
    const executableVersion = run(process.execPath, [npm, 'exec', '--offline', '--', 'ptp', '--version'], {cwd: installed});

    assert.equal(executableVersion, release.version);
    const packageRoot = path.join(installed, 'node_modules/@jalsoedesign/phile-transfer-protocol-client');

    assert.match(run(process.execPath, [path.join(packageRoot, 'dist/index.js'), '--help'], {cwd: temporary}), /Usage: ptp <config.yaml>/);
    assert.equal(fs.existsSync(path.join(packageRoot, 'dist/tests')), false);
    assert.equal(fs.existsSync(path.join(packageRoot, 'config')), false);
    const packageRequire = createRequire(path.join(packageRoot, 'package.json'));

    assert.equal(typeof packageRequire('@electerm/ftp-srv'), 'function');

    for (const obsolete of ['ftp-srv', 'bunyan', '@types/bunyan']) {
        assert.throws(() => packageRequire.resolve(obsolete), {code: 'MODULE_NOT_FOUND'});
    }

    const clientZip = path.join(temporary, 'client-zip');

    extract('ptp-client-' + release.version + '.zip', clientZip);
    assert.equal(run(process.execPath, [path.join(clientZip, 'dist/index.js'), '--version']), release.version);
    const port = await freePort();
    const config = path.join(temporary, 'site.yaml');

    fs.writeFileSync(config, 'host: 127.0.0.1\nport: ' + port + '\napiUsername: fixture\napiPassword: fixture\napiEndPoint: https://example.invalid/ptp\n');
    clientProcess = spawn(process.execPath, [path.join(clientZip, 'dist/index.js'), config], {cwd: temporary, env: isolatedEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Packed client did not start')), 15000);

        clientProcess.once('exit', code => {
            clearTimeout(timeout);
            reject(new Error('Packed client exited with ' + code));
        });
        clientProcess.stdout.on('data', data => {
            if (data.toString().includes('FTP Server started at')) {
                clearTimeout(timeout);
                resolve();
            }
        });
    });
    await stop(clientProcess);
    clientProcess = null;

    const server = path.join(temporary, 'server');

    extract('ptp-server-' + release.version + '.zip', server);
    assert.equal(fs.existsSync(path.join(server, 'ptp.env')), false);
    phpServer = await startPhp(path.join(server, 'public'));
    assert.equal((await fetch(phpServer.origin + '/ptp-server.php?action=hello')).status, 503);
    await stop(phpServer.child);
    phpServer = null;
    const served = path.join(temporary, 'served');

    fs.mkdirSync(served);
    fs.writeFileSync(path.join(server, 'ptp.env'), 'PTP_USERNAME=test\nPTP_PASSWORD=test\nPTP_ROOT_PATH=' + served.replace(/\\/g, '/') + '\n');
    phpServer = await startPhp(path.join(server, 'public'));
    assert.equal(await (await fetch(phpServer.origin + '/ptp-server.php?action=hello')).text(), 'hi');
    const checks = await checkApiContract(phpServer.origin + '/ptp-server.php', 'Basic ' + Buffer.from('test:test').toString('base64'));
    const {encryptRequest} = require(path.join(packageRoot, 'dist/src/util/encryptedRequest.js'));
    const encryptedListing = await fetch(phpServer.origin + '/ptp-server.php', {
        method: 'POST',
        headers: {Authorization: 'Basic ' + Buffer.from('test:test').toString('base64'), 'Content-Type': 'application/json', 'X-PTP-Transport': 'encrypted-v1'},
        body: JSON.stringify(encryptRequest('GET', {action: 'list', path: '/'}, Buffer.alloc(0), 'test')),
    });

    assert.equal(encryptedListing.status, 200);
    assert.equal((await encryptedListing.json()).success, true);

    assert.equal((await fetch(phpServer.origin + '/ptp.env')).status, 404);
    fs.writeFileSync(path.join(server, 'ptp.env'), 'PTP_USERNAME=test\nPTP_PASSWORD=test\nPTP_ROOT_PATH=' + server.replace(/\\/g, '/') + '\n');

    for (const protectedPath of ['/public/ptp-server.php', '/ptp.env']) {
        const protectedUrl = new URL(phpServer.origin + '/ptp-server.php');

        protectedUrl.searchParams.set('action', 'read');
        protectedUrl.searchParams.set('path', protectedPath);
        const protectedResponse = await fetch(protectedUrl, {headers: {Authorization: 'Basic ' + Buffer.from('test:test').toString('base64')}});

        assert.equal(protectedResponse.status, 401);
    }

    await stop(phpServer.child);
    phpServer = null;

    // Install the prepared PHP artifact as a real dependency with registry access disabled.
    const artifacts = path.join(temporary, 'composer-artifacts');
    const application = path.join(temporary, 'composer-app');

    fs.mkdirSync(artifacts);
    fs.mkdirSync(application);
    fs.copyFileSync(path.join(root, 'releases', release.version, 'ptp-server-' + release.version + '.zip'), path.join(artifacts, 'server.zip'));
    fs.writeFileSync(path.join(application, 'composer.json'), JSON.stringify({
        name: 'ptp/installation-check',
        require: {'jalsoedesign/phile-transfer-protocol-server': release.version},
        repositories: [{type: 'artifact', url: artifacts.replace(/\\/g, '/')}, {'packagist.org': false}],
    }));
    const composerEnvironment = {...process.env, COMPOSER_DISABLE_NETWORK: '1'};
    const pathVariable = Object.keys(composerEnvironment).find(name => name.toUpperCase() === 'PATH') || 'PATH';

    // Composer launchers must use the same compatible PHP selected for this check.
    composerEnvironment[pathVariable] = path.dirname(php) + path.delimiter + (composerEnvironment[pathVariable] || '');
    run('composer install --no-interaction --no-plugins --no-scripts --no-dev --prefer-dist', [], {
        cwd: application,
        shell: true,
        env: composerEnvironment,
    });
    fs.mkdirSync(path.join(application, 'public'));
    fs.copyFileSync(path.join(server, 'examples/composer/ptp-server.php'), path.join(application, 'public/ptp-server.php'));
    fs.copyFileSync(path.join(server, 'ptp.env'), path.join(application, 'ptp.env'));
    phpServer = await startPhp(path.join(application, 'public'));
    assert.equal(await (await fetch(phpServer.origin + '/ptp-server.php?action=hello')).text(), 'hi');
    await stop(phpServer.child);
    phpServer = null;

    const wordpress = path.join(temporary, 'wordpress');

    extract('ptp-wordpress-' + release.version + '.zip', wordpress);
    const adapter = run(php, [path.join(root, 'ptp-wordpress/test.php'), path.join(wordpress, 'ptp-wordpress')]);

    assert.match(adapter, /Passed \d+ adapter checks/);
    console.log('Verified release checksums, clean npm bin installation, compiled ZIP startup, bundled FTP dependencies, Composer artifact autoloading, ' + checks + ' PHP HTTP checks, and ' + adapter.trim());
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    await stop(clientProcess);
    await stop(phpServer?.child);
    cleanup(temporary);
});
