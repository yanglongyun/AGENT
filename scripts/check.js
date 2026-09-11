import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['config.example.js'];

function collect(directory) {
    for (const entry of readdirSync(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) collect(path);
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
    }
}

for (const directory of ['ai', 'agent', 'server', 'shared', 'scripts', 'test']) collect(directory);

for (const file of files.sort()) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
    if (result.error) console.error(result.error);
    if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax checked ${files.length} JavaScript files.`);
