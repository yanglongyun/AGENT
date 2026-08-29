// 具有 Bash 和文件工具的 Agent 入口。
// permission 传进来时,每个执行器外面会包一层审批门(见 permission.js)。
import { runAgent as runAi } from '../ai/index.js';
import { gate } from './permission.js';
import { bash } from './functions/bash.js';
import { read } from './functions/read.js';
import { write } from './functions/write.js';
import { edit } from './functions/edit.js';
import { tools } from './tools.js';

export function runAgent({ bash: bashOptions, permission, ...options }) {
    const executors = new Map([
        ['bash', bash(bashOptions)],
        ['read', read],
        ['write', write],
        ['edit', edit],
    ]);

    return runAi({
        ...options,
        tools,
        executors: permission ? gate(executors, permission) : executors,
    });
}
