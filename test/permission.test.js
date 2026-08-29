// 权限引擎的回归测试。
//
// 这些代码决定「一次删除会不会被拦下来」,是全仓库最不能靠手测的部分:
// 它的失效是静默的 —— 规则看着在列表里,实际一次都没命中过。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { actionsOf, describe as shape, pathsOf } from '../agent/danger.js';
import { decide, matches, normalizeRule } from '../agent/rules.js';
import { gate } from '../agent/permission.js';

const CTX = { home: '/Users/me', cwd: '/Users/me/proj' };
const rule = (match) => normalizeRule({ id: 'r', text: '测试规则', match });
const bash = (command) => shape('bash', { summary: '', command });

describe('危险动作识别', () => {
    test('认得出各类动作', () => {
        assert.deepEqual(actionsOf('rm -rf /tmp/x'), ['delete']);
        assert.deepEqual(actionsOf('npm install lodash'), ['install']);
        assert.deepEqual(actionsOf('git push origin main'), ['gitPush']);
        assert.deepEqual(actionsOf('sudo rm x'), ['delete', 'sudo']);
        assert.deepEqual(actionsOf('ls -la'), []);
    });

    test('URL 不算路径 —— 否则会误配路径条件', () => {
        assert.deepEqual(pathsOf('curl https://x.com/a.sh'), []);
        assert.deepEqual(pathsOf('rm ~/Downloads/a.txt'), ['~/Downloads/a.txt']);
    });

    test('write / edit 天然是覆盖写入', () => {
        assert.deepEqual(shape('write', { path: 'a.js' }).actions, ['overwrite']);
        assert.deepEqual(shape('read', { path: 'a.js' }).actions, []);
    });
});

describe('规则匹配', () => {
    const downloads = rule({ actions: ['delete'], paths: ['~/Downloads/**'] });

    test('目录下的文件命中', () => {
        assert.equal(matches(downloads, bash('rm ~/Downloads/a.txt'), CTX), true);
        assert.equal(matches(downloads, bash('rm -rf ~/Downloads/tmp/x'), CTX), true);
    });

    // 这条是回归:X/** 原本不覆盖 X 自身,rm -rf 整个目录反而漏过 —— 最该拦的那一下
    test('目录自身也要罩住', () => {
        assert.equal(matches(downloads, bash('rm -rf ~/Downloads'), CTX), true);
        assert.equal(matches(downloads, bash('rm -rf ~/Downloads/'), CTX), true);
    });

    test('范围外不命中 —— 规则不能变成一把大锁', () => {
        assert.equal(matches(downloads, bash('rm ~/proj/tmp.log'), CTX), false);
        assert.equal(matches(downloads, bash('rm /tmp/other'), CTX), false);
    });

    test('动作不对不命中', () => {
        assert.equal(matches(downloads, bash('ls ~/Downloads'), CTX), false);
        assert.equal(matches(downloads, bash('cat ~/Downloads/a.txt'), CTX), false);
    });

    test('维度之间是与', () => {
        const onlyEdit = rule({ tools: ['edit'], actions: ['overwrite'] });
        assert.equal(matches(onlyEdit, shape('edit', { path: 'a.js' }), CTX), true);
        assert.equal(matches(onlyEdit, shape('write', { path: 'a.js' }), CTX), false);
    });

    test('停用的规则不参与', () => {
        assert.equal(matches({ ...downloads, enabled: false }, bash('rm ~/Downloads/a.txt'), CTX), false);
    });

    test('编译不出条件的规则拦不住任何东西', () => {
        const soft = rule({});
        assert.equal(matches(soft, bash('rm -rf /'), CTX), false);
    });
});

describe('三档判定', () => {
    const rules = [rule({ actions: ['delete'], paths: ['~/Downloads/**'] })];
    const call = (mode, command) => decide({ mode, rules, request: bash(command), context: CTX });

    test('逐步确认:一律停下来', () => {
        assert.equal(call('ask', 'ls').effect, 'ask');
        assert.equal(call('ask', 'rm ~/Downloads/a.txt').effect, 'ask');
    });

    test('按照规则:命中才停,没说到就放行', () => {
        assert.equal(call('rules', 'rm ~/Downloads/a.txt').effect, 'ask');
        assert.equal(call('rules', 'rm /tmp/x').effect, 'allow');
    });

    test('完全跳过:一律放行', () => {
        assert.equal(call('skip', 'rm ~/Downloads/a.txt').effect, 'allow');
    });
});

describe('审批门', () => {
    const rules = [rule({ actions: ['delete'], paths: ['~/Downloads/**'] })];
    const run = async (permission, command) => {
        let executed = false;
        const raw = new Map([['bash', async () => { executed = true; return { ok: true }; }]]);
        const out = await gate(raw, { context: CTX, rules, ...permission }).get('bash')({ command });
        return { executed, out };
    };

    test('命中规则时执行器根本不会被调到', async () => {
        const { executed, out } = await run({ mode: 'rules', ask: async () => 'allow' }, 'rm ~/Downloads/a.txt');
        assert.equal(executed, true); // 用户点了允许,才放行
        assert.ok(out.ok);
    });

    test('用户拒绝 → 不执行,并以工具输出的形式回给模型', async () => {
        const { executed, out } = await run({ mode: 'ask', ask: async () => 'deny' }, 'ls');
        assert.equal(executed, false);
        assert.match(out.error, /用户拒绝/);
    });

    // 后台场景:没人可问就当场拒绝,绝不挂起 —— 悬着的 Promise 会把整轮永远挂住
    test('没有问询通道时当场拒绝,不挂起', async () => {
        const { executed, out } = await run({ mode: 'ask' }, 'ls');
        assert.equal(executed, false);
        assert.match(out.error, /没有人可以确认/);
    });

    test('完全跳过档下不问也不拦', async () => {
        const { executed } = await run({ mode: 'skip' }, 'rm ~/Downloads/a.txt');
        assert.equal(executed, true);
    });
});
