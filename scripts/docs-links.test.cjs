const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');
const {checkRenderedLinks, checkReadmeLinks} = require('./docs-links.cjs');

function fixture(context) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ptp-docs-links-'));

    context.after(() => {
        const resolved = path.resolve(directory);

        if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ptp-docs-links-')) {
            throw new Error('Unexpected docs checker fixture path');
        }

        fs.rmSync(resolved, {recursive: true, force: true});
    });

    return {
        directory,
        write(name, content) {
            const target = path.join(directory, name);

            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, content);
        },
    };
}

for (const base of ['/', '/phile-transfer-protocol/']) {
    test('validates pages, assets, directory indexes and anchors under ' + base, context => {
        const site = fixture(context);

        site.write('index.html', '<a href="' + base + 'acceptable-use.html#authorized">Terms</a><script src="' + base + 'assets/docs.js"></script><a href="' + base + 'guide/">Guide</a>');
        site.write('acceptable-use.html', '<h2 id="authorized">Authorized use</h2>');
        site.write('assets/docs.js', 'console.log(1);');
        site.write('guide/index.html', '<a href="../acceptable-use.html">Terms</a>');

        assert.equal(checkRenderedLinks({built: site.directory, base}), 4);
    });
}

test('validates escaped downloads and ignores external links', context => {
    const site = fixture(context);

    site.write('index.html', '<a href="/project/download%20file.zip?download=1&amp;source=docs">Download</a><a href="https://example.invalid/missing">External</a><a href="mailto:owner@example.invalid">Email</a>');
    site.write('download file.zip', 'fixture');

    assert.equal(checkRenderedLinks({built: site.directory, base: '/project/'}), 1);
});

test('rejects links that omit the project Pages base', context => {
    const site = fixture(context);

    site.write('index.html', '<script src="/assets/docs.js"></script>');
    site.write('assets/docs.js', 'fixture');

    assert.throws(() => checkRenderedLinks({built: site.directory, base: '/project/'}), /links outside DOCS_BASE/);
});

test('reports missing files and anchors', context => {
    const site = fixture(context);

    site.write('index.html', '<a href="missing.html">Missing page</a><a href="terms.html#missing">Missing anchor</a>');
    site.write('terms.html', '<h1 id="terms">Terms</h1>');

    assert.throws(() => checkRenderedLinks({built: site.directory}), error => {
        assert.match(error.message, /links to missing missing.html/);
        assert.match(error.message, /links to missing anchor terms.html#missing/);

        return true;
    });
});

test('rejects encoded paths that escape the built docs', context => {
    const site = fixture(context);

    site.write('index.html', '<a href="/project/..%2fprivate.txt">Outside</a>');

    assert.throws(() => checkRenderedLinks({built: site.directory, base: '/project/'}), /links outside the built docs/);
});

test('requires an unambiguous Pages base path', context => {
    const site = fixture(context);

    site.write('index.html', '<h1>Docs</h1>');

    for (const base of ['project/', '/project', '//example.invalid/', '/project/../', '/project/?query=1']) {
        assert.throws(() => checkRenderedLinks({built: site.directory, base}), /DOCS_BASE must/);
    }
});

test('checks repository README fallback links without requiring the future public host', context => {
    const repository = fixture(context);

    repository.write('README.md', '[Docs](https://example.invalid/docs/) [Terms source](docs/acceptable-use.md) [License](LICENSE)');
    repository.write('docs/acceptable-use.md', '# Terms');
    repository.write('LICENSE', 'MIT');
    checkReadmeLinks(repository.directory);
    repository.write('README.md', '[Missing terms](docs/missing-terms.md)');

    assert.throws(() => checkReadmeLinks(repository.directory), /README.md links to missing docs\/missing-terms.md/);
});
