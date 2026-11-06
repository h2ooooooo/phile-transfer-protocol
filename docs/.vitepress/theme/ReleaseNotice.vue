<script setup lang="ts">
import release from '../../../release.json';
</script>

<template>
    <aside v-if="!release.published" class="release-notice" aria-label="Release status">
        <strong>Prepared release {{ release.version }}.</strong>
        Downloadable archives are included with these docs. npm and Packagist packages are not published yet.
        Registry installation commands describe the release workflow after publication.
    </aside>
</template>

<style lang="scss">
.release-notice {
    max-width: 1120px;
    margin: 16px auto;
    border: 1px solid var(--vp-c-divider);
    border-radius: 6px;
    padding: 14px 20px;
    color: var(--vp-c-text-1);
    background: var(--vp-c-bg-soft);
    font-size: 14px;
    line-height: 1.6;
}
</style>
