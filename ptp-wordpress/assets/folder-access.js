class FolderSelection {
    constructor(rules, caseInsensitive = false) {
        this.caseInsensitive = caseInsensitive;
        this.rules = {...rules};
    }

    normalize(path) {
        let normalized = '/' + path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');

        if (this.caseInsensitive) {
            normalized = normalized.toLowerCase();
        }

        return normalized;
    }

    isDescendant(path, parent) {
        if (parent === '/') {
            return path !== '/';
        }

        return path.startsWith(parent + '/');
    }

    allowed(path) {
        let current = this.normalize(path);

        while (current !== '/') {
            if (Object.hasOwn(this.rules, current)) {
                return this.rules[current];
            }

            current = current.slice(0, current.lastIndexOf('/')) || '/';
        }

        return this.rules['/'] === true;
    }

    mixed(path) {
        const normalized = this.normalize(path);
        const allowed = this.allowed(normalized);

        return Object.entries(this.rules).some(([child, value]) => this.isDescendant(child, normalized) && value !== allowed);
    }

    toggle(path, allowed) {
        const normalized = this.normalize(path);

        for (const child of Object.keys(this.rules)) {
            if (child === normalized || this.isDescendant(child, normalized)) {
                delete this.rules[child];
            }
        }

        this.rules[normalized] = allowed;
    }
}

class PtpFolderAccess {
    constructor(config) {
        this.config = config;
        this.root = config.root;
        this.selection = new FolderSelection(config.rules, config.caseInsensitive);
        this.generation = 0;
        this.nodeId = 0;
        this.checkboxes = new Map();
        this.tree = document.getElementById('ptp-folder-tree');
        this.status = document.getElementById('ptp-folder-status');
        this.rootInput = document.getElementById('ptp-root-path');
        this.rootPreset = document.getElementById('ptp-root-preset');
        this.rulesInput = document.getElementById('ptp-access-rules');
        this.saveButton = document.getElementById('ptp-save-folders');
        this.presets = Array.from(document.querySelectorAll('[data-ptp-preset]'));

        this.rootPreset.addEventListener('change', () => {
            if (this.rootPreset.value) {
                this.rootInput.value = this.rootPreset.value;
                this.changeRoot(this.rootInput.value);
            } else {
                this.rootInput.focus();
            }
        });
        this.rootInput.addEventListener('input', () => {
            this.generation++;
            this.saveButton.disabled = true;
            this.rootPreset.value = '';
            this.status.textContent = 'Click Browse root to validate this path before saving.';
        });
        document.getElementById('ptp-browse-root').addEventListener('click', () => this.changeRoot(this.rootInput.value));
        document.getElementById('ptp-cancel-folders').addEventListener('click', () => {
            this.root = this.config.root;
            this.rootInput.value = this.root;
            this.selection = new FolderSelection(this.config.rules, this.config.caseInsensitive);
            this.renderTree();
            this.status.textContent = 'Changes cancelled. The saved folder selection is restored.';
        });

        for (const checkbox of this.presets) {
            checkbox.addEventListener('change', () => {
                const path = this.presetPath(checkbox.dataset.ptpPreset);

                if (path !== null) {
                    this.selection.toggle(path, this.selection.mixed(path) || checkbox.checked);
                    this.refresh();
                    this.status.textContent = 'Unsaved folder changes. Save folder access to apply them.';
                }
            });
        }

        this.renderTree();
    }

    absolute(path) {
        let normalized = path.replace(/\\/g, '/').replace(/\/$/, '');

        if (this.config.caseInsensitive) {
            normalized = normalized.toLowerCase();
        }

        return normalized;
    }

    presetPath(label) {
        const preset = this.config.roots.find(root => root.label === label);

        if (!preset) {
            return null;
        }

        const root = this.absolute(this.root);
        const path = this.absolute(preset.path);

        if (path === root) {
            return '/';
        }

        if (!path.startsWith(root + '/')) {
            return null;
        }

        return path.slice(root.length);
    }

    async request(path, offset = 0) {
        const body = new URLSearchParams({
            action: 'ptp_browse_folders',
            nonce: this.config.nonce,
            root: this.root,
            path,
            offset: String(offset),
        });
        const response = await fetch(this.config.ajaxUrl, {method: 'POST', body, credentials: 'same-origin'});
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.data?.message || 'Could not browse this folder. Check the root path and try again.');
        }

        return result.data;
    }

    async changeRoot(root) {
        const previousRoot = this.root;

        this.root = root.trim();
        const generation = ++this.generation;

        this.saveButton.disabled = true;
        this.status.textContent = 'Checking the FTP root…';
        this.tree.replaceChildren();
        this.checkboxes.clear();

        for (const checkbox of this.presets) {
            checkbox.disabled = true;
        }

        try {
            const result = await this.request('/');

            if (generation !== this.generation) {
                return;
            }

            this.root = result.root;
            this.rootInput.value = this.root;

            if (this.absolute(previousRoot) !== this.absolute(this.root)) {
                this.selection = new FolderSelection({'/': false}, this.config.caseInsensitive);
            }

            this.renderTree(result);
            this.status.textContent = 'Root loaded. Select folders, then save folder access to apply your changes.';
        } catch (error) {
            if (generation === this.generation) {
                this.root = previousRoot;
                this.status.textContent = error.message;
            }
        }
    }

    renderTree(initialPage = null) {
        this.generation++;
        this.tree.replaceChildren();
        this.checkboxes.clear();
        this.rootPreset.value = this.config.roots.find(root => this.absolute(root.path) === this.absolute(this.root))?.path || '';
        const node = this.directory('/', 'FTP root');

        this.tree.append(node.item);
        this.saveButton.disabled = false;
        this.refresh();

        if (initialPage) {
            this.appendEntries(node, initialPage, this.generation);
        }
    }

    refresh() {
        for (const [path, controls] of this.checkboxes) {
            const allowed = this.selection.allowed(path);
            const mixed = this.selection.mixed(path);

            controls.checkbox.checked = allowed;
            controls.checkbox.indeterminate = mixed;
            controls.state.textContent = 'Excluded';

            if (mixed) {
                controls.state.textContent = 'Some selected';
            } else if (allowed) {
                controls.state.textContent = 'Included';
            }
        }

        for (const checkbox of this.presets) {
            const path = this.presetPath(checkbox.dataset.ptpPreset);

            checkbox.disabled = path === null;
            checkbox.checked = path !== null && this.selection.allowed(path);
            checkbox.indeterminate = path !== null && this.selection.mixed(path);
        }

        this.rulesInput.value = JSON.stringify(this.selection.rules);
    }

    selectionControls(path, name) {
        const checkbox = document.createElement('input');
        const state = document.createElement('span');

        checkbox.type = 'checkbox';
        checkbox.setAttribute('aria-label', name);
        state.className = 'ptp-folder-state';
        this.checkboxes.set(this.selection.normalize(path), {checkbox, state});
        checkbox.addEventListener('change', () => {
            this.selection.toggle(path, this.selection.mixed(path) || checkbox.checked);
            this.refresh();
            this.status.textContent = 'Unsaved access changes. Save folder access to apply them.';
        });

        return {checkbox, state};
    }

    icon(type) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('ptp-entry-icon');
        shape.setAttribute('stroke-width', '1.5');
        shape.setAttribute('stroke-linejoin', 'round');

        if (type === 'file') {
            shape.setAttribute('d', 'M6 2h8l4 4v16H6z M14 2v5h4');
            shape.setAttribute('fill', '#fff');
            shape.setAttribute('stroke', '#6b7785');
        } else {
            shape.setAttribute('d', 'M2 6V4h6l2 2h12v13H2z');
            shape.setAttribute('fill', '#f6d576');
            shape.setAttribute('stroke', '#a67c00');

            if (type === 'folder-open') {
                shape.setAttribute('d', 'M2 6V4h6l2 2h12v4H2z M2 9h21l-4 10H2z');
            }
        }

        svg.append(shape);

        return svg;
    }

    toggleDirectory(node) {
        node.children.hidden = !node.children.hidden;
        const expanded = !node.children.hidden;

        node.expand.textContent = expanded ? '-' : '+';
        node.expand.setAttribute('aria-expanded', String(expanded));
        node.nameButton.setAttribute('aria-expanded', String(expanded));
        node.icon.replaceWith(this.icon(expanded ? 'folder-open' : 'folder'));
        node.icon = node.nameButton.querySelector('svg');

        if (expanded && !node.loaded) {
            this.loadChildren(node);
        }
    }

    directory(path, name, expanded = false) {
        const item = document.createElement('li');
        const row = document.createElement('div');

        row.className = 'ptp-folder-row';
        const expand = document.createElement('button');

        expand.type = 'button';
        expand.className = 'ptp-expand';
        expand.textContent = expanded ? '-' : '+';
        expand.setAttribute('aria-expanded', String(expanded));
        expand.setAttribute('aria-label', 'Expand or collapse ' + name);
        const controls = this.selectionControls(path, name);
        const nameButton = document.createElement('button');

        nameButton.type = 'button';
        nameButton.className = 'ptp-entry-name';
        nameButton.setAttribute('aria-expanded', String(expanded));
        const icon = this.icon(expanded ? 'folder-open' : 'folder');
        const caption = document.createElement('span');

        caption.textContent = name;
        nameButton.append(icon, caption);
        const children = document.createElement('ul');

        children.hidden = !expanded;
        children.id = 'ptp-folder-children-' + ++this.nodeId;
        expand.setAttribute('aria-controls', children.id);
        nameButton.setAttribute('aria-controls', children.id);
        const node = {item, children, expand, nameButton, icon, path, loaded: false};

        row.append(controls.checkbox, expand, nameButton, controls.state);
        item.append(row, children);

        expand.addEventListener('click', () => this.toggleDirectory(node));
        nameButton.addEventListener('click', () => this.toggleDirectory(node));

        return node;
    }

    file(path, name) {
        const item = document.createElement('li');
        const row = document.createElement('div');

        row.className = 'ptp-folder-row ptp-file-row';
        const controls = this.selectionControls(path, name);
        const spacer = document.createElement('span');
        const label = document.createElement('label');

        label.className = 'ptp-entry-name';
        controls.checkbox.id = 'ptp-file-access-' + ++this.nodeId;
        label.htmlFor = controls.checkbox.id;
        const caption = document.createElement('span');

        caption.textContent = name;
        label.append(this.icon('file'), caption);
        row.append(controls.checkbox, spacer, label, controls.state);
        item.append(row);

        return item;
    }

    async loadChildren(node, offset = 0) {
        const generation = this.generation;

        node.expand.disabled = true;
        node.nameButton.disabled = true;
        const message = document.createElement('li');

        message.className = 'ptp-tree-message';
        message.textContent = 'Loading folder…';
        node.children.append(message);

        try {
            const result = await this.request(node.path, offset);

            if (generation === this.generation) {
                message.remove();
                this.appendEntries(node, result, generation);
            }
        } catch (error) {
            if (generation === this.generation) {
                message.replaceChildren(document.createTextNode(error.message + ' '));
                const retry = document.createElement('button');

                retry.type = 'button';
                retry.className = 'button';
                retry.textContent = 'Retry';
                retry.addEventListener('click', () => {
                    message.remove();
                    this.loadChildren(node, offset);
                });
                message.append(retry);
            }
        } finally {
            node.expand.disabled = false;
            node.nameButton.disabled = false;
        }
    }

    appendEntries(node, result, generation) {
        if (generation !== this.generation) {
            return;
        }

        node.loaded = true;

        for (const entry of result.entries) {
            if (entry.isDirectory) {
                node.children.append(this.directory(entry.path, entry.name).item);
            } else {
                node.children.append(this.file(entry.path, entry.name));
            }
        }

        if (result.entries.length === 0 && node.children.childElementCount === 0) {
            const empty = document.createElement('li');

            empty.className = 'ptp-tree-message';
            empty.textContent = 'This folder is empty.';
            node.children.append(empty);
        }

        if (result.nextOffset !== null) {
            const item = document.createElement('li');
            const more = document.createElement('button');

            more.type = 'button';
            more.className = 'button';
            more.textContent = 'Load more entries';
            more.addEventListener('click', () => {
                item.remove();
                this.loadChildren(node, result.nextOffset);
            });
            item.append(more);
            node.children.append(item);
        }

        this.refresh();
    }
}

if (typeof module !== 'undefined') {
    module.exports = {FolderSelection};
}

if (typeof document !== 'undefined') {
    const config = document.getElementById('ptp-folder-config');

    if (config) {
        new PtpFolderAccess(JSON.parse(config.textContent));
    }
}
