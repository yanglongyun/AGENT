// 构建:把 css 和 js 内联进单个 dist/index.html。
// 零依赖是刻意的 —— app 由 AI 写,能少一次 npm install 就少一个失败点。
// 真实的 app 大可以用 vite,宿主不关心,它只认 dist/index.html。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, 'src', name), 'utf8');

const html = read('index.html')
    .replace('<link rel="stylesheet" href="app.css" />', `<style>\n${read('app.css')}\n</style>`)
    .replace('<script type="module" src="app.js"></script>', `<script type="module">\n${read('app.js')}\n</script>`);

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), html);
console.log(`[notes] dist/index.html ${html.length} 字节`);
