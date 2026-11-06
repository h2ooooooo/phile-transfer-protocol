<script setup lang="ts">
import {computed, ref} from 'vue';
import {
    ArrowDownToLine,
    ArrowUpRight,
    Cable,
    Check,
    Copy,
    Download,
    FileCode2,
    FolderInput,
    KeyRound,
    Pencil,
    Play,
    Plus,
    Radio,
    Square,
    Trash2,
    X,
} from '@lucide/vue';
import {useDesktop} from './composables/useDesktop';
import ConnectionForm from './components/ConnectionForm.vue';
import ClientLog from './components/ClientLog.vue';
import DownloadsView from './components/DownloadsView.vue';
import type {Connection} from '../shared/types';

const {
    state,
    selectedId,
    view,
    editing,
    busy,
    error,
    notice,
    isPreview,
    draft,
    selected,
    status,
    runningCount,
    selectedLogs,
    request,
    select,
    edit,
    save,
    importYaml,
} = useDesktop();
const confirmingDelete = ref(false);
const copied = ref('');
const active = computed(() =>
    ['running', 'starting', 'stopping'].includes(status.value?.phase || ''),
);
const phase = computed(() => status.value?.phase || 'stopped');
const phaseLabel = computed(
    () =>
        ({
            running: 'Running',
            starting: 'Starting…',
            stopping: 'Stopping…',
            stopped: 'Stopped',
            error: 'Needs attention',
        })[phase.value],
);

function profilePhase(id: string): string {
    return state.value.bridges.find((bridge) => bridge.profileId === id)?.phase || 'stopped';
}

async function copy(value: string, field: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
        copied.value = field;
        setTimeout(() => (copied.value = ''), 1800);
    } catch {
        error.value = 'Clipboard access failed. Select and copy the displayed value instead.';
    }
}

async function test(): Promise<void> {
    const result = await request<string>('test', selectedId.value);

    if (result) {
        notice.value = result;
    }
}

async function download(kind: string): Promise<void> {
    const path = await request<string | null>('download', kind);

    if (path) {
        notice.value = 'Verified ZIP saved to ' + path;
    }
}

async function remove(): Promise<void> {
    await request('remove', selectedId.value);
    confirmingDelete.value = false;
}

async function copyPassword(): Promise<void> {
    await request('copyPassword', selectedId.value);

    if (!error.value) {
        notice.value =
            'Password copied. Paste it into the FTP editor. Your clipboard now contains the password.';
    }
}

function showProfile(profile: Connection): void {
    confirmingDelete.value = false;
    select(profile.id);
}
</script>

<template>
    <div class="desktop-shell">
        <aside class="sidebar" aria-label="PTP navigation">
            <a
                href="#"
                class="brand"
                aria-label="PTP connections"
                @click.prevent="view = 'connections'"
                ><span class="brand-mark"><FileCode2 :size="25" :stroke-width="1.6" /></span
                ><strong>PTP</strong><span class="version">0.3.0</span></a
            >
            <nav class="primary-navigation" aria-label="Main navigation">
                <button :class="{selected: view === 'connections'}" @click="view = 'connections'">
                    <Cable :size="19" /> Connections
                    <span class="nav-count">{{ state.profiles.length }}</span>
                </button>
                <button
                    :class="{selected: view === 'downloads'}"
                    @click="
                        view = 'downloads';
                        error = '';
                        notice = '';
                    "
                >
                    <Download :size="19" /> Downloads
                </button>
            </nav>
            <div class="saved-heading">
                <h2>Saved connections</h2>
                <button class="sidebar-icon" aria-label="Add connection" @click="edit()">
                    <Plus :size="18" />
                </button>
            </div>
            <div class="connection-list">
                <button
                    v-for="profile in state.profiles"
                    :key="profile.id"
                    class="saved-connection"
                    :class="{current: selectedId === profile.id && view === 'connections'}"
                    @click="showProfile(profile)"
                >
                    <span class="status-dot" :class="profilePhase(profile.id)"></span
                    ><span
                        ><strong>{{ profile.name }}</strong
                        ><small
                            >{{ profile.kind === 'wordpress' ? 'WordPress' : 'PHP endpoint' }}
                            <span>· {{ profile.port }}</span></small
                        ></span
                    >
                </button>
                <p v-if="!state.profiles.length" class="sidebar-empty">
                    Your saved connections will appear here.
                </p>
            </div>
            <button class="import-button" :disabled="Boolean(busy)" @click="importYaml">
                <FolderInput :size="17" /> Import YAML
            </button>
            <footer class="sidebar-footer">
                <span class="status-dot" :class="{running: runningCount > 0}"></span>
                <div>
                    <strong
                        >{{ runningCount }}
                        {{ runningCount === 1 ? 'bridge' : 'bridges' }} running</strong
                    ><small>Local FTP over remote HTTPS</small>
                </div>
            </footer>
        </aside>

        <div class="workspace">
            <header class="workspace-bar">
                <span
                    >{{ view === 'downloads' ? 'Downloads' : 'Connections'
                    }}<template v-if="selected && view === 'connections' && !editing"
                        ><span class="breadcrumb-divider">/</span>{{ selected.name }}</template
                    ></span
                ><span class="local-only"
                    ><KeyRound :size="14" /> Passwords encrypted on this host</span
                >
            </header>
            <main>
                <p v-if="isPreview" class="preview-banner">
                    Browser preview with synthetic examples. Start the Electron app with
                    <code>npm run dev</code> to use desktop actions.
                </p>
                <div v-if="error" class="feedback error-feedback" role="alert">
                    <div>
                        <strong>Could not complete the action</strong>
                        <p>{{ error }}</p>
                    </div>
                    <button class="icon-button" aria-label="Dismiss error" @click="error = ''">
                        <X :size="17" />
                    </button>
                </div>
                <div v-if="notice" class="feedback success-feedback" role="status">
                    <p>{{ notice }}</p>
                    <button class="icon-button" aria-label="Dismiss message" @click="notice = ''">
                        <X :size="17" />
                    </button>
                </div>

                <DownloadsView
                    v-if="view === 'downloads'"
                    :release="state.release"
                    :busy="busy"
                    @refresh="request('refresh')"
                    @download="download"
                />
                <ConnectionForm
                    v-else-if="editing"
                    :draft="draft"
                    :has-password="
                        Boolean(
                            state.profiles.find((profile) => profile.id === draft.id)?.hasPassword,
                        )
                    "
                    :busy="Boolean(busy)"
                    :secure-storage="state.secureStorage"
                    @save="save"
                    @cancel="
                        editing = false;
                        draft.password = '';
                    "
                />

                <section v-else-if="selected" class="connection-detail" :aria-label="selected.name">
                    <header class="section-heading connection-heading">
                        <div class="connection-title">
                            <div class="endpoint-icon"><Cable :size="25" /></div>
                            <div>
                                <h1>{{ selected.name }}</h1>
                                <p>
                                    {{
                                        selected.kind === 'wordpress'
                                            ? 'WordPress plugin'
                                            : 'Standalone PHP endpoint'
                                    }}
                                </p>
                            </div>
                        </div>
                        <div class="bridge-actions">
                            <span class="status-badge" :class="phase"
                                ><span class="status-dot" :class="phase"></span
                                >{{ phaseLabel }}</span
                            ><button
                                v-if="active"
                                class="button stop-button"
                                :disabled="Boolean(busy) || phase === 'stopping'"
                                @click="request('stop', selected.id)"
                            >
                                <Square :size="15" fill="currentColor" /> Stop bridge</button
                            ><button
                                v-else
                                class="button primary"
                                :disabled="Boolean(busy)"
                                @click="request('start', selected.id)"
                            >
                                <Play :size="16" fill="currentColor" /> Start bridge
                            </button>
                        </div>
                    </header>

                    <div v-if="status?.error" class="feedback error-feedback" role="alert">
                        <div>
                            <strong>Bridge could not run</strong>
                            <p>{{ status.error }}</p>
                        </div>
                    </div>
                    <div class="remote-summary">
                        <div>
                            <span>Remote endpoint</span>
                            <p>{{ selected.apiEndPoint }}</p>
                        </div>
                        <button class="text-button" :disabled="Boolean(busy)" @click="test">
                            <Radio :size="16" :class="{spinning: busy === 'test'}" />{{
                                busy === 'test' ? 'Testing access…' : 'Test access'
                            }}</button
                        ><button
                            class="icon-button"
                            :disabled="active || Boolean(busy)"
                            aria-label="Edit connection"
                            title="Stop this bridge before editing"
                            @click="edit(selected)"
                        >
                            <Pencil :size="17" />
                        </button>
                    </div>

                    <section class="ftp-details" aria-labelledby="ftp-heading">
                        <div class="ftp-heading">
                            <div>
                                <h2 id="ftp-heading">Connect your FTP editor</h2>
                                <p>Start the bridge, then use these local connection details.</p>
                            </div>
                            <ArrowUpRight :size="23" />
                        </div>
                        <dl>
                            <div
                                v-for="field in [
                                    {label: 'Host', value: selected.host},
                                    {label: 'Port', value: String(selected.port)},
                                    {label: 'Username', value: selected.apiUsername},
                                ]"
                                :key="field.label"
                            >
                                <dt>{{ field.label }}</dt>
                                <dd>
                                    <span>{{ field.value }}</span
                                    ><button
                                        class="icon-button"
                                        :aria-label="'Copy ' + field.label.toLowerCase()"
                                        @click="copy(field.value, field.label)"
                                    >
                                        <Check v-if="copied === field.label" :size="15" /><Copy
                                            v-else
                                            :size="15"
                                        />
                                    </button>
                                </dd>
                            </div>
                            <div>
                                <dt>Password</dt>
                                <dd>
                                    <span class="password-mask">••••••••••••</span
                                    ><button
                                        class="icon-button"
                                        aria-label="Copy saved password"
                                        @click="copyPassword"
                                    >
                                        <Copy :size="15" />
                                    </button>
                                </dd>
                            </div>
                        </dl>
                        <footer>
                            <span>Protocol <strong>FTP</strong></span
                            ><span>Encryption <strong>Plain FTP</strong></span
                            ><span>Transfer mode <strong>Passive</strong></span
                            ><span class="ftp-reassurance"
                                >Only on this host. Remote traffic uses HTTPS.</span
                            >
                        </footer>
                    </section>

                    <ClientLog :entries="selectedLogs" @clear="request('clearLogs', selected.id)" />
                    <footer class="connection-footer">
                        <p>
                            Multiple bridges can run together. Use a different local port for each.
                        </p>
                        <div v-if="confirmingDelete" class="delete-confirm">
                            <span>Delete this saved connection?</span
                            ><button
                                class="text-button danger"
                                :disabled="Boolean(busy)"
                                @click="remove"
                            >
                                Delete</button
                            ><button class="text-button" @click="confirmingDelete = false">
                                Cancel
                            </button>
                        </div>
                        <button
                            v-else
                            class="text-button danger"
                            :disabled="active || Boolean(busy)"
                            @click="confirmingDelete = true"
                        >
                            <Trash2 :size="14" /> Delete connection
                        </button>
                    </footer>
                </section>

                <section v-else class="empty-state">
                    <div class="empty-symbol"><Cable :size="44" :stroke-width="1.4" /></div>
                    <h1>Your websites, connected.</h1>
                    <p>
                        Bring a WordPress or PHP endpoint into your FTP editor. Add a connection,
                        start its bridge, and work with the tools you already use.
                    </p>
                    <div class="empty-actions">
                        <button class="button primary" @click="edit()">
                            <Plus :size="17" /> New connection</button
                        ><button
                            class="button secondary"
                            :disabled="Boolean(busy)"
                            @click="importYaml"
                        >
                            <FolderInput :size="17" /> Import YAML
                        </button>
                    </div>
                    <div class="empty-download">
                        <ArrowDownToLine :size="20" />
                        <div>
                            <strong>Need the remote endpoint first?</strong>
                            <p>Download the WordPress plugin or standalone PHP server.</p>
                        </div>
                        <button class="text-button" @click="view = 'downloads'">
                            Get downloads <ArrowUpRight :size="16" />
                        </button>
                    </div>
                </section>
            </main>
        </div>
    </div>
</template>

<style lang="scss">
.connection-heading {
    margin-bottom: 28px;

    .connection-title,
    .bridge-actions {
        display: flex;
        align-items: center;
        gap: 16px;
    }
}

.remote-summary {
    display: flex;
    align-items: center;
    gap: 18px;
    padding-bottom: 26px;

    > div {
        min-width: 0;
        flex: 1;
    }

    span {
        color: var(--muted);
        font-size: 12px;
    }

    p {
        margin: 5px 0 0;
        overflow-wrap: anywhere;
        font-size: 14px;
    }

    button {
        flex-shrink: 0;
    }
}

.ftp-details {
    padding: 22px 24px 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;

    .ftp-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;

        > svg {
            color: var(--green);
        }

        p {
            color: var(--muted);
            font-size: 13px;
            margin: 6px 0 0;
        }
    }

    dl {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 20px;
        margin: 26px 0 18px;
    }

    dt {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 5px;
    }

    dd {
        display: flex;
        align-items: center;
        gap: 5px;
        margin: 0;
        font:
            14px/1.4 Consolas,
            'SFMono-Regular',
            monospace;

        > span {
            overflow-wrap: anywhere;
            min-width: 0;
        }
    }

    .password-mask {
        letter-spacing: 1px;
        color: var(--muted);
    }

    footer {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 22px;
        padding: 14px 0;
        border-top: 1px solid var(--line);
        font-size: 12px;
        color: var(--muted);

        strong {
            margin-left: 6px;
            color: var(--ink);
            font-weight: 500;
        }
    }

    .ftp-reassurance {
        flex-basis: 100%;
    }
}

.connection-footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 20px;
    color: var(--muted);
    font-size: 12px;

    p {
        margin: 0;
    }
}

.delete-confirm {
    display: flex;
    align-items: center;
    gap: 12px;
}
</style>
