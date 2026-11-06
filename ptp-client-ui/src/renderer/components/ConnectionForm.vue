<script setup lang="ts">
import {KeyRound, Save, X} from '@lucide/vue';
import type {ConnectionDraft} from '../../shared/types';

defineProps<{
    draft: ConnectionDraft;
    hasPassword: boolean;
    busy: boolean;
    secureStorage: boolean;
}>();
defineEmits<{save: []; cancel: []}>();
</script>

<template>
    <form class="connection-form" @submit.prevent="$emit('save')">
        <header class="section-heading">
            <div>
                <h1>{{ draft.id ? 'Edit connection' : 'New connection' }}</h1>
                <p>Connect your FTP editor to a WordPress or PHP endpoint.</p>
            </div>
            <button
                type="button"
                class="icon-button"
                aria-label="Cancel editing"
                @click="$emit('cancel')"
            >
                <X :size="20" />
            </button>
        </header>
        <div class="form-section">
            <h2>Remote endpoint</h2>
            <div class="field-grid">
                <label
                    >Connection name<input
                        v-model="draft.name"
                        required
                        maxlength="120"
                        placeholder="For example, company website"
                        autofocus
                /></label>
                <label
                    >Endpoint type<select v-model="draft.kind">
                        <option value="wordpress">WordPress plugin</option>
                        <option value="php">Standalone PHP</option>
                    </select></label
                >
                <label class="field-wide"
                    >API endpoint<input
                        v-model.trim="draft.apiEndPoint"
                        type="url"
                        required
                        placeholder="https://example.com/wp-json/ptp/v1/files"
                        spellcheck="false"
                    /><span
                        >Use the exact endpoint from WordPress or the uploaded PHP entry
                        point.</span
                    ></label
                >
                <label
                    >API username<input
                        v-model="draft.apiUsername"
                        required
                        autocomplete="off"
                        spellcheck="false"
                /></label>
                <label
                    >{{ draft.kind === 'wordpress' ? 'Application Password' : 'API password'
                    }}<input
                        v-model="draft.password"
                        type="password"
                        :required="!hasPassword"
                        autocomplete="new-password"
                        :placeholder="
                            hasPassword
                                ? 'Leave blank to keep the saved password'
                                : 'Enter the endpoint password'
                        "
                    /><span v-if="draft.kind === 'wordpress'"
                        >Use a WordPress Application Password, from Users → Profile.</span
                    ></label
                >
            </div>
        </div>
        <div class="form-section">
            <h2>Local FTP bridge</h2>
            <div class="field-grid">
                <label
                    >Host<input value="127.0.0.1" readonly /><span
                        >The bridge is accessible only on this host.</span
                    ></label
                >
                <label
                    >Port<input
                        v-model.number="draft.port"
                        type="number"
                        min="1024"
                        max="65535"
                        required
                    /><span>Choose a different port for each running bridge.</span></label
                >
            </div>
        </div>
        <p class="storage-note">
            <KeyRound :size="16" />
            {{
                secureStorage
                    ? 'Passwords are encrypted using the operating system. They are never exported to a YAML file.'
                    : 'OS password encryption is unavailable. Unlock the system keyring and restart PTP before saving.'
            }}
        </p>
        <footer class="form-actions">
            <button type="button" class="button secondary" @click="$emit('cancel')">Cancel</button>
            <button class="button primary" :disabled="busy || !secureStorage">
                <Save :size="16" /> {{ busy ? 'Saving…' : 'Save connection' }}
            </button>
        </footer>
    </form>
</template>

<style lang="scss">
.connection-form {
    max-width: 860px;

    .form-section {
        padding: 26px 0;
        border-bottom: 1px solid var(--line);
    }

    .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 22px 24px;
        margin-top: 20px;
    }

    .field-wide {
        grid-column: 1 / -1;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;

        span {
            font-size: 13px;
            font-weight: 400;
            color: var(--muted);
        }
    }

    .storage-note {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        color: var(--muted);
        font-size: 13px;
        margin: 24px 0;

        svg {
            flex-shrink: 0;
        }
    }

    .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
}
</style>
