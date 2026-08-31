// 具有 Bash 和文件工具的 Agent 入口。
// permission 传进来时,每个执行器外面会包一层审批门(见 permission.js)。
import { runAgent as runAi } from '../ai/index.js';
import { gate } from './permission.js';
import { consultTool, createConsult } from './functions/consult.js';
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

    const gated = permission ? gate(executors, permission) : executors;

    // 提醒工具(默认关)。装在过闸之后 —— 它自己不该被审批门再拦一道,
    // 否则就成了「为了问你而先问你」。它只能增加摩擦,没有任何路径能靠它跳过规则。
    const useConsult = permission?.consult && typeof permission.ask === 'function';
    if (useConsult) gated.set('consult', createConsult({ ask: permission.ask }));

    return runAi({
        ...options,
        tools: useConsult ? [...tools, consultTool] : tools,
        executors: gated,
    });
}
