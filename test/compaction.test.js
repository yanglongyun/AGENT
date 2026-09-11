import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { compact } from '../agent/compact.js';
import { runAgent } from '../agent/index.js';
import config from '../config.example.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const history = () => Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i).repeat(3000) }));
const options = () => ({ history: history(), usage: { input_tokens: 100 }, compaction: { ...config.compaction, contextWindowTokens: 100, tailKeepChars: 500, summaryMinChars: 5 }, responsesUrl: 'https://mock/responses', apiKey: 'k', model: 'm', errorMaxChars: 400 });
function response(text, status = 'completed') {
    return new Response(`data: ${JSON.stringify({ type: 'response.output_item.done', item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } })}\n\ndata: ${JSON.stringify({ type: `response.${status}`, response: { status, usage: { input_tokens: 25, output_tokens: 7 }, incomplete_details: { reason: 'max_output_tokens' } } })}\n\n`);
}

test('模型摘要成功，仅记录输出 token 数，不返回压缩种类', async () => {
    globalThis.fetch = async () => response('这是足够长的模型摘要');
    const args = options();
    const original = structuredClone(args.history);
    const result = await compact(args);
    assert.equal(result.compacted, true);
    assert.equal(result.tokens, 7);
    assert.equal('kind' in result, false);
    assert.deepEqual(args.history, original);
});

for (const [name, mock, pattern] of [
    ['HTTP 失败', async () => new Response('unavailable', { status: 503 }), /503/],
    ['空摘要', async () => response(''), /摘要失败/],
    ['短摘要', async () => response('短'), /摘要失败/],
    ['摘要被截断', async () => response('这是一段看似足够长但被截断的摘要', 'incomplete'), /摘要失败/],
    ['取消', async () => { throw new DOMException('Aborted', 'AbortError'); }, /Aborted/],
]) {
    test(`${name}直接报错：不重试、不裁剪、不继续正常请求`, async () => {
        let calls = 0;
        globalThis.fetch = async (...args) => { calls++; return mock(...args); };
        const args = options();
        const original = structuredClone(args.history);
        const events = [];
        await assert.rejects(runAgent({
            ...args, input: args.history, runId: 'test', maxRounds: 2, shell: config.shell,
            emit: (type, data) => events.push([type, data.phase]),
        }), pattern);
        assert.equal(calls, 1);
        assert.deepEqual(args.history, original);
        assert.ok(!events.some(([type, phase]) => type === 'compact' && phase === 'done'));
        assert.ok(events.some(([type]) => type === 'error'));
    });
}
