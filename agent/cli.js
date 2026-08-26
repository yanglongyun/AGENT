#!/usr/bin/env node
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import config from '../config.js';
import { runAgent } from './index.js';
import { compact } from './compact.js';

if (!config.apiKey || !config.model) {
    console.error('请先在 config.js 中填写 apiKey 和 model。');
    process.exit(1);
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });
let history = [];
let usage = null;
let controller = null;

process.on('SIGINT', () => {
    if (controller) {
        controller.abort();
        console.log('\n[已取消当前任务]');
        return;
    }
    terminal.close();
    process.exit(0);
});

console.log(`Agent CLI\n工作目录: ${config.workdir}\n输入 /exit 退出，Ctrl+C 取消当前任务。`);

while (true) {
    const prompt = (await terminal.question('\n你 > ')).trim();
    if (!prompt) continue;
    if (prompt === '/exit') break;

    const folded = await compact({ ...config, history, usage });
    history = folded.history;
    if (folded.compacted) console.log('[已压缩早期对话]');

    const user = { role: 'user', content: prompt };
    controller = new AbortController();
    let started = false;
    try {
        const result = await runAgent({
            ...config,
            runId: crypto.randomUUID(),
            input: [...history, user],
            env: process.env,
            signal: controller.signal,
            emit(type, data) {
                if (type === 'message' && data.delta) {
                    if (!started) { process.stdout.write('\nAI > '); started = true; }
                    process.stdout.write(data.delta);
                } else if (type === 'reasoning' && data.delta) {
                    process.stdout.write(data.delta);
                } else if (type === 'retry') {
                    console.log(`\n[重试 ${data.attempt}/${data.maxRetries}] ${Math.round(data.delayMs / 100) / 10}s 后重试:${data.error}`);
                    started = false;
                } else if (type === 'function_call' && data.phase === 'completed') {
                    try {
                        const args = JSON.parse(data.item.arguments || '{}');
                        console.log(`\n[工具 ${data.item.name}] ${args.summary || ''}`);
                    } catch { console.log(`\n[工具 ${data.item.name}]`); }
                }
            },
        });
        history.push(user, ...result.items);
        usage = result.usage;
        if (started) process.stdout.write('\n');
        if (result.stopReason) console.log(`[回复未完整:${result.stopReason}]`);
    } catch (error) {
        if (error?.name !== 'AbortError') console.error(`\n错误: ${error?.message || error}`);
    } finally {
        controller = null;
    }
}

terminal.close();
