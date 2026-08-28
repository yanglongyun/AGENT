// 便签前端。两条通道,前缀一分:
//   api/*   → 自己的后端(宿主反代过去)
//   host/*  → 宿主能力(要 token)
// token 既不写死也不放 URL:页面向父窗口报到,宿主校验来源后回给我们。

const state = { token: '', notes: [], summarizing: false };
const $ = (id) => document.getElementById(id);

window.parent.postMessage({ type: 'os.ready' }, '*');
window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type !== 'os.init') return;
    state.token = String(event.data.token || '');
    document.documentElement.dataset.theme = event.data.theme === 'dark' ? 'dark' : 'light';
});

async function call(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (auth) headers.authorization = `Bearer ${state.token}`;
    const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

function notice(message) {
    const box = $('notice');
    box.textContent = message || '';
    box.hidden = !message;
}

const when = (iso) => {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleString('zh-CN', { hour12: false }).replace(/:\d\d$/, '');
};

function render() {
    const list = $('list');
    list.replaceChildren();
    $('count').textContent = state.notes.length ? `${state.notes.length} 条` : '';

    if (!state.notes.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = '还没有笔记,上面记一条试试';
        list.append(empty);
        return;
    }

    for (const note of state.notes) {
        const item = document.createElement('li');
        item.className = 'item';

        const main = document.createElement('div');
        main.className = 'item-text';
        // textContent 而不是 innerHTML —— 笔记是用户输入,不当 HTML 解释
        const text = document.createElement('div');
        text.textContent = note.text;
        const at = document.createElement('div');
        at.className = 'item-at';
        at.textContent = when(note.created_at);
        main.append(text, at);

        const del = document.createElement('button');
        del.className = 'del';
        del.type = 'button';
        del.textContent = '删除';
        del.onclick = async () => {
            try { await call(`api/notes/${note.id}`, { method: 'DELETE' }); await load(); }
            catch (error) { notice(String(error.message)); }
        };

        item.append(main, del);
        list.append(item);
    }
}

async function load() {
    try {
        notice('');
        state.notes = (await call('api/notes')).notes || [];
        render();
    } catch (error) {
        notice(`读取失败:${error.message}`);
    }
}

$('composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('text');
    const text = input.value.trim();
    if (!text) return;
    try {
        await call('api/notes', { method: 'POST', body: { text } });
        input.value = '';
        await load();
    } catch (error) { notice(`保存失败:${error.message}`); }
});

$('summarize').addEventListener('click', async () => {
    if (state.summarizing) return;
    if (!state.notes.length) { notice('还没有笔记可归纳'); return; }
    if (!state.token) { notice('还没拿到宿主凭证,刷新一下这个应用再试'); return; }

    const button = $('summarize');
    state.summarizing = true;
    button.disabled = true;
    button.textContent = '归纳中…';
    notice('');
    try {
        const data = await call('host/ai/complete', {
            method: 'POST',
            auth: true,
            body: {
                instructions: '你在帮用户归纳便签。用不超过 5 条要点概括,中文,直接输出要点本身,不要开场白。',
                prompt: state.notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n'),
            },
        });
        const box = $('summary');
        box.textContent = data.text || '(模型没有返回内容)';
        box.hidden = false;
    } catch (error) {
        notice(`归纳失败:${error.message}`);
    } finally {
        state.summarizing = false;
        button.disabled = false;
        button.textContent = '让 AI 归纳';
    }
});

void load();
