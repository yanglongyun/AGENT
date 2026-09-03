// 提议:列出还挂着的,点勾落库,点叉丢掉。
import { EVENTS } from '../../shared/events.js';
import { json, readBody } from './helpers.js';

export async function route({ method, path, segments, url, request, response, store, channel }) {
    if (method === 'GET' && path === '/api/proposals') {
        json(response, 200, { proposals: store.listProposals(url.searchParams.get('conversationId') || '') });
        return true;
    }
    if (segments[1] !== 'proposals' || !segments[2]) return false;

    const proposal = store.getProposal(segments[2]);
    if (!proposal) { json(response, 404, { error: '提议不存在' }); return true; }
    // 点勾。rule 落进规则表(用户可能先改了原文);prompt 只是撤下 —— 填输入框是界面自己的事
    if (method === 'POST' && segments[3] === 'accept') {
        const input = await readBody(request);
        const text = typeof input.text === 'string' ? input.text.trim() : proposal.text;
        if (proposal.kind === 'rule') {
            if (proposal.replaces && !text) store.deleteRule(proposal.replaces);
            else if (proposal.replaces && store.getRule(proposal.replaces)) store.updateRule(proposal.replaces, { text });
            else if (text) store.createRule({ id: crypto.randomUUID(), text });
            channel.broadcast(EVENTS.RULES_CHANGED, {});
        }
        store.deleteProposal(proposal.id);
        channel.broadcast(EVENTS.PROPOSAL_DONE, { id: proposal.id, conversationId: proposal.conversationId, accepted: true });
        json(response, 200, { accepted: true }); return true;
    }
    if (method === 'DELETE' && segments.length === 3) {
        store.deleteProposal(proposal.id);
        channel.broadcast(EVENTS.PROPOSAL_DONE, { id: proposal.id, conversationId: proposal.conversationId, accepted: false });
        json(response, 200, { deleted: true }); return true;
    }
    return false;
}
