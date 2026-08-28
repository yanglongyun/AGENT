// 便签后端。与宿主的全部约定只有三条:
//   1. 监听 process.env.PORT
//   2. /health 能应答
//   3. 数据写进 process.env.APP_DATA_DIR
// 除此之外宿主不关心这里怎么写 —— 它是独立进程,独立依赖。
import http from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT) || 0;
const DATA_DIR = process.env.APP_DATA_DIR || process.cwd();

const db = new DatabaseSync(join(DATA_DIR, 'notes.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);

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
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
};

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const method = request.method || 'GET';
    try {
        if (url.pathname === '/health') { json(response, 200, { ok: true, app: 'notes' }); return; }

        if (url.pathname === '/api/notes' && method === 'GET') {
            json(response, 200, { notes: listAll.all() });
            return;
        }
        if (url.pathname === '/api/notes' && method === 'POST') {
            const text = String((await readBody(request)).text || '').trim().slice(0, 4000);
            if (!text) { json(response, 400, { error: '内容不能为空' }); return; }
            const result = insert.run(text, new Date().toISOString());
            json(response, 201, { note: getOne.get(Number(result.lastInsertRowid)) });
            return;
        }
        const match = url.pathname.match(/^\/api\/notes\/(\d+)$/);
        if (match && method === 'DELETE') {
            json(response, 200, { deleted: remove.run(Number(match[1])).changes > 0 });
            return;
        }
        json(response, 404, { error: `没有这个接口:${method} ${url.pathname}` });
    } catch (error) {
        json(response, 500, { error: String(error?.message || error) });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[notes] 监听 ${PORT},数据目录 ${DATA_DIR}`);
});
