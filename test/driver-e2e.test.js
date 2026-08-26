// 端到端:假上游 + 真 runAgent。验的是「换个驱动，循环那层完全不用改」。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runAgent } from '../ai/index.js';

const sse = (response, frames) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const frame of frames) response.write(`data: ${JSON.stringify(frame)}\n\n`);
    response.write('data: [DONE]\n\n');
    response.end();
};

let server; let base; let lastBody;

before(async () => {
    server = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));

        // 第一轮要工具，第二轮给答案 —— 靠有没有 tool 消息判断轮次
        const isSecondRound = request.url.startsWith('/chat')
            ? lastBody.messages.some((m) => m.role === 'tool')
            : lastBody.input.some((i) => i.type === 'function_call_output');

        if (request.url.startsWith('/chat')) {
            sse(response, isSecondRound
                ? [{ choices: [{ delta: { content: '北京晴' } }] },
                   { choices: [{ finish_reason: 'stop', delta: {} }], usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 } }]
                : [{ choices: [{ delta: { reasoning_content: '要查天气' } }] },
                   { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"北京"}' } }] } }] },
                   { choices: [{ finish_reason: 'tool_calls', delta: {} }], usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 } }]);
            return;
        }
        sse(response, isSecondRound
            ? [{ type: 'response.output_text.delta', delta: '北京晴' },
               { type: 'response.output_item.done', item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '北京晴' }] } },
               { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 9, output_tokens: 3, total_tokens: 12 } } }]
            : [{ type: 'response.output_item.added', item: { type: 'function_call' } },
               { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"北京"}' } },
               { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 7, output_tokens: 5, total_tokens: 12 } } }]);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const run = (driver, path) => runAgent({
    runId: 'r1',
    driver,
    responsesUrl: base + path,
    apiKey: 'k',
    model: 'm',
    instructions: '你是助手',
    input: [{ role: 'user', content: '北京天气？' }],
    tools: [{ type: 'function', name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } }],
    executors: new Map([['get_weather', async ({ city }) => ({ city, weather: '晴' })]]),
    maxRounds: 4,
    errorMaxChars: 2000,
    retry: { enabled: false },
});

test('chat 驱动跑完整圈，产出的 item 词表和 Responses 一致', async () => {
    const result = await run('chat', '/chat/completions');
    assert.deepEqual(result.items.map((i) => i.type),
        ['reasoning', 'function_call', 'function_call_output', 'message']);
    assert.equal(result.items[3].content[0].text, '北京晴');
    assert.equal(result.status, 'completed');
    assert.equal(result.usage.input_tokens, 9, 'usage 必须归一化，否则上下文压缩不触发');
});

test('responses 驱动跑同一圈，结果形状相同', async () => {
    const result = await run('responses', '/responses');
    assert.deepEqual(result.items.map((i) => i.type),
        ['function_call', 'function_call_output', 'message']);
    assert.equal(result.items[2].content[0].text, '北京晴');
    assert.equal(result.usage.input_tokens, 9);
});

test('chat 驱动第二轮发出的 messages 是合法的 Chat 序列', async () => {
    await run('chat', '/chat/completions');
    const roles = lastBody.messages.map((m) => m.role);
    assert.deepEqual(roles, ['system', 'user', 'assistant', 'tool']);
    assert.equal(lastBody.messages[2].tool_calls[0].id, 'call_1');
    assert.equal(lastBody.messages[3].tool_call_id, 'call_1');
    assert.ok(!lastBody.messages.some((m) => m.role === 'reasoning'), 'reasoning 不能回传');
    assert.equal(lastBody.tools[0].function.name, 'get_weather', 'tools 要转成嵌套形状');
});

test('未知驱动名当场报错，不静默走默认', async () => {
    await assert.rejects(() => run('bogus', '/chat/completions'), /未知的驱动/);
});
