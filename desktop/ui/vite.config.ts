import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    resolve: {
        // 事件名契约在 web/shared,和服务端共用一份
        alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
    },
    server: {
        host: '127.0.0.1',
        port: 5176,
        fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
        proxy: { '/api': 'http://127.0.0.1:9510' },
    },
});
