// 运行编排:一个对话同一时刻只有一轮在跑,轮子在后台转,事件走广播。
//
// 与 0.0.2 的关键差别:**逐条落库**。从前整轮结束才存 result.items,
// 中途停止或崩溃就整轮丢失;现在每个 item 完成即落库,停止只丢正在流式的半句。
// 停止 / 出错时补齐悬空的 function_call(Responses 要求 call 与 output 成对,
// 缺一个下一轮请求整个被拒),并落一条系统留痕 —— 给用户看,也给模型看。
import { runAgent } from '../../agent/index.js';
import { complete } from '../../ai/complete.js';
import { EVENTS } from '../../shared/events.js';
import { rulesSection } from './rules.js';

const DEFAULT_TITLE = '新对话';

const mechanicalTitle = (content) => String(content).replace(/\s+/g, ' ').trim().slice(0, 24) || DEFAULT_TITLE;

const itemText = (item) => {
    if (typeof item?.content === 'string') return item.content;
    if (Array.isArray(item?.content)) return item.content.map((part) => part?.text || '').join('');
    return '';
};

const parseArgs = (value) => {
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
};

export function createTurns({ config, store, files, approvals, apps, broadcast }) {
    const active = new Map();

    /** 停止 / 出错后,给没等到结果的 function_call 补一条输出,落库并进上下文。 */
    function settleDanglingCalls(conversationId, items, reason) {
        const pending = new Map();
        for (const item of items) {
            if (item?.type === 'function_call') pending.set(item.call_id, item);
            else if (item?.type === 'function_call_output') pending.delete(item.call_id);
        }
        const settled = [];
        for (const call of pending.values()) {
            const output = {
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify({ error: reason }),
            };
            store.append(conversationId, output);
            broadcast(EVENTS.CALL_OUTPUT, { conversationId, callId: call.call_id, result: output.output });
            settled.push(output);
        }
        return settled;
    }

    /** 首轮跑完后请模型起个标题;失败就留着机械标题,不打扰任何人。 */
    async function autoTitle(conversationId, userContent, items, runtime) {
        const reply = items.filter((item) => item?.type === 'message').map(itemText).join('\n').slice(0, 1200);
        try {
            const result = await complete({
                responsesUrl: runtime.responsesUrl,
                apiKey: runtime.apiKey,
                model: runtime.model,
                errorMaxChars: config.errorMaxChars,
                instructions: '为这段对话起一个不超过 16 个字的标题,概括用户想做的事。只输出标题本身,不要引号和句号。',
                input: [{ role: 'user', content: `用户:${String(userContent).slice(0, 1200)}\n\n助手:${reply}` }],
            });
            const title = String(result.text).replace(/\s+/g, ' ').trim().slice(0, 32);
            if (!title) return;
            store.setTitle(conversationId, title);
            broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
        } catch { /* 起不出来就用机械标题 */ }
    }

    async function work(conversation, user, controller, runtime) {
        const conversationId = conversation.id;
        // generated:这一轮新产生的;live:当前完整上下文,压缩会整体替换它。出错时靠它存档
        const generated = [];
        let live = [...conversation.context, user];
        let usage = conversation.usage;

        const emit = (type, data) => {
            if (type === 'message' && data.delta) {
                broadcast(EVENTS.DELTA, { conversationId, content: data.delta });
            } else if (type === 'reasoning' && data.delta) {
                broadcast(EVENTS.REASONING, { conversationId, content: data.delta });
            } else if (type === 'function_call' && data.phase === 'started') {
                broadcast(EVENTS.CALL_STARTED, { conversationId });
            } else if (type === 'compact') {
                if (data.phase === 'started') { broadcast(EVENTS.COMPACT_START, { conversationId }); return; }
                if (data.compacted) {
                    // 上下文的最后一项永远是最近落库的那条,所以尾段之前的最后一个 seq = 最新 seq - 尾段条数
                    const previousEnd = store.lastCompactionEnd(conversationId);
                    const endSeq = store.latestMessageSeq(conversationId) - data.tailCount;
                    const startSeq = previousEnd + 1;
                    if (endSeq >= startSeq) {
                        store.appendCompaction(conversationId, { startSeq, endSeq, summary: data.summary, kind: data.kind, tokens: data.tokens });
                    }
                    // 摘要也落成一条消息:界面能看到压缩发生在哪、压成了什么。上下文里它在最前面,消息表里按时间排在尾段之后
                    store.append(conversationId, data.history[0]);
                    live = [...data.history];
                }
                broadcast(EVENTS.COMPACT_DONE, { conversationId });
            } else if (data.item) {
                generated.push(data.item);
                live.push(data.item);
                store.append(conversationId, data.item);
                // 模型每次应答回来都带 usage,存下来 —— 这就是下一次请求前压不压的依据
                if (data.usage) { usage = data.usage; store.saveUsage(conversationId, usage); }
                if (type === 'function_call') {
                    broadcast(EVENTS.CALLS, {
                        conversationId,
                        calls: [{ callId: data.item.call_id, name: data.item.name, args: parseArgs(data.item.arguments) }],
                    });
                } else if (type === 'function_call_output') {
                    broadcast(EVENTS.CALL_OUTPUT, { conversationId, callId: data.item.call_id, result: data.item.output || '' });
                }
            }
        };

        try {
            const { rulesEnabled, rules, ...options } = runtime;
            const result = await runAgent({
                ...options,
                workdir: conversation.workdir,
                // 规则启用才有 confirm。ask 由这里实现 —— 弹卡、等表态;没人回应就超时当拒绝
                ask: rulesEnabled
                    ? (payload) => approvals.request({ conversationId, ...payload, signal: controller.signal })
                    : null,
                propose: proposeFor(conversationId, { rulesEnabled, rules }),
                runId: crypto.randomUUID(),
                input: live,
                usage,
                compaction: config.compaction,
                env: process.env,
                signal: controller.signal,
                emit,
                prepareInput: files.prepareInput,
            });
            const tail = result.stopReason
                ? [{ role: 'system', content: `[incomplete] 上一条回复未完整结束:${result.stopReason}` }]
                : [];
            for (const marker of tail) store.append(conversationId, marker);
            store.saveContext(conversationId, [...result.context, ...tail], result.usage);
            broadcast(EVENTS.DONE, { conversationId, usage: result.usage, stopReason: result.stopReason || '' });
            if (conversation.title === DEFAULT_TITLE) void autoTitle(conversationId, user.content, generated, runtime);
        } catch (error) {
            const aborted = controller.signal.aborted;
            const reason = aborted ? '任务被用户停止,该调用未完成' : '运行出错,该调用未完成';
            const settled = settleDanglingCalls(conversationId, generated, reason);
            const marker = aborted
                ? { role: 'system', content: '[stopped] 上一条回复被用户停止,输出到此为止。' }
                : { role: 'system', content: `[error] 上一轮运行失败:${String(error?.message || error).slice(0, config.errorMaxChars)}` };
            store.append(conversationId, marker);
            store.saveContext(conversationId, [...live, ...settled, marker], usage);
            if (aborted) broadcast(EVENTS.ABORTED, { conversationId });
            else broadcast(EVENTS.ERROR, { conversationId, message: String(error?.message || error) });
        } finally {
            active.delete(conversationId);
            broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
        }
    }

    /**
     * 提议通道。模型给的是编号,这里换成规则 id 存起来;存完广播,立刻回「已提议」。
     * 不等用户 —— 提议不卡任何东西,下一轮提示词里规则单是新的,模型自然知道结果。
     */
    function proposeFor(conversationId, { rulesEnabled, rules }) {
        return ({ kind, text, replaces }) => {
            let target = null;
            if (kind === 'rule') {
                if (!rulesEnabled) return { error: '用户停用了规则,现在不能提议规则' };
                if (replaces) {
                    target = rules[replaces - 1];
                    if (!target) return { error: `没有编号为 ${replaces} 的规则` };
                }
                if (!text && !target) return { error: '新增规则时 text 不能为空' };
            } else if (!text) {
                return { error: 'prompt 提议的 text 不能为空' };
            }
            const proposal = store.createProposal({
                id: crypto.randomUUID(), conversationId, kind, text, replaces: target?.id || '',
            });
            broadcast(EVENTS.PROPOSAL_ASK, proposal);
            return { proposed: true, note: '已提议,等用户决定。不用等,继续手头的事。' };
        };
    }

    return {
        ids: () => [...active.keys()],
        isRunning: (id) => active.has(id),

        stop(id) {
            const controller = active.get(id);
            controller?.abort();
            return Boolean(controller);
        },

        /** 落库用户消息、点亮标题、把轮子丢进后台,立即返回已存的那条消息。 */
        start(conversation, content, attachments = [], clientId = '') {
            if (active.has(conversation.id)) throw Object.assign(new Error('该对话正在运行'), { status: 409 });
            const savedSettings = store.getSettings();
            const rulesEnabled = (savedSettings.rulesEnabled || 'on') === 'on';
            // 启用的规则,顺序就是提示词里的编号 —— 提议用编号指代要改的那条
            const rules = rulesEnabled ? store.listRules().filter((rule) => rule.enabled) : [];
            // runAgent 要的全部参数,加上 rulesEnabled / rules 供问询和提议通道用。不整包展开 config
            const runtime = {
                responsesUrl: savedSettings.responsesUrl || '',
                apiKey: savedSettings.apiKey || '',
                model: savedSettings.model || '',
                modelOptions: config.modelOptions,
                retry: config.retry,
                maxRounds: config.maxRounds,
                errorMaxChars: config.errorMaxChars,
                bash: config.bash,
                // 规则 + 已装应用清单,都进 instructions —— 每轮重新组装,压缩吃不掉
                instructions: [
                    savedSettings.instructions || '',
                    rulesSection({ on: rulesEnabled, rules, canPropose: true }),
                    apps?.promptSection() || '',
                ].filter(Boolean).join('\n\n'),
                rulesEnabled,
                rules,
            };
            if (!runtime.responsesUrl || !runtime.apiKey || !runtime.model) {
                throw Object.assign(new Error('请先在设置中填写接口地址、API Key 和模型'), { status: 400 });
            }
            const controller = new AbortController();
            active.set(conversation.id, controller);

            const user = { role: 'user', content, attachments };
            const saved = store.append(conversation.id, user);
            if (conversation.title === DEFAULT_TITLE) {
                store.setTitle(conversation.id, mechanicalTitle(content || attachments[0]?.name));
            }
            broadcast(EVENTS.START, { conversationId: conversation.id, clientId, content });
            broadcast(EVENTS.CONVERSATIONS_CHANGED, {});

            work(conversation, user, controller, runtime).catch((error) => {
                // work 自己兜错;走到这儿说明兜错本身炸了(如落库失败),别让进程静默烂掉
                console.error('[turn] 收尾失败:', error);
                active.delete(conversation.id);
                broadcast(EVENTS.ERROR, { conversationId: conversation.id, message: String(error?.message || error) });
            });
            return saved;
        },
    };
}
