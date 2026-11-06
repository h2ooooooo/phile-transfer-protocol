const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CHECK_ORIGIN = 'https://docs.local';

function normalizedBase(base) {
    if (!base.startsWith('/') || !base.endsWith('/') || base.startsWith('//') || /[?#\\]/.test(base)) {
        throw new Error('DOCS_BASE must be a path with leading and trailing slashes.');
    }

    const normalized = new URL(base, CHECK_ORIGIN).pathname;

    if (normalized !== base) {
        throw new Error('DOCS_BASE must not contain dot segments.');
    }

    return base;
}

function htmlPages(directory) {
    const pages = [];

    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const target = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            pages.push(...htmlPages(target));
        } else if (entry.name.endsWith('.html')) {
            pages.push(target);
        }
    }

    return pages;
}

function checkRenderedLinks({built, base = '/'}) {
    if (!fs.existsSync(built)) {
        throw new Error('Build the docs before checking rendered links.');
    }

    const mount = normalizedBase(base);
    const failures = [];
    let checks = 0;

    for (const page of htmlPages(built)) {
        const pageName = path.relative(built, page).replace(/\\/g, '/');
        const pageUrl = new URL(mount + pageName, CHECK_ORIGIN);
        const html = fs.readFileSync(page, 'utf8');

        for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
            const href = match[1].replace(/&amp;/g, '&');
            const url = new URL(href, pageUrl);

            if (url.origin !== CHECK_ORIGIN) {
                continue;
            }

            if (!url.pathname.startsWith(mount)) {
                failures.push(pageName + ' links outside DOCS_BASE: ' + href);

                continue;
            }

            const relative = decodeURIComponent(url.pathname.slice(mount.length));
            let target = path.resolve(built, relative);
            const relativeTarget = path.relative(built, target);

            if (relativeTarget === '..' || relativeTarget.startsWith('..' + path.sep) || path.isAbsolute(relativeTarget)) {
                failures.push(pageName + ' links outside the built docs: ' + href);

                continue;
            }

            if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
                target = path.join(target, 'index.html');
            } else if (!path.extname(target) && !fs.existsSync(target)) {
                target += '.html';
            }

            if (!fs.existsSync(target)) {
                failures.push(pageName + ' links to missing ' + href);

                continue;
            }

            checks++;

            if (url.hash && target.endsWith('.html')) {
                const id = decodeURIComponent(url.hash.slice(1));
                const targetHtml = fs.readFileSync(target, 'utf8');

                if (!targetHtml.includes('id="' + id + '"')) {
                    failures.push(pageName + ' links to missing anchor ' + href);
                }
            }
        }
    }

    assert.deepEqual(failures, [], failures.join('\n'));

    return checks;
}

function checkReadmeLinks(root) {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const failures = [];

    for (const match of readme.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
        const href = match[1];

        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) {
            continue;
        }

        const relative = decodeURIComponent(href.split(/[?#]/, 1)[0]);

        if (!fs.existsSync(path.resolve(root, relative))) {
            failures.push('README.md links to missing ' + href);
        }
    }

    assert.deepEqual(failures, [], failures.join('\n'));
}

module.exports = {checkRenderedLinks, checkReadmeLinks};
