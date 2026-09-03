// 对话:列、建、改、删,以及消息翻页、发消息(起一轮)、停止。
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENTS } from '../../shared/events.js';
import { json, readBody } from './helpers.js';

const isDirectory = (path) => {
    try { return statSync(path).isDirectory(); } catch { return false; }
};

export async function route({ method, path, segments, url, request, response, config, store, turns, files, channel }) {
    /** 校验并归一工作目录;非法时返回 null。 */
    const normalizeWorkdir = (value) => {
        const dir = resolve(String(value || '').trim() || config.workdir);
        return isDirectory(dir) ? dir : null;
    };

    if (method === 'GET' && path === '/api/conversations') {
        json(response, 200, { conversations: store.listConversations() }); return true;
    }
    if (method === 'POST' && path === '/api/conversations') {
        const input = await readBody(request);
        const workdir = normalizeWorkdir(input.workdir);
        if (!workdir) { json(response, 400, { error: '工作目录不存在' }); return true; }
        const conversation = store.createConversation({
            id: crypto.randomUUID(),
            title: String(input.title || '').trim().slice(0, 64) || '新对话',
            workdir,
        });
        channel.broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
        json(response, 201, { conversation }); return true;
    }
    if (segments[1] !== 'conversations' || !segments[2]) return false;

    const id = segments[2];
    const conversation = store.getConversation(id);
    if (!conversation) { json(response, 404, { error: '对话不存在' }); return true; }

    if (method === 'PATCH' && segments.length === 3) {
        const input = await readBody(request);
        if (typeof input.title === 'string') {
            const title = input.title.trim().slice(0, 64);
            if (!title) { json(response, 400, { error: '标题不能为空' }); return true; }
            store.setTitle(id, title);
        }
        if (typeof input.pinned === 'boolean') store.setPinned(id, input.pinned);
        if (typeof input.workdir === 'string') {
            const workdir = normalizeWorkdir(input.workdir);
            if (!workdir) { json(response, 400, { error: '工作目录不存在' }); return true; }
            store.setWorkdir(id, workdir);
        }
        channel.broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
        json(response, 200, { conversation: store.getConversation(id) }); return true;
    }
    if (method === 'DELETE' && segments.length === 3) {
        turns.stop(id);
        const deleted = store.deleteConversation(id);
        channel.broadcast(EVENTS.CONVERSATION_DELETED, { conversationId: id });
        channel.broadcast(EVENTS.CONVERSATIONS_CHANGED, {});
        json(response, 200, { deleted }); return true;
    }
    if (method === 'GET' && segments[3] === 'messages') {
        const before = Number(url.searchParams.get('before')) || 0;
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
        json(response, 200, store.listMessages(id, { before, limit })); return true;
    }
    if (method === 'POST' && segments[3] === 'messages') {
        const input = await readBody(request);
        const content = String(input.content || '').trim();
        const attachments = files.normalizeMany(input.attachments);
        if (!content && !attachments.length) { json(response, 400, { error: '消息不能为空' }); return true; }
        const message = turns.start(conversation, content, attachments, String(input.clientId || ''));
        json(response, 202, { message }); return true;
    }
    if (method === 'POST' && segments[3] === 'stop') {
        json(response, 200, { stopped: turns.stop(id) }); return true;
    }
    return false;
}
