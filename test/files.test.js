// 文件工具的正确性回归。每条对应 0.0.7 修掉的一个硬伤。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { edit } from '../agent/functions/edit.js';
import { read } from '../agent/functions/read.js';
import { detectLineEnding, restoreLineEnding, toLf } from '../agent/functions/text.js';

const workspace = async () => mkdtemp(join(tmpdir(), 'agent-test-'));

const seed = async (name, content) => {
    const cwd = await workspace();
    await writeFile(join(cwd, name), content, 'utf8');
    return { cwd, file: join(cwd, name) };
};

test('edit：new_text 中的 $& 不被当作替换模式', async () => {
    const { cwd, file } = await seed('a.js', 'const price = OLD;\n');
    await edit({ path: 'a.js', old_text: 'OLD', new_text: 'x.replace(/a/, "$&!")' }, { cwd });
    assert.equal(await readFile(file, 'utf8'), 'const price = x.replace(/a/, "$&!");\n');
});

test('edit：$` 与 $$ 原样写入', async () => {
    const { cwd, file } = await seed('b.txt', 'A B C');
    await edit({ path: 'b.txt', old_text: 'B', new_text: '$`' }, { cwd });
    assert.equal(await readFile(file, 'utf8'), 'A $` C');

    const two = await seed('c.txt', 'A B C');
    await edit({ path: 'c.txt', old_text: 'B', new_text: '$$' }, { cwd: two.cwd });
    assert.equal(await readFile(two.file, 'utf8'), 'A $$ C');
});

test('edit：replace_all 路径同样不解释替换模式', async () => {
    const { cwd, file } = await seed('d.txt', 'X and X');
    const result = await edit({ path: 'd.txt', old_text: 'X', new_text: '$&', replace_all: true }, { cwd });
    assert.equal(result.replacements, 2);
    assert.equal(await readFile(file, 'utf8'), '$& and $&');
});

test('edit：CRLF 文件上多行 old_text 能匹配，且写回仍是 CRLF', async () => {
    const { cwd, file } = await seed('e.txt', 'line1\r\nline2\r\nline3\r\n');
    await edit({ path: 'e.txt', old_text: 'line1\nline2', new_text: 'NEW' }, { cwd });
    assert.equal(await readFile(file, 'utf8'), 'NEW\r\nline3\r\n');
});

test('edit：LF 文件不被改写行尾', async () => {
    const { cwd, file } = await seed('f.txt', 'line1\nline2\n');
    await edit({ path: 'f.txt', old_text: 'line1\nline2', new_text: 'NEW' }, { cwd });
    assert.equal(await readFile(file, 'utf8'), 'NEW\n');
});

test('edit：未命中与多处命中仍然报错', async () => {
    const { cwd } = await seed('g.txt', 'a\na\n');
    await assert.rejects(() => edit({ path: 'g.txt', old_text: 'zzz', new_text: '' }, { cwd }), /未找到 old_text/);
    await assert.rejects(() => edit({ path: 'g.txt', old_text: 'a', new_text: 'b' }, { cwd }), /出现 2 次/);
});

test('read：CRLF 归一化为 LF，行尾不带 \\r', async () => {
    const { cwd } = await seed('h.txt', 'line1\r\nline2\r\nline3\r\n');
    const result = await read({ path: 'h.txt' }, { cwd });
    assert.equal(result.content, 'line1\nline2\nline3');
    assert.ok(!result.content.includes('\r'));
});

test('read：尾随换行不多算一行', async () => {
    const { cwd } = await seed('i.txt', 'a\nb\nc\n');
    assert.equal((await read({ path: 'i.txt' }, { cwd })).total_lines, 3);
    const noTrail = await seed('j.txt', 'a\nb\nc');
    assert.equal((await read({ path: 'j.txt' }, { cwd: noTrail.cwd })).total_lines, 3);
    const empty = await seed('k.txt', '');
    assert.equal((await read({ path: 'k.txt' }, { cwd: empty.cwd })).total_lines, 1);
});

test('read 与 edit 的行尾口径一致：read 的输出可直接当 old_text', async () => {
    const { cwd, file } = await seed('l.txt', 'alpha\r\nbeta\r\ngamma\r\n');
    const seen = await read({ path: 'l.txt' }, { cwd });
    const head = seen.content.split('\n').slice(0, 2).join('\n');
    await edit({ path: 'l.txt', old_text: head, new_text: 'ok' }, { cwd });
    assert.equal(await readFile(file, 'utf8'), 'ok\r\ngamma\r\n');
});

test('行尾工具：检测、归一、还原', () => {
    assert.equal(detectLineEnding('a\r\nb'), '\r\n');
    assert.equal(detectLineEnding('a\nb'), '\n');
    assert.equal(detectLineEnding('a\nb\r\nc'), '\n');
    assert.equal(detectLineEnding('no newline'), '\n');
    assert.equal(toLf('a\r\nb'), 'a\nb');
    assert.equal(toLf('a\rb'), 'a\rb', '孤立的 \\r 不动');
    assert.equal(restoreLineEnding('a\nb', '\r\n'), 'a\r\nb');
    assert.equal(restoreLineEnding('a\nb', '\n'), 'a\nb');
});
