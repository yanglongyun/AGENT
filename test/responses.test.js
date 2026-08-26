// 流解析、截断判定与重试编排。用桩 fetch 驱动，不发真实请求。
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../ai/request.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const sse = (events) => new ReadableStream({
    start(controller) {
        for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
    },
});

const ok = (events) => new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const fail = (status, message) => new Response(JSON.stringify({ error: { message } }), { status });

const base = { url: 'https://x/v1/responses', apiKey: 'k', model: 'm', input: [], errorMaxChars: 400, retry: { baseDelayMs: 1 } };

const MESSAGE = { type: 'response.output_item.done', item: { type: 'message', content: [{ text: 'hi' }] } };
const COMPLETED = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 5 } } };

test('正常完成：收集 item、usage 与 status', async () => {
    globalThis.fetch = async () => ok([{ type: 'response.output_text.delta', delta: 'hi' }, MESSAGE, COMPLETED]);
    const result = await request({ ...base });
    assert.equal(result.items.length, 1);
    assert.equal(result.usage.input_tokens, 5);
    assert.equal(result.status, 'completed');
    assert.equal(result.stopReason, '');
});

test('incomplete：截断原因被透出，不再伪装成 completed', async () => {
    globalThis.fetch = async () => ok([MESSAGE, {
        type: 'response.incomplete',
        response: { status: 'incomplete', usage: {}, incomplete_details: { reason: 'max_output_tokens' } },
    }]);
    const result = await request({ ...base });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.stopReason, 'max_output_tokens');
});

test('incomplete：内容过滤同样被透出', async () => {
    globalThis.fetch = async () => ok([MESSAGE, {
        type: 'response.incomplete',
        response: { status: 'incomplete', incomplete_details: { reason: 'content_filter' } },
    }]);
    assert.equal((await request({ ...base })).stopReason, 'content_filter');
});

test('流无终结事件即中断：不把半截内容当成功', async () => {
    globalThis.fetch = async () => ok([{ type: 'response.output_text.delta', delta: 'half' }, MESSAGE]);
    await assert.rejects(() => request({ ...base }), /终结事件前中断/);
});

test('429 后重试，第二次成功', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return calls === 1 ? fail(429, 'slow down') : ok([MESSAGE, COMPLETED]); };
    const seen = [];
    const result = await request({ ...base, onEvent: (type, data) => { if (type === 'retry') seen.push(data); } });
    assert.equal(calls, 2);
    assert.equal(result.status, 'completed');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].attempt, 1);
});

test('400 不重试', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return fail(400, 'bad request'); };
    await assert.rejects(() => request({ ...base }), /400/);
    assert.equal(calls, 1);
});

test('额度耗尽的 429 不重试', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return fail(429, 'insufficient_quota'); };
    await assert.rejects(() => request({ ...base }), /insufficient_quota/);
    assert.equal(calls, 1);
});

test('重试次数用尽后抛出', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return fail(503, 'unavailable'); };
    await assert.rejects(() => request({ ...base, retry: { baseDelayMs: 1, maxRetries: 2 } }), /503/);
    assert.equal(calls, 3, '首次 + 2 次重试');
});

test('已经吐出正文后断流，默认不重试(否则正文重复一遍)', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return calls === 1 ? ok([{ type: 'response.output_text.delta', delta: 'partial' }]) : ok([MESSAGE, COMPLETED]);
    };
    await assert.rejects(() => request({ ...base }), /终结事件前中断/);
    assert.equal(calls, 1);
});

test('retry.enabled=false 时完全不重试', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return fail(503, 'unavailable'); };
    await assert.rejects(() => request({ ...base, retry: false }), /503/);
    assert.equal(calls, 1);
});

test('modelOptions 透传进请求体，未给的键不出现', async () => {
    let body;
    globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return ok([MESSAGE, COMPLETED]); };
    await request({ ...base, modelOptions: { reasoning: { effort: 'medium' }, max_output_tokens: 8000, bogus: 1 } });
    assert.deepEqual(body.reasoning, { effort: 'medium' });
    assert.equal(body.max_output_tokens, 8000);
    assert.equal(body.stream, true);
    assert.equal('bogus' in body, false, '白名单外的键不透传');
    assert.equal('store' in body, false, '未指定的参数不凭空出现');
});

test('response.failed 直接抛出模型给的原因', async () => {
    globalThis.fetch = async () => ok([{ type: 'response.failed', response: { error: { message: '模型侧拒绝' } } }]);
    await assert.rejects(() => request({ ...base }), /模型侧拒绝/);
});

test('abort 不触发重试', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    };
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => request({ ...base, signal: controller.signal }));
    assert.equal(calls, 1);
});
