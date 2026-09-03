// 工具执行:按名字执行一次 function_call,产出 function_call_output。
// 不认识循环,不认识模型 —— 进来一个 call,出去一个 output。
import { bash } from './functions/bash.js';
import { read } from './functions/read.js';
import { write } from './functions/write.js';
import { edit } from './functions/edit.js';
import { createConfirm } from './functions/confirm.js';
import { createPropose } from './functions/propose.js';

const parse = (value) => {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
};

/**
 * @param bash   bash 工具的参数(可执行文件、超时、输出上限)
 * @param ask      问询通道:ask(payload) → 'allow' | 'deny' | 'timeout'。给了才有 confirm 工具
 * @param propose  提议通道:propose(payload) → 工具结果。给了才有 propose 工具
 * @returns run(call):执行一次并包成 output
 */
export function createRunner({ bash: bashOptions, ask = null, propose = null, workdir, env, signal }) {
    const functions = { bash: bash(bashOptions), read, write, edit };
    if (typeof ask === 'function') functions.confirm = createConfirm({ ask });
    if (typeof propose === 'function') functions.propose = createPropose({ propose });
    const context = { signal, cwd: workdir, env };

    async function run(call) {
        const name = String(call.name || '');
        const execute = functions[name];
        let result;
        try {
            result = typeof execute === 'function'
                ? await execute(parse(call.arguments), context)
                : { error: `未知工具:${name}` };
        } catch (error) {
            // 工具自己出错就把错误回喂给模型,让它换个法子。但取消不是工具错误,必须一路抛到循环外
            if (error?.name === 'AbortError' || signal?.aborted) throw error;
            result = { error: error?.message || String(error) };
        }
        const item = {
            type: 'function_call_output',
            call_id: String(call.call_id || ''),
            output: typeof result === 'string' ? result : JSON.stringify(result),
        };
        if (result?.image?.path) item.image = result.image;
        return item;
    }

    return run;
}
