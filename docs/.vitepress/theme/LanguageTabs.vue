<script setup lang="ts">
import {useId} from 'vue';
import {exampleLanguage, type ExampleLanguage} from './exampleLanguage';

defineProps<{label: string}>();

const id = useId();
const languages: {key: ExampleLanguage; name: string}[] = [
    {key: 'typescript', name: 'TypeScript'},
    {key: 'javascript', name: 'JavaScript'},
    {key: 'mjs', name: 'MJS'},
    {key: 'commonjs', name: 'CommonJS'},
];

function onKey(event: KeyboardEvent, index: number): void {
    let next = index;

    if (event.key === 'ArrowRight') {
        next = (index + 1) % languages.length;
    } else if (event.key === 'ArrowLeft') {
        next = (index + languages.length - 1) % languages.length;
    } else if (event.key === 'Home') {
        next = 0;
    } else if (event.key === 'End') {
        next = languages.length - 1;
    } else {
        return;
    }

    event.preventDefault();
    exampleLanguage.value = languages[next].key;
    document.getElementById(id + '-tab-' + next)?.focus();
}
</script>

<template>
    <section class="language-tabs">
        <div role="tablist" :aria-label="label" class="language-tabs__bar">
            <button
                v-for="(language, index) in languages"
                :id="id + '-tab-' + index"
                :key="language.key"
                type="button"
                role="tab"
                :aria-selected="exampleLanguage === language.key"
                :aria-controls="id + '-panel-' + index"
                :tabindex="exampleLanguage === language.key ? 0 : -1"
                @click="exampleLanguage = language.key"
                @keydown="onKey($event, index)"
            >
                {{ language.name }}
            </button>
        </div>
        <div
            v-for="(language, index) in languages"
            v-show="exampleLanguage === language.key"
            :id="id + '-panel-' + index"
            :key="language.key"
            role="tabpanel"
            :aria-labelledby="id + '-tab-' + index"
            tabindex="0"
        >
            <slot :name="language.key" />
        </div>
    </section>
</template>

<style lang="scss">
.language-tabs {
    margin: 20px 0;

    .language-tabs__bar {
        display: flex;
        gap: 4px;
        overflow-x: auto;
        border-bottom: 1px solid var(--vp-c-divider);

        button {
            flex-shrink: 0;
            padding: 10px 12px;
            color: var(--vp-c-text-1);
            font-size: 14px;

            &[aria-selected='true'] {
                border-bottom: 2px solid var(--vp-c-brand-1);
                color: var(--vp-c-brand-1);
                font-weight: 600;
            }

            &:focus-visible {
                outline: 2px solid var(--vp-c-brand-1);
                outline-offset: -3px;
            }
        }
    }
}
</style>
