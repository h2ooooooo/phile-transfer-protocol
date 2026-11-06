const assert = require('node:assert/strict');
const {test} = require('node:test');
const {FolderSelection} = require('./assets/folder-access.js');

test('selecting a parent includes unloaded and future descendants', () => {
    const selection = new FolderSelection({'/': false});

    selection.toggle('/plugins', true);
    assert.equal(selection.allowed('/plugins/new-plugin/future/file.php'), true);
    assert.equal(selection.allowed('/uploads/file.png'), false);
    assert.equal(selection.mixed('/'), true);
});

test('excluding a child retains selected siblings', () => {
    const selection = new FolderSelection({'/': true});

    selection.toggle('/plugins/private', false);
    assert.equal(selection.allowed('/plugins/private/file.php'), false);
    assert.equal(selection.allowed('/plugins/public/file.php'), true);
    assert.equal(selection.mixed('/plugins'), true);
});

test('selecting a parent again clears every child override', () => {
    const selection = new FolderSelection({'/': true, '/plugins/private': false, '/plugins/private/allowed': true});

    selection.toggle('/plugins', true);
    assert.equal(selection.allowed('/plugins/private/file.php'), true);
    assert.equal(selection.mixed('/plugins'), false);
    assert.deepEqual(selection.rules, {'/': true, '/plugins': true});
});

test('root checkbox clears the entire subtree', () => {
    const selection = new FolderSelection({'/': false, '/plugins': true, '/uploads': true});

    selection.toggle('/', false);
    assert.deepEqual(selection.rules, {'/': false});
    selection.toggle('/', true);
    assert.equal(selection.allowed('/any/future/folder'), true);
});

test('rule boundaries keep similarly named folders separate', () => {
    const selection = new FolderSelection({'/': false, '/plugins': true});

    assert.equal(selection.allowed('/plugins-backup/file.php'), false);
});

test('individual file exclusions retain other files in the selected folder', () => {
    const selection = new FolderSelection({'/': true});

    selection.toggle('/plugins/example/plugin.php', false);
    assert.equal(selection.allowed('/plugins/example/plugin.php'), false);
    assert.equal(selection.allowed('/plugins/example/other.php'), true);
    assert.equal(selection.mixed('/plugins/example'), true);
    selection.toggle('/plugins/example', true);
    assert.equal(selection.allowed('/plugins/example/plugin.php'), true);
});

test('cancel restores the saved rules without mutating them', () => {
    const saved = {'/': false, '/plugins': true};
    let selection = new FolderSelection(saved);

    selection.toggle('/', true);
    selection = new FolderSelection(saved);
    assert.equal(selection.allowed('/uploads'), false);
    assert.deepEqual(saved, {'/': false, '/plugins': true});
});

test('Windows paths match folder rules without case sensitivity', () => {
    const selection = new FolderSelection({'/': false}, true);

    selection.toggle('/Plugins', true);
    assert.equal(selection.allowed('/plugins/Example'), true);
    assert.equal(selection.mixed('/'), true);
});
