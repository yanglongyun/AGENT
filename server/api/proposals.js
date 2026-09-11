import { json, readBody } from './helpers.js';
import { EVENTS } from '../../shared/events.js';
export async function route({ method, segments, request, response, store, channel }) {
    if (segments[1] !== 'threads' || segments[3] !== 'proposals') return false;
    const thread = segments[2];
    if (method === 'GET' && segments.length === 4) {
        json(response, 200, { proposals: store.listProposals(thread) }); return true;
    }
    if (method === 'POST' && segments.length === 5) {
        const id = Number(segments[4]);
        if (!Number.isSafeInteger(id) || id < 1) { json(response, 400, { error: '无效提议 ID' }); return true; }
        const { answer } = await readBody(request);
        const proposal = store.answerProposal(thread, id, answer);
        channel.broadcast(EVENTS.PROPOSALS_CHANGED, { thread });
        json(response, 200, { proposal }); return true;
    }
    return false;
}
