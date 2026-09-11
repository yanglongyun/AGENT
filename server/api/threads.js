// 用户只创建聊天；任务由 Apps 建档，界面可以查看和取消。
import { EVENTS } from '../../shared/events.js';
import { json, readBody } from './helpers.js';

export async function route({ method, path, segments, url, request, response, store, turns, files, channel }) {
    if (['/api/chats', '/api/tasks'].includes(path)) {
        const task = path === '/api/tasks';
        if (method === 'GET') {
            json(response, 200, task ? { tasks: store.listTasks() } : { chats: store.listChats() }); return true;
        }
        if (method === 'POST') {
            if (task) { json(response, 405, { error: '任务只能由 Apps 创建' }); return true; }
            const input = await readBody(request);
            if (input.rules !== undefined && (typeof input.rules !== 'string' || input.rules.length > 20000)) { json(response, 400, { error: '规则必须是文本，最多 20000 字' }); return true; }
            const thread = store.createThread({ type: 'chat', rules: input.rules || '', title: String(input.title || '').trim().slice(0, 64) || '新对话' });
            channel.broadcast(EVENTS.THREADS_CHANGED, {});
            json(response, 201, { thread }); return true;
        }
    }
    if (segments[1] !== 'threads' || !segments[2]) return false;
    const id = segments[2];
    const thread = store.getThread(id);
    if (!thread) { json(response, 404, { error: '聊天或任务不存在' }); return true; }
    if (segments.length === 3) {
        if (method === 'GET') { json(response, 200, { thread }); return true; }
        if (method === 'PATCH') {
            const input = await readBody(request);
            const title = typeof input.title === 'string' ? input.title.trim().slice(0, 64) : undefined;
            if (title === '') { json(response, 400, { error: '标题不能为空' }); return true; }
            if (input.pinned !== undefined && (thread.type !== 'chat' || typeof input.pinned !== 'boolean')) {
                json(response, 400, { error: '置顶仅支持聊天，且必须为布尔值' }); return true;
            }
            if (input.rules !== undefined && (thread.type !== 'chat' || typeof input.rules !== 'string' || input.rules.length > 20000)) {
                json(response, 400, { error: '规则仅支持聊天，必须是文本且不超过 20000 字' }); return true;
            }
            if (input.status !== undefined) {
                if (thread.type !== 'task' || input.status !== 'cancelled') {
                    json(response, 400, { error: '任务由 Apps 执行，用户只能取消任务' }); return true;
                }
                await turns.stopAndWait(id);
                store.setStatus(id, input.status);
            }
            if (input.rules !== undefined) store.setRules(id, input.rules);
            if (title !== undefined) store.setTitle(id, title);
            if (typeof input.pinned === 'boolean') store.setPinned(id, input.pinned);
            channel.broadcast(EVENTS.THREADS_CHANGED, {});
            json(response, 200, { thread: store.getThread(id) }); return true;
        }
        if (method === 'DELETE') {
            await turns.stopAndWait(id);
            const deleted = store.deleteThread(id);
            channel.broadcast(EVENTS.THREAD_DELETED, { thread: id });
            channel.broadcast(EVENTS.THREADS_CHANGED, {});
            json(response, 200, { deleted }); return true;
        }
    }
    if (segments.length !== 4) return false;
    if (method === 'GET' && segments[3] === 'messages') {
        const before = Number(url.searchParams.get('before')) || 0;
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
        if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(limit)) {
            json(response, 400, { error: '分页参数必须是整数' }); return true;
        }
        json(response, 200, store.listMessages(id, { before, limit })); return true;
    }
    if (method === 'POST' && segments[3] === 'messages') {
        if (thread.type === 'task') { json(response, 405, { error: '任务消息由 Apps 产生，不接受用户发送或继续执行' }); return true; }
        const input = await readBody(request);
        const content = String(input.content || '').trim();
        const attachments = files.normalizeMany(input.attachments);
        if (!content && !attachments.length) { json(response, 400, { error: '消息不能为空' }); return true; }
        const { message } = turns.start(thread, content, attachments, String(input.clientId || ''));
        json(response, 202, { message }); return true;
    }
    if (method === 'POST' && segments[3] === 'stop') {
        json(response, 200, { stopped: turns.stop(id) }); return true;
    }
    return false;
}
