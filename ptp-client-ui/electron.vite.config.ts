import {defineConfig, externalizeDepsPlugin} from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import {resolve} from 'node:path';

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: resolve('dist/main'),
            rollupOptions: {input: {index: resolve('src/main/index.ts'), worker: resolve('src/main/worker.ts'), smoke: resolve('src/main/smoke.ts')}},
        },
    },
    preload: {plugins: [externalizeDepsPlugin()], build: {outDir: resolve('dist/preload')}},
    renderer: {
        root: resolve('src/renderer'),
        plugins: [vue()],
        server: {host: '127.0.0.1', port: 5183, strictPort: true},
        build: {outDir: resolve('dist/renderer'), rollupOptions: {input: resolve('src/renderer/index.html')}},
    },
});
