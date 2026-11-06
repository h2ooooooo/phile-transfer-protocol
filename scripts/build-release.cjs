const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {phpBinary} = require('./php-runtime.cjs');
const {resolveReleaseBaseUrl} = require('./release-urls.cjs');

const root = path.resolve(__dirname, '..');
const release = require('../release.json');
const baseUrl = resolveReleaseBaseUrl(release.baseUrl, process.env.DOCS_URL);
const client = require('../ptp-client/package.json');
const output = path.join(root, 'releases', release.version);
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');

fs.mkdirSync(path.join(root, 'tmp'), {recursive: true});
fs.mkdirSync(output, {recursive: true});
const temporary = fs.mkdtempSync(path.join(root, 'tmp/release-'));

function run(command, args, cwd = root) {
    const result = spawnSync(command, args, {cwd, encoding: 'utf8', windowsHide: true, env: {...process.env, XDEBUG_MODE: 'off'}});

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || result.error?.message || 'Release command failed');
    }

    return result.stdout.trim();
}

function filesIn(directory) {
    const files = [];

    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const target = path.join(directory, entry.name);

        if (entry.isSymbolicLink()) {
            throw new Error('Release trees must not contain symlinks: ' + target);
        }

        if (entry.isDirectory()) {
            files.push(...filesIn(target));
        } else {
            files.push(target);
        }
    }

    return files.sort();
}

function zip(php, name, directory) {
    const specification = path.join(temporary, name + '.json');
    const destination = path.join(output, name + '.zip');

    fs.writeFileSync(specification, JSON.stringify({output: destination, files: filesIn(directory).map(source => ({source, name: path.relative(directory, source).replace(/\\/g, '/')}))}));
    run(php, [path.join(root, 'scripts/zip-release.php'), specification]);

    return destination;
}

function write(directory, name, contents) {
    const destination = path.join(directory, name);

    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, contents);
}

function copy(directory, source, name = source) {
    const destination = path.join(directory, name);

    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(path.join(root, source), destination);
}

try {
    if (client.version !== release.version || !/^\d+\.\d+\.\d+$/.test(release.version)) {
        throw new Error('Client version and release.json must agree on a stable semantic version.');
    }

    const pluginHeader = fs.readFileSync(path.join(root, 'ptp-wordpress/ptp-wordpress.php'), 'utf8');

    if (!pluginHeader.includes('Version: ' + release.version)) {
        throw new Error('WordPress plugin version must match release.json.');
    }

    const php = phpBinary();

    run(process.execPath, [npm, '--prefix', 'ptp-client', 'run', 'build']);
    run(process.execPath, ['node_modules/sass/sass.js', 'ptp-wordpress/assets/folder-access.scss', 'ptp-wordpress/assets/folder-access.css', '--no-source-map']);
    run(php, [path.join(root, 'ptp-wordpress/build.php')]);

    // npm includes the production dependency closure, preserving tested transitive overrides.
    const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary], path.join(root, 'ptp-client')));
    const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];

    if (!pack?.filename) {
        throw new Error('npm pack did not report a tarball filename.');
    }

    const tarball = path.join(output, 'ptp-client-' + release.version + '.tgz');

    fs.copyFileSync(path.join(temporary, pack.filename), tarball);
    const clientStage = path.join(temporary, 'client');

    fs.mkdirSync(clientStage);
    run('tar', ['-xzf', tarball, '-C', clientStage]);
    const clientZip = zip(php, 'ptp-client-' + release.version, path.join(clientStage, 'package'));

    const serverStage = path.join(temporary, 'server');
    const composer = JSON.parse(fs.readFileSync(path.join(root, 'composer.json'), 'utf8'));

    composer.version = release.version;
    delete composer.archive;
    write(serverStage, 'composer.json', JSON.stringify(composer, null, 4) + '\n');
    copy(serverStage, 'LICENSE');
    copy(serverStage, 'ptp-server/README.md', 'README.md');

    for (const source of filesIn(path.join(root, 'ptp-server/src'))) {
        const relative = path.relative(root, source);

        copy(serverStage, relative);
    }

    copy(serverStage, 'ptp-server/.env.example', 'ptp.env.example');
    copy(serverStage, 'ptp-server/examples/public/ptp-server.php', 'public/ptp-server.php');
    copy(serverStage, 'ptp-server/examples/composer/ptp-server.php', 'examples/composer/ptp-server.php');
    copy(serverStage, 'ptp-server/examples/existing-site/ptp-server.php', 'examples/existing-site/ptp-server.php');
    const serverZip = zip(php, 'ptp-server-' + release.version, serverStage);
    const wordpressZip = path.join(output, 'ptp-wordpress-' + release.version + '.zip');

    fs.copyFileSync(path.join(root, 'ptp-wordpress/dist/ptp-wordpress.zip'), wordpressZip);

    const manifest = {
        schemaVersion: 1,
        version: release.version,
        published: release.published,
        baseUrl,
        requirements: {node: '>=22.13.0', php: '>=8.2', phpExtensions: ['json', 'openssl'], wordpress: '>=5.6'},
        artifacts: [tarball, clientZip, serverZip, wordpressZip].map(file => ({
            name: path.basename(file),
            path: '/releases/' + release.version + '/' + path.basename(file),
            url: baseUrl + '/releases/' + release.version + '/' + path.basename(file),
            bytes: fs.statSync(file).size,
            sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        })),
    };

    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'SHA256SUMS'), manifest.artifacts.map(artifact => artifact.sha256 + '  ' + artifact.name).join('\n') + '\n');
    const publicReleases = path.join(root, 'docs/public/releases');

    fs.mkdirSync(publicReleases, {recursive: true});
    fs.cpSync(output, path.join(publicReleases, release.version), {recursive: true});
    fs.writeFileSync(path.join(publicReleases, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.cpSync(path.join(root, 'docs/examples/api-list'), path.join(root, 'docs/public/examples/api-list'), {recursive: true});
    console.log('Prepared PTP ' + release.version + ' locally: ' + output);
    console.log('No publication, deployment, Git tags, or pushes were performed.');
} finally {
    const resolved = path.resolve(temporary);

    if (path.dirname(resolved) !== path.join(root, 'tmp') || !path.basename(resolved).startsWith('release-')) {
        throw new Error('Unexpected release staging path');
    }

    fs.rmSync(resolved, {recursive: true, force: true});
}
