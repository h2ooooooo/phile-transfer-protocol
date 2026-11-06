<script setup lang="ts">
import {withBase} from 'vitepress';

defineProps<{path: string}>();
</script>

<template>
    <a :href="withBase(path)" download><slot /></a>
</template>
