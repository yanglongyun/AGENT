import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    resolve: {
        // 事件名契约在 rule/web/shared,和服务端共用一份
        // 事件名契约在 shared/,和服务端共用一份
        alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
    },
    server: {
        host: '127.0.0.1',
        port: 5180,
        fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
        proxy: { '/api': 'http://127.0.0.1:9800', '/apps': 'http://127.0.0.1:9800' },
    },
});
