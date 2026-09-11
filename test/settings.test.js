import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancedDefaults, runtimeSettings, validateAdvanced } from '../server/settings.js';
import { createRunner } from '../agent/runner.js';
import { runAgent } from '../agent/index.js';
import config from '../config.example.js';

test('高级设置保留配置默认值，覆盖阈值、摘要提示词、工具上限和无限循环', () => {
    assert.equal(advancedDefaults(config).compactThreshold, '102400');
    const result = runtimeSettings(config, validateAdvanced({ compactThreshold: 0, maxRounds: 0, toolOutputLimit: 2000, compactPrompt: '保留目标' }));
    assert.equal(result.compaction.contextWindowTokens, 0);
    assert.equal(result.compaction.prompt, '保留目标');
    assert.equal(result.shell.maxOutputChars, 2000);
    assert.equal(result.maxRounds, 0);
    for (const invalid of [{ maxRounds: -1 }, { maxRounds: 1.5 }, { toolOutputLimit: 999 }, { compactThreshold: '' }, { compactPrompt: '' }]) assert.throws(() => validateAdvanced(invalid));
});

test('工具结果超过配置字符数时截断并标注', async () => {
    const run = createRunner({ shell: config.shell, toolOutputLimit: 1000, propose: () => 'x'.repeat(2000) });
    const result = await run({ name: 'propose', arguments: '{}', call_id: 'x' });
    assert.equal(result.output.length, 1000);
    assert.match(result.output, /已截断/);
});

test('无限循环配置允许运行并响应取消', async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(runAgent({ runId: 'test', input: [], maxRounds: 0, shell: config.shell, signal: controller.signal }), (error) => error.name === 'AbortError');
});
