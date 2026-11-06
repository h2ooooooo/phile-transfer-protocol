const assert = require('node:assert/strict');
const {test} = require('node:test');
const {resolveReleaseBaseUrl} = require('./release-urls.cjs');

const defaultUrl = 'https://h2ooooooo.github.io/phile-transfer-protocol';

test('default artifact URLs retain the GitHub Pages project prefix', () => {
    const baseUrl = resolveReleaseBaseUrl(defaultUrl);

    assert.equal(baseUrl + '/releases/0.3.0/manifest.json', defaultUrl + '/releases/0.3.0/manifest.json');
    assert.equal(resolveReleaseBaseUrl(defaultUrl, ''), defaultUrl);
});

test('the deployed documentation URL overrides the default and normalizes trailing slashes', () => {
    assert.equal(resolveReleaseBaseUrl(defaultUrl, 'https://fork.github.io/new-name/'), 'https://fork.github.io/new-name');
    assert.equal(resolveReleaseBaseUrl(defaultUrl, 'https://docs.example.org/'), 'https://docs.example.org');
    assert.equal(resolveReleaseBaseUrl(defaultUrl, 'https://docs.example.org/ptp///'), 'https://docs.example.org/ptp');
});

test('invalid deployment URLs fail without disclosing embedded credentials', () => {
    for (const url of [
        'not-a-url',
        'http://docs.example.org/',
        'file:///private/docs',
        'https://operator:private-password@docs.example.org/',
        'https://docs.example.org/?preview=true',
        'https://docs.example.org/#preview',
        'https://docs.example.org/?',
        'https://docs.example.org/#',
    ]) {
        assert.throws(() => resolveReleaseBaseUrl(defaultUrl, url), error => {
            assert.match(error.message, /must use HTTPS/);
            assert.equal(error.message.includes('private-password'), false);

            return true;
        });
    }
});
