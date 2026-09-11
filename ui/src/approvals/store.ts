// 独立确认卡：不依赖规则、提议或额外数据库表。
import { create } from 'zustand';
import { EVENTS } from '@shared/events';
import { api } from '../lib/api';
import { onChannel, useChannel } from '../lib/channel';
import { useThread } from '../thread/store';

interface Approval {
    id: string;
    thread: string;
    summary: string;
    detail: string;
    risk: string;
    at: string;
}
export const useApprovals = create<{ approvals: Approval[] }>(() => ({ approvals: [] }));
export async function loadApprovals() {
    const id = useThread.getState().currentId;
    const result = id ? await api.get<{ approvals: Approval[] }>(`/api/approvals?thread=${encodeURIComponent(id)}`).catch(() => null) : null;
    if (id !== useThread.getState().currentId) return;
    useApprovals.setState({ approvals: result?.approvals || [] });
}
export function watchApprovals() {
    const disconnect = onChannel((type, data) => {
        if (type === EVENTS.APPROVAL_ASK) {
            const card = data as unknown as Approval;
            if (card.thread !== useThread.getState().currentId) return;
            useApprovals.setState((state) => ({ approvals: [...state.approvals.filter((item) => item.id !== card.id), card] }));
        } else if (type === EVENTS.APPROVAL_DONE) {
            useApprovals.setState((state) => ({ approvals: state.approvals.filter((item) => item.id !== data.id) }));
        }
    });
    const unsubscribe = useChannel.subscribe((state, previous) => {
        if (state.connected && !previous.connected) void loadApprovals();
    });
    return () => { disconnect(); unsubscribe(); };
}
export const answerApproval = (id: string, answer: 'allow' | 'deny') => api.post(`/api/approvals/${id}`, { answer });
