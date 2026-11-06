<script setup lang="ts">
import {withBase} from 'vitepress';
import manifest from '../../public/releases/latest.json';

const archives = manifest.artifacts.filter(artifact => artifact.name.endsWith('.zip'));
</script>

<template>
    <ul class="release-downloads">
        <li v-for="artifact in archives" :key="artifact.name">
            <a :href="withBase(artifact.path)" download>{{ artifact.name }}</a>
            <span>{{ (artifact.bytes / 1024 / 1024).toFixed(2) }} MiB</span>
            <details>
                <summary>SHA-256 checksum</summary>
                <code>{{ artifact.sha256 }}</code>
            </details>
        </li>
    </ul>
</template>

<style lang="scss">
.release-downloads {
    li {
        margin: 20px 0;

        > span {
            margin-left: 12px;
            color: var(--vp-c-text-2);
        }
    }

    details code {
        overflow-wrap: anywhere;
    }
}
</style>
