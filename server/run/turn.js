// 聊天和任务共用一条运行链：逐条落库、摘要压缩、工具确认、停止和错误收尾。
import { runAgent } from '../../agent/index.js';
import { complete } from '../../ai/complete.js';
import { EVENTS } from '../../shared/events.js';

const itemText = (item) => typeof item?.content === 'string' ? item.content
    : Array.isArray(item?.content) ? item.content.map((part) => part?.text || '').join('') : '';
const parseArgs = (value) => { try { return JSON.parse(String(value || '{}')); } catch { return {}; } };
const defaults = new Set(['新对话', '新任务']);

export function createTurns({ config, store, files, approvals, apps, broadcast }) {
    const active = new Map();
    // 上次进程异常退出的任务不能一直显示“执行中”；上下文已逐条保存，可继续。
    for (const task of store.listTasks().filter((item) => item.status === 'running')) store.setStatus(task.id, 'paused');

    async function autoTitle(id, content, generated, runtime, fallback) {
        try {
            const reply = generated.filter((item) => item?.type === 'message').map(itemText).join('\n').slice(0, 1200);
            const result = await complete({
                ...runtime,
                instructions: '为这段对话起一个不超过 16 个字的标题，概括用户想做的事。只输出标题。',
                input: [{ role: 'user', content: `用户:${content.slice(0, 1200)}\n\n助手:${reply}` }],
            });
            const title = String(result.text).replace(/\s+/g, ' ').trim().slice(0, 32);
            if (!title || store.getThread(id)?.title !== fallback) return;
            store.setTitle(id, title);
            broadcast(EVENTS.THREADS_CHANGED, {});
        } catch { /* 标题失败保留用户首句 */ }
    }

    async function work(thread, user, controller, runtime, options, fallback) {
        const id = thread.id;
        const generated = [];
        let live = [...thread.context, user];
        let usage = thread.usage;
        const event = (name, data = {}) => broadcast(name, { thread: id, ...data });
        const emit = (type, data) => {
            if (type === 'message' && data.delta) event(EVENTS.DELTA, { content: data.delta });
            else if (type === 'reasoning' && data.delta) event(EVENTS.REASONING, { content: data.delta });
            else if (type === 'function_call' && data.phase === 'started') event(EVENTS.CALL_STARTED);
            else if (type === 'compact') {
                if (data.phase === 'started') event(EVENTS.COMPACT_START);
                else {
                    if (data.compacted) {
                        store.compact(id, { ...data, usage });
                        live = [...data.history];
                    }
                    event(EVENTS.COMPACT_DONE, { summary: data.summary || '' });
                }
            } else if (data.item) {
                generated.push(data.item);
                live.push(data.item);
                if (data.usage) usage = data.usage;
                store.record(id, data.item, live, usage);
                if (type === 'message' || type === 'reasoning') event(EVENTS.TEXT_DONE, { kind: type, content: type === 'reasoning' ? [...(data.item.summary || []), ...(Array.isArray(data.item.content) ? data.item.content : [])].map((part) => part.text || '').join('') : itemText(data.item) });
                if (type === 'function_call') event(EVENTS.CALLS, { calls: [{ callId: data.item.call_id, name: data.item.name, args: parseArgs(data.item.arguments) }] });
                else if (type === 'function_call_output') event(EVENTS.CALL_OUTPUT, { callId: data.item.call_id, result: data.item.output || '' });
            }
            options.emit?.(type, data);
        };
        try {
            // 恢复异常退出留下的未配对工具调用，避免下一次 Responses 请求被拒绝。
            const pending = new Map();
            for (const item of live) {
                if (item.type === 'function_call') pending.set(item.call_id, item);
                else if (item.type === 'function_call_output') pending.delete(item.call_id);
            }
            for (const call of pending.values()) {
                const item = { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: '上次进程退出，该调用未完成' }) };
                live.push(item);
                store.record(id, item, live, usage);
            }
            let result;
            if (options.single) {
                const completed = await complete({ ...runtime, input: live, signal: controller.signal });
                const item = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: completed.text }] };
                emit('message', { item, usage: completed.usage });
                if (completed.status !== 'completed') throw new Error(`补全未完整结束：${completed.stopReason || completed.status}`);
                if (!completed.text.trim()) throw new Error('补全返回空内容');
                if (options.format?.type === 'json_schema') {
                    try { JSON.parse(completed.text); } catch { throw new Error('结构化补全未返回有效 JSON'); }
                }
                result = { ...completed, context: live };
            } else {
                result = await runAgent({
                    ...runtime,
                    ask: thread.type === 'task' || options.interactive === false ? null : (payload) => approvals.request({ thread: id, ...payload, signal: controller.signal }),
                    propose: thread.type === 'task' || options.interactive === false ? null : (payload) => {
                        const proposal = store.createProposal(id, payload);
                        broadcast(EVENTS.PROPOSALS_CHANGED, { thread: id });
                        return { id: proposal.id, status: 'pending', message: '提议已展示，等待用户稍后处理；不要等待或视为授权。' };
                    },
                    runId: crypto.randomUUID(), input: live, usage,
                    compaction: config.compaction, env: process.env, signal: controller.signal,
                    emit, prepareInput: files.prepareInput,
                });
            }
            live = [...result.context];
            usage = result.usage;
            if (result.stopReason) {
                const marker = { role: 'system', content: `[incomplete] 上一条回复未完整结束:${result.stopReason}` };
                live.push(marker);
                store.record(id, marker, live, usage);
            } else store.saveContext(id, live, usage);
            if (thread.type === 'task') store.setStatus(id, result.status === 'completed' ? 'completed' : 'failed');
            event(EVENTS.DONE, { usage, stopReason: result.stopReason || '' });
            if (fallback) void autoTitle(id, user.content, generated, runtime, fallback);
            return { status: result.status, usage, stopReason: result.stopReason || '', text: generated.filter((item) => item.type === 'message').map(itemText).join('') };
        } catch (error) {
            const aborted = controller.signal.aborted;
            const pending = new Map();
            for (const item of live) {
                if (item.type === 'function_call') pending.set(item.call_id, item);
                else if (item.type === 'function_call_output') pending.delete(item.call_id);
            }
            for (const call of pending.values()) {
                const item = { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: aborted ? '任务被用户停止，该调用未完成' : '运行出错，该调用未完成' }) };
                live.push(item);
                store.record(id, item, live, usage);
                event(EVENTS.CALL_OUTPUT, { callId: call.call_id, result: item.output });
            }
            const message = String(error?.message || error);
            const marker = { role: 'system', content: aborted ? '[stopped] 上一条回复被用户停止。' : `[error] 上一轮运行失败:${message.slice(0, config.errorMaxChars)}` };
            // 摘要失败时 live 仍为原始上下文，没有机械裁剪，也没有成功压缩记录。
            live.push(marker);
            store.record(id, marker, live, usage);
            if (thread.type === 'task') store.setStatus(id, aborted ? 'paused' : 'failed');
            event(aborted ? EVENTS.ABORTED : EVENTS.ERROR, aborted ? {} : { message });
            return { status: aborted ? 'aborted' : 'failed', error: message, usage };
        } finally {
            active.delete(id);
            broadcast(EVENTS.THREADS_CHANGED, {});
        }
    }

    return {
        ids: () => [...active.keys()],
        isRunning: (id) => active.has(id),
        stop(id) { const run = active.get(id); run?.controller.abort(); return Boolean(run); },
        async stopAndWait(id) {
            const run = active.get(id);
            if (!run) return false;
            run.controller.abort();
            await run.finished;
            return true;
        },
        start(thread, content, attachments = [], clientId = '', options = {}) {
            if (active.has(thread.id)) throw Object.assign(new Error('该聊天或任务正在运行'), { status: 409 });
            const settings = store.getSettings();
            const rules = thread.type === 'chat' ? store.getThread(thread.id)?.rules || '' : '';
            const runtime = {
                responsesUrl: settings.responsesUrl || '', apiKey: settings.apiKey || '', model: settings.model || '',
                modelOptions: { ...config.modelOptions, ...(options.format ? { text: { ...config.modelOptions?.text, format: options.format } } : {}) },
                retry: config.retry, maxRounds: config.maxRounds,
                errorMaxChars: config.errorMaxChars, shell: config.shell,
                instructions: [settings.instructions || '', rules ? `本对话规则：\n${rules}` : '', options.instructions || '', apps?.promptSection() || ''].filter(Boolean).join('\n\n'),
            };
            if (!runtime.responsesUrl || !runtime.apiKey || !runtime.model) {
                throw Object.assign(new Error('请先在设置中填写接口地址、API Key 和模型'), { status: 400 });
            }
            const user = { role: 'user', content, attachments };
            const message = store.record(thread.id, user, [...thread.context, user], thread.usage);
            const fallback = defaults.has(thread.title) ? content.replace(/\s+/g, ' ').trim().slice(0, 24) || attachments[0]?.name || thread.title : '';
            if (fallback) store.setTitle(thread.id, fallback);
            if (thread.type === 'task') store.setStatus(thread.id, 'running');
            const controller = new AbortController();
            const finished = Promise.resolve().then(() => work(thread, user, controller, runtime, options, fallback)).catch((error) => {
                console.error('[turn] 收尾失败:', error);
                active.delete(thread.id);
                broadcast(EVENTS.ERROR, { thread: thread.id, message: String(error?.message || error) });
                return { status: 'failed', error: String(error?.message || error) };
            });
            active.set(thread.id, { controller, finished });
            broadcast(EVENTS.START, { thread: thread.id, clientId, content });
            broadcast(EVENTS.THREADS_CHANGED, {});
            return { message, finished };
        },
    };
}
