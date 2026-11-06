<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';
import {ListFilter, Trash2} from '@lucide/vue';
import type {LogEntry} from '../../shared/types';

const props = defineProps<{entries: LogEntry[]}>();
defineEmits<{clear: []}>();

const filter = ref('all');
const follow = ref(true);
const output = ref<HTMLElement>();
const visible = computed(() =>
    props.entries.filter((entry) => filter.value === 'all' || entry.level === 'error'),
);

watch(
    () => props.entries.at(-1)?.id,
    async () => {
        await nextTick();

        if (follow.value && output.value) {
            output.value.scrollTop = output.value.scrollHeight;
        }
    },
);
</script>

<template>
    <section class="client-log" aria-label="Client log">
        <header>
            <div class="log-title">
                <h2>Client log</h2>
                <span>{{ entries.length }} entries</span>
            </div>
            <div class="log-tools">
                <label class="filter-control"
                    ><ListFilter :size="15" /><select
                        v-model="filter"
                        aria-label="Filter client log"
                    >
                        <option value="all">All output</option>
                        <option value="error">Errors only</option>
                    </select></label
                >
                <label class="follow-control"
                    ><input v-model="follow" type="checkbox" /> Follow</label
                >
                <button
                    class="icon-button"
                    :disabled="!entries.length"
                    aria-label="Clear client log"
                    @click="$emit('clear')"
                >
                    <Trash2 :size="16" />
                </button>
            </div>
        </header>
        <div
            ref="output"
            class="log-output"
            tabindex="0"
            aria-label="Client output, newest entries at the bottom"
        >
            <div v-if="!visible.length" class="log-empty">
                <strong>{{
                    filter === 'error' ? 'No errors to show.' : 'Ready when you are.'
                }}</strong>
                <p>
                    {{
                        filter === 'error'
                            ? 'Switch to All output to see the complete log.'
                            : 'Start this bridge to see output from ptp-client here.'
                    }}
                </p>
            </div>
            <div v-for="entry in visible" :key="entry.id" class="log-line" :class="entry.level">
                <time :datetime="entry.time">{{
                    new Date(entry.time).toLocaleTimeString([], {hour12: false})
                }}</time>
                <span class="log-level">{{ entry.level }}</span>
                <span>{{ entry.message }}</span>
            </div>
        </div>
        <footer>
            Output comes from ptp-client. Passwords are redacted. Closing PTP stops all bridges.
        </footer>
    </section>
</template>

<style lang="scss">
.client-log {
    margin-top: 30px;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);

    header,
    .log-tools,
    .log-title {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    header {
        padding: 14px 18px;
        justify-content: space-between;
        border-bottom: 1px solid var(--line);
        flex-wrap: wrap;
    }

    .log-title span,
    footer,
    .follow-control,
    .filter-control {
        font-size: 12px;
        color: var(--muted);
    }

    .filter-control,
    .follow-control {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    select {
        padding: 4px;
        border: 0;
        background: transparent;
        font-size: 12px;
    }

    .log-output {
        height: 268px;
        overflow: auto;
        padding: 14px 18px;
        background: #f0f4f1;
        font:
            12px/1.8 Consolas,
            'SFMono-Regular',
            monospace;
    }

    .log-line {
        display: grid;
        grid-template-columns: 68px 44px minmax(0, 1fr);
        gap: 12px;
        padding: 3px 0;
        overflow-wrap: anywhere;

        time,
        .log-level {
            color: var(--muted);
        }

        &.error {
            color: var(--error);
        }

        &.warn {
            color: #86541d;
        }
    }

    .log-empty {
        display: grid;
        align-content: center;
        height: 100%;
        color: var(--muted);
        font: 14px/1.6 var(--font);

        strong {
            color: var(--ink);
            font-weight: 500;
        }

        p {
            margin: 4px 0 0;
        }
    }

    footer {
        padding: 10px 18px;
        border-top: 1px solid var(--line);
    }
}
</style>
