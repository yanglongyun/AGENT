import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    toMessages, toTools, toModelOptions, toUsage, toStatus, createAssembler,
} from '../ai/drivers/chat.js';

/* ── 请求侧 ── */

test('instructions 变成开头的 system 消息', () => {
    const out = toMessages([{ role: 'user', content: '你好' }], '你是助手');
    assert.deepEqual(out, [{ role: 'system', content: '你是助手' }, { role: 'user', content: '你好' }]);
});

test('空 instructions 不产生空的 system 消息', () => {
    assert.deepEqual(toMessages([{ role: 'user', content: 'x' }], '   '), [{ role: 'user', content: 'x' }]);
});

test('连续的 function_call 并成一条 assistant 消息', () => {
    const out = toMessages([
        { role: 'user', content: '查两个城市' },
        { type: 'function_call', call_id: 'a', name: 'w', arguments: '{"city":"北京"}' },
        { type: 'function_call', call_id: 'b', name: 'w', arguments: '{"city":"上海"}' },
        { type: 'function_call_output', call_id: 'a', output: '晴' },
        { type: 'function_call_output', call_id: 'b', output: '雨' },
    ]);
    assert.equal(out.length, 4, '两次调用要合成一条 assistant，不是两条');
    assert.equal(out[1].role, 'assistant');
    assert.equal(out[1].tool_calls.length, 2);
    assert.deepEqual(out[1].tool_calls.map((c) => c.id), ['a', 'b']);
    assert.deepEqual(out.slice(2), [
        { role: 'tool', tool_call_id: 'a', content: '晴' },
        { role: 'tool', tool_call_id: 'b', content: '雨' },
    ]);
});

test('reasoning item 被丢掉（Chat 没这个角色，回传会 400）', () => {
    const out = toMessages([
        { role: 'user', content: '在？' },
        { type: 'reasoning', id: 'rs_1', summary: [], content: [{ type: 'reasoning_text', text: '想一下' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '在' }] },
    ]);
    assert.deepEqual(out, [{ role: 'user', content: '在？' }, { role: 'assistant', content: '在' }]);
});

test('message item 的 content 数组被拍平成文本', () => {
    const out = toMessages([{ type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: '前' }, { type: 'output_text', text: '后' },
    ] }]);
    assert.deepEqual(out, [{ role: 'assistant', content: '前后' }]);
});

test('带图的用户消息转成 image_url 分块，纯文本仍是字符串', () => {
    const withImage = toMessages([{ role: 'user', content: [
        { type: 'input_text', text: '看这张' },
        { type: 'input_image', image_url: 'data:image/png;base64,AA' },
    ] }]);
    assert.deepEqual(withImage[0].content, [
        { type: 'text', text: '看这张' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
    ]);
    assert.equal(typeof toMessages([{ role: 'user', content: [{ type: 'input_text', text: '纯文字' }] }])[0].content, 'string');
});

test('工具返回的图片补成一条 user 消息，且不切断 assistant/tool 配对', () => {
    const out = toMessages([
        { type: 'function_call', call_id: 'a', name: 'shot', arguments: '{}' },
        { type: 'function_call_output', call_id: 'a', output: [
            { type: 'input_text', text: '截好了' },
            { type: 'input_image', image_url: 'data:image/png;base64,BB' },
        ] },
    ]);
    assert.deepEqual(out.map((m) => m.role), ['assistant', 'tool', 'user']);
    assert.equal(out[1].content, '截好了', 'tool 消息只能是文本');
    assert.equal(out[2].content[1].image_url.url, 'data:image/png;base64,BB');
});

test('多个工具都带图时，图片一起补在这批 tool 消息之后', () => {
    const out = toMessages([
        { type: 'function_call', call_id: 'a', name: 's', arguments: '{}' },
        { type: 'function_call', call_id: 'b', name: 's', arguments: '{}' },
        { type: 'function_call_output', call_id: 'a', output: [{ type: 'input_image', image_url: 'u1' }] },
        { type: 'function_call_output', call_id: 'b', output: [{ type: 'input_image', image_url: 'u2' }] },
    ]);
    assert.deepEqual(out.map((m) => m.role), ['assistant', 'tool', 'tool', 'user']);
    assert.equal(out[3].content.length, 3, '一条 user 带两张图 + 一句说明');
});

test('tools 从扁平转成嵌套，已经是嵌套的原样放过', () => {
    assert.deepEqual(toTools([{ type: 'function', name: 'f', description: 'd', parameters: { type: 'object' } }]),
        [{ type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object' } } }]);
    const nested = { type: 'function', function: { name: 'g' } };
    assert.deepEqual(toTools([nested]), [nested]);
});

test('模型参数：能对上的映射，对不上的走 chat 透传', () => {
    assert.deepEqual(toModelOptions({ max_output_tokens: 800, temperature: 0.2, store: true }),
        { temperature: 0.2, max_tokens: 800 }, 'store 是 Responses 专有，不该带过去');
    assert.deepEqual(toModelOptions({ chat: { thinking: { type: 'disabled' } } }), { thinking: { type: 'disabled' } });
});

/* ── 响应侧 ── */

test('usage 归一化成 input_tokens/output_tokens —— 上下文压缩读的是这两个', () => {
    assert.deepEqual(toUsage({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }),
        { input_tokens: 10, output_tokens: 4, total_tokens: 14 });
    assert.deepEqual(toUsage(null), {});
});

test('finish_reason 映射：length 是没说完，不能当成功', () => {
    assert.deepEqual(toStatus('stop'), { status: 'completed', stopReason: '' });
    assert.deepEqual(toStatus('tool_calls'), { status: 'completed', stopReason: '' });
    assert.deepEqual(toStatus('length'), { status: 'incomplete', stopReason: 'max_output_tokens' });
    assert.deepEqual(toStatus('content_filter'), { status: 'incomplete', stopReason: 'content_filter' });
});

test('流式增量拼成 items，顺序是 reasoning → message → function_call', () => {
    const seen = [];
    const a = createAssembler((type, payload) => seen.push([type, payload.delta ?? payload.phase]));
    a.push({ choices: [{ delta: { reasoning_content: '想' } }] });
    a.push({ choices: [{ delta: { reasoning_content: '了想' } }] });
    a.push({ choices: [{ delta: { content: '答' } }] });
    a.push({ choices: [{ delta: { content: '案' } }] });
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'f', arguments: '{"a":1}' } }] } }] });
    a.push({ choices: [{ finish_reason: 'tool_calls', delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } });

    const out = a.finish();
    assert.deepEqual(out.items.map((i) => i.type), ['reasoning', 'message', 'function_call']);
    assert.equal(out.items[0].content[0].text, '想了想');
    assert.equal(out.items[1].content[0].text, '答案');
    assert.deepEqual({ call_id: out.items[2].call_id, name: out.items[2].name, arguments: out.items[2].arguments },
        { call_id: 'c1', name: 'f', arguments: '{"a":1}' });
    assert.equal(out.status, 'completed');
    assert.deepEqual(out.usage, { input_tokens: 5, output_tokens: 3, total_tokens: 8 });
    assert.deepEqual(seen, [
        ['reasoning', '想'], ['reasoning', '了想'],
        ['message', '答'], ['message', '案'],
        ['function_call', 'started'],
    ]);
});

test('工具参数被切成碎片时按 index 累加（OpenAI 那种切法）', () => {
    const a = createAssembler();
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_', arguments: '{"ci' } }] } }] });
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'weather', arguments: 'ty":"北京"}' } }] } }] });
    a.push({ choices: [{ finish_reason: 'tool_calls', delta: {} }] });
    const call = a.finish().items[0];
    assert.equal(call.name, 'get_weather');
    assert.equal(call.arguments, '{"city":"北京"}');
});

test('并行的多个工具调用按 index 分开', () => {
    const a = createAssembler();
    a.push({ choices: [{ delta: { tool_calls: [
        { index: 0, id: 'x', function: { name: 'f', arguments: '{}' } },
        { index: 1, id: 'y', function: { name: 'g', arguments: '{}' } },
    ] } }] });
    a.push({ choices: [{ finish_reason: 'tool_calls', delta: {} }] });
    assert.deepEqual(a.finish().items.map((i) => i.call_id), ['x', 'y']);
});

test('有工具调用时的 length 不当成截断', () => {
    const a = createAssembler();
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'f', arguments: '{}' } }] } }] });
    a.push({ choices: [{ finish_reason: 'length', delta: {} }] });
    assert.equal(a.finish().status, 'completed');
});

test('纯截断要报 incomplete，别把半截回复当完整结果', () => {
    const a = createAssembler();
    a.push({ choices: [{ delta: { content: '写到一半' } }] });
    a.push({ choices: [{ finish_reason: 'length', delta: {} }] });
    const out = a.finish();
    assert.equal(out.status, 'incomplete');
    assert.equal(out.stopReason, 'max_output_tokens');
});

test('emitted 只在真吐过内容后为真（决定能不能安全重试）', () => {
    const a = createAssembler();
    assert.equal(a.emitted, false);
    a.push({ choices: [{ delta: {} }] });
    assert.equal(a.emitted, false, '空 delta 不算吐过内容');
    a.push({ choices: [{ delta: { content: '嗨' } }] });
    assert.equal(a.emitted, true);
});
