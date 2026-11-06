<script setup lang="ts">
import {Download, Package, RefreshCw, ShieldCheck} from '@lucide/vue';
import {ref} from 'vue';
import type {Release} from '../../shared/types';

defineProps<{release: Release | null; busy: string}>();
defineEmits<{download: [kind: string]; refresh: []}>();

const instructions = ref('');
const endpoints = [
    {
        kind: 'wordpress',
        title: 'WordPress plugin',
        description:
            'Manage access in WP Admin. Choose folders and set Read/Write or Read only permissions.',
        steps: [
            'In WordPress, open Plugins → Add New → Upload Plugin.',
            'Select the downloaded ZIP, install it, then activate PTP.',
            'Open Tools → PTP, choose folder access, enable PTP, then download the YAML.',
            'Create an Application Password in Users → Profile. Import the YAML into PTP and enter that password.',
        ],
    },
    {
        kind: 'server',
        title: 'Standalone PHP server',
        description:
            'Use an independent endpoint on PHP hosting. No WordPress or remote FTP service required.',
        steps: [
            'Extract the ZIP on the host. Copy ptp.env.example to ptp.env.',
            'Set PTP_USERNAME, PTP_PASSWORD, and the absolute remote PTP_ROOT_PATH.',
            'Upload the runtime and ptp.env outside the public web directory.',
            'Upload examples/existing-site/ptp-server.php into public_html. Adjust its two private filesystem paths.',
            'Serve the endpoint over HTTPS, then add its URL and credentials as a new connection.',
        ],
    },
];
</script>

<template>
    <section class="downloads-view">
        <header class="section-heading">
            <div>
                <h1>Set up the remote end</h1>
                <p>Choose the endpoint for your website. PTP stays on this host.</p>
            </div>
            <button class="button secondary" :disabled="Boolean(busy)" @click="$emit('refresh')">
                <RefreshCw :size="16" :class="{spinning: busy === 'refresh'}" />
                {{ busy === 'refresh' ? 'Checking…' : 'Check for releases' }}
            </button>
        </header>
        <div class="release-summary">
            <Package :size="20" />
            <div v-if="release">
                <strong>PTP {{ release.version }}</strong>
                <p>
                    {{
                        release.source === 'local'
                            ? 'Prepared local release. These downloads work before public hosting is published.'
                            : 'Published release from the PTP GitHub Pages site.'
                    }}
                </p>
            </div>
            <div v-else>
                <strong>No release loaded</strong>
                <p>
                    Run npm run release:build from the repository root and restart PTP, or check the
                    public release service.
                </p>
            </div>
            <span v-if="release" class="status-badge">{{
                release.source === 'local' ? 'Local files' : 'Published'
            }}</span>
        </div>
        <article v-for="endpoint in endpoints" :key="endpoint.kind" class="endpoint-download">
            <div class="download-intro">
                <div class="endpoint-icon"><Package :size="25" /></div>
                <div>
                    <h2>{{ endpoint.title }}</h2>
                    <p>{{ endpoint.description }}</p>
                </div>
            </div>
            <div class="download-actions">
                <button
                    class="button primary"
                    :disabled="!release || Boolean(busy)"
                    @click="$emit('download', endpoint.kind)"
                >
                    <Download :size="16" />
                    {{ busy === 'download' ? 'Saving ZIP…' : 'Download ZIP' }}
                </button>
                <button
                    class="text-button"
                    :aria-expanded="instructions === endpoint.kind"
                    @click="instructions = instructions === endpoint.kind ? '' : endpoint.kind"
                >
                    {{ instructions === endpoint.kind ? 'Hide setup steps' : 'How to install' }}
                </button>
            </div>
            <ol v-if="instructions === endpoint.kind" class="install-steps">
                <li v-for="step in endpoint.steps" :key="step">{{ step }}</li>
            </ol>
            <details v-if="release" class="checksum-details">
                <summary>File details and SHA-256</summary>
                <div
                    v-for="artifact in release.artifacts.filter((file) =>
                        file.name.startsWith('ptp-' + endpoint.kind + '-'),
                    )"
                    :key="artifact.name"
                >
                    <p>{{ artifact.name }} · {{ (artifact.bytes / 1024).toFixed(1) }} KiB</p>
                    <code>{{ artifact.sha256 }}</code>
                </div>
            </details>
        </article>
        <p class="download-note">
            <ShieldCheck :size="18" /> Every ZIP is checked against its release size and SHA-256
            before it is saved. Downloading does not install or change anything on the website.
        </p>
    </section>
</template>

<style lang="scss">
.downloads-view {
    max-width: 980px;

    .section-heading {
        flex-wrap: wrap;
    }

    .release-summary {
        display: flex;
        gap: 14px;
        align-items: center;
        margin: 30px 0 12px;
        padding: 20px;
        border-radius: 10px;
        background: var(--green-wash);
        color: var(--green-dark);

        p {
            margin: 4px 0 0;
            font-size: 13px;
        }

        > svg {
            flex-shrink: 0;
        }

        .status-badge {
            margin-left: auto;
        }
    }

    .endpoint-download {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 22px;
        padding: 30px 0;
        border-bottom: 1px solid var(--line);
    }

    .download-intro {
        display: flex;
        gap: 18px;

        p {
            max-width: 52ch;
            color: var(--muted);
            font-size: 14px;
            margin: 9px 0 0;
        }
    }

    .download-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .install-steps,
    .checksum-details {
        grid-column: 1 / -1;
        font-size: 14px;
        margin: 0;
    }

    .install-steps {
        padding-left: 24px;

        li {
            margin: 10px 0;
            padding-left: 5px;
        }
    }

    .checksum-details {
        color: var(--muted);

        summary {
            cursor: pointer;
        }

        code {
            overflow-wrap: anywhere;
        }
    }

    .download-note {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-top: 26px;
        color: var(--muted);
        font-size: 13px;

        svg {
            flex-shrink: 0;
        }
    }
}
</style>
