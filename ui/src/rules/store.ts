// 规则单、总开关、待确认的 confirm 卡、待决定的提议。
import { create } from 'zustand';
import { EVENTS } from '@shared/events';

import { api } from '../lib/api';
import { onChannel } from '../lib/channel';
import { useConversation } from '../conversation/store';

export interface Rule {
    id: string;
    text: string;
    enabled: boolean;
    position: number;
    createdAt: string;
}
export interface Approval {
    id: string;
    conversationId: string;
    summary: string;
    detail: string;
    risk: string;
    at: string;
}
export interface Proposal {
    id: string;
    conversationId: string;
    kind: 'rule' | 'prompt';
    text: string;
    /** 要改的规则 id;空 = 新增。 */
    replaces: string;
    replacesText: string;
    createdAt: string;
}

interface State {
    rulesEnabled: boolean;
    rules: Rule[];
    approvals: Approval[];
    proposals: Proposal[];
}

export const useRules = create<State>(() => ({ rulesEnabled: true, rules: [], approvals: [], proposals: [] }));

export async function setRulesEnabled(on: boolean) {
    const previous = useRules.getState().rulesEnabled;
    useRules.setState({ rulesEnabled: on });
    try {
        await api.put('/api/settings', { rulesEnabled: on ? 'on' : 'off' });
    } catch (error) {
        useRules.setState({ rulesEnabled: previous });
        throw error;
    }
}

export async function loadRules() {
    const { currentId } = useConversation.getState();
    const query = `?conversationId=${currentId}`;
    const [rules, approvals, proposals, meta] = await Promise.all([
        api.get<{ rules: Rule[] }>('/api/rules').catch(() => null),
        currentId ? api.get<{ approvals: Approval[] }>(`/api/approvals${query}`).catch(() => null) : null,
        currentId ? api.get<{ proposals: Proposal[] }>(`/api/proposals${query}`).catch(() => null) : null,
        api.get<{ rulesEnabled: string }>('/api/meta').catch(() => null),
    ]);
    useRules.setState({
        rules: rules?.rules || [],
        approvals: approvals?.approvals || [],
        proposals: proposals?.proposals || [],
        rulesEnabled: (meta?.rulesEnabled || 'on') === 'on',
    });
}

export function watchRules() {
    return onChannel((type, data) => {
        if (type === EVENTS.RULES_CHANGED) { void loadRules(); return; }
        const { currentId } = useConversation.getState();
        if (type === EVENTS.APPROVAL_ASK) {
            const card = data as unknown as Approval;
            if (card.conversationId !== currentId) return;
            useRules.setState((state) => ({ ...state, approvals: [...state.approvals, card] }));
            return;
        }
        if (type === EVENTS.APPROVAL_DONE) {
            const { id } = data as { id: string };
            useRules.setState((state) => ({ ...state, approvals: state.approvals.filter((item) => item.id !== id) }));
            return;
        }
        if (type === EVENTS.PROPOSAL_ASK) {
            const card = data as unknown as Proposal;
            if (card.conversationId !== currentId) return;
            // 同一条规则的再次提议覆盖前一次
            useRules.setState((state) => ({
                ...state,
                proposals: [...state.proposals.filter((item) => !(card.replaces && item.replaces === card.replaces)), card],
            }));
            return;
        }
        if (type === EVENTS.PROPOSAL_DONE) {
            const { id } = data as { id: string };
            useRules.setState((state) => ({ ...state, proposals: state.proposals.filter((item) => item.id !== id) }));
        }
    });
}

export const answerApproval = (id: string, answer: 'allow' | 'deny') =>
    api.post(`/api/approvals/${id}`, { answer });

export const acceptProposal = (id: string, text?: string) =>
    api.post(`/api/proposals/${id}/accept`, text === undefined ? {} : { text });

export const dismissProposal = (id: string) => api.del(`/api/proposals/${id}`);

export const createRule = (text: string) => api.post<{ rule: Rule }>('/api/rules', { text });

export const patchRule = (id: string, body: { text?: string; enabled?: boolean }) =>
    api.patch<{ rule: Rule }>(`/api/rules/${id}`, body);

export const removeRule = (id: string) => api.del(`/api/rules/${id}`);

export const reorderRules = (ids: string[]) => api.post('/api/rules/reorder', { ids });
