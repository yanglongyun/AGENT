// 便签。契约示范:一个文件就是完整的 app —— 自己应答页面、API 和健康检查。
//
// 与宿主的全部约定只有环境变量:监听 PORT,数据写 APP_DATA_DIR,
// 调宿主能力用 HOST_URL + APP_TOKEN(放 Bearer,不进 URL)。
import http from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT) || 0;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.APP_DATA_DIR || process.cwd();
const HOST_URL = process.env.HOST_URL || '';
const APP_TOKEN = process.env.APP_TOKEN || '';

const db = new DatabaseSync(join(DATA_DIR, 'notes.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL);');

const listAll = db.prepare('SELECT id, text, created_at FROM notes ORDER BY id DESC');
const getOne = db.prepare('SELECT id, text, created_at FROM notes WHERE id = ?');
const insert = db.prepare('INSERT INTO notes (text, created_at) VALUES (?, ?)');
const remove = db.prepare('DELETE FROM notes WHERE id = ?');

const json = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
};
const readBody = async (request) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
};

// 页面直接内嵌 —— 契约不关心你有没有构建,这里示范「没有」这一档。
// 注意 /style.css 是根绝对路径:每个 app 有自己的 origin,这样写天然成立。
const PAGE = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>便签</title><link rel="stylesheet" href="/style.css">
</head><body>
<main class="wrap">
    <form id="composer" class="composer">
        <input id="text" class="input" placeholder="记一条…" autocomplete="off" maxlength="4000">
        <button class="btn primary" type="submit">记下</button>
    </form>
    <div class="tools"><button id="summarize" class="btn" type="button">让 AI 归纳</button><span id="count" class="count"></span></div>
    <div id="summary" class="box" hidden></div>
    <div id="notice" class="box warn" hidden></div>
    <ul id="list" class="list"></ul>
</main>
<script type="module" src="/app.js"></script>
</body></html>`;

const CSS = `:root{--fg:#16181d;--dim:#6b7280;--line:#e6e8ec;--accent:#2f6bde;--danger:#d93a3a;--soft:#f6f7f9}
*{box-sizing:border-box}body{margin:0;color:var(--fg);font:14px/1.6 -apple-system,"PingFang SC",system-ui,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:22px 18px 60px}
.composer{display:flex;gap:8px}.input{flex:1;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:9px;font-size:14px}
.input:focus{outline:none;border-color:var(--accent)}
.btn{height:38px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:13px;cursor:pointer}
.btn:hover:not(:disabled){background:var(--soft)}.btn:disabled{opacity:.5}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.tools{display:flex;align-items:center;gap:10px;margin-top:14px}.count{font-size:12px;color:var(--dim)}
.box{margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--soft);font-size:13px;white-space:pre-wrap}
.box.warn{border-color:var(--danger);color:var(--danger);background:#fff}
.list{list-style:none;margin:18px 0 0;padding:0}
.item{display:flex;gap:10px;padding:11px 2px;border-bottom:1px solid var(--line)}
.item-main{flex:1;min-width:0;word-break:break-word}.item-at{font-size:11.5px;color:var(--dim);margin-top:3px}
.del{border:0;background:none;color:var(--dim);cursor:pointer;font-size:12px}.del:hover{color:var(--danger)}
.empty{color:var(--dim);text-align:center;padding:34px 0;font-size:13px}`;

const JS = `const $=(id)=>document.getElementById(id);let notes=[],busy=false;
async function call(path,opt={}){const r=await fetch(path,{...opt,headers:{'content-type':'application/json',...opt.headers}});
const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;}
function notice(m){const b=$('notice');b.textContent=m||'';b.hidden=!m;}
const when=(iso)=>{const t=new Date(iso);return isNaN(t)?'':t.toLocaleString('zh-CN',{hour12:false}).replace(/:\\d\\d$/,'');};
function render(){const list=$('list');list.replaceChildren();$('count').textContent=notes.length?notes.length+' 条':'';
if(!notes.length){const li=document.createElement('li');li.className='empty';li.textContent='还没有笔记,上面记一条试试';list.append(li);return;}
for(const n of notes){const li=document.createElement('li');li.className='item';
const main=document.createElement('div');main.className='item-main';
const t=document.createElement('div');t.textContent=n.text;const at=document.createElement('div');at.className='item-at';at.textContent=when(n.created_at);
main.append(t,at);const del=document.createElement('button');del.className='del';del.type='button';del.textContent='删除';
del.onclick=async()=>{try{await call('/api/notes/'+n.id,{method:'DELETE'});await load();}catch(e){notice(e.message);}};
li.append(main,del);list.append(li);}}
async function load(){try{notice('');notes=(await call('/api/notes')).notes||[];render();}catch(e){notice('读取失败:'+e.message);}}
$('composer').addEventListener('submit',async(ev)=>{ev.preventDefault();const input=$('text');const text=input.value.trim();if(!text)return;
try{await call('/api/notes',{method:'POST',body:JSON.stringify({text})});input.value='';await load();}catch(e){notice('保存失败:'+e.message);}});
$('summarize').addEventListener('click',async()=>{if(busy)return;if(!notes.length){notice('还没有笔记可归纳');return;}
const btn=$('summarize');busy=true;btn.disabled=true;btn.textContent='归纳中…';notice('');
try{const d=await call('/api/summarize',{method:'POST'});$('summary').textContent=d.text||'(模型没有返回内容)';$('summary').hidden=false;}
catch(e){notice('归纳失败:'+e.message);}finally{busy=false;btn.disabled=false;btn.textContent='让 AI 归纳';}});
load();`;

http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const method = request.method || 'GET';
    try {
        if (url.pathname === '/health') { json(response, 200, { ok: true }); return; }
        if (method === 'GET' && url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(PAGE); return; }
        if (method === 'GET' && url.pathname === '/style.css') { response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); response.end(CSS); return; }
        if (method === 'GET' && url.pathname === '/app.js') { response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); response.end(JS); return; }

        if (method === 'GET' && url.pathname === '/api/notes') { json(response, 200, { notes: listAll.all() }); return; }
        if (method === 'POST' && url.pathname === '/api/notes') {
            const text = String((await readBody(request)).text || '').trim().slice(0, 4000);
            if (!text) { json(response, 400, { error: '内容不能为空' }); return; }
            const saved = insert.run(text, new Date().toISOString());
            json(response, 201, { note: getOne.get(Number(saved.lastInsertRowid)) });
            return;
        }
        const match = url.pathname.match(/^\/api\/notes\/(\d+)$/);
        if (method === 'DELETE' && match) { json(response, 200, { deleted: remove.run(Number(match[1])).changes > 0 }); return; }

        // AI 归纳走后端 —— token 在环境变量里,永远不进前端
        if (method === 'POST' && url.pathname === '/api/summarize') {
            const all = listAll.all();
            if (!all.length) { json(response, 400, { error: '还没有笔记' }); return; }
            const upstream = await fetch(`${HOST_URL}/host/ai/complete`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${APP_TOKEN}` },
                body: JSON.stringify({
                    instructions: '你在帮用户归纳便签。用不超过 5 条要点概括,中文,直接输出要点,不要开场白。',
                    prompt: all.map((note, index) => `${index + 1}. ${note.text}`).join('\n'),
                }),
            });
            json(response, upstream.status, await upstream.json());
            return;
        }
        json(response, 404, { error: `没有这个接口:${method} ${url.pathname}` });
    } catch (error) {
        json(response, 500, { error: String(error?.message || error) });
    }
}).listen(PORT, HOST, () => console.log(`[memo] 监听 ${HOST}:${PORT}`));
