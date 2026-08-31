// 权限档、规则单、待确认卡。
//
// 一条线索:界面上任何地方都不许把「只靠自觉」画成「拦得住」——
// hasGuard 是唯一判据,它直接读编译产物,不做任何美化。
import { create } from 'zustand';
import { EVENTS } from '@shared/events';

import { api } from '../lib/api';
import { onChannel } from '../lib/channel';
import { useConversation } from '../conversation/store';

export type Mode = 'ask' | 'rules' | 'skip';

export const MODES: Mode[] = ['ask', 'rules', 'skip'];
export const MODE_LABELS: Record<Mode, string> = { ask: '逐步确认', rules: '按照规则', skip: '完全跳过' };
export const MODE_NOTES: Record<Mode, string> = {
    ask: '每一次工具调用都停下来问你,一次也不例外',
    rules: '只在你定的这些情况下问你,其余直接放行',
    skip: '不问也不拦,后果自负',
};

export interface RuleMatch { tools: string[]; actions: string[]; paths: string[] }
export interface Rule {
    id: string;
    text: string;
    prompt: string;
    match: RuleMatch;
    enabled: boolean;
    origin: string;
    position: number;
    createdAt: string;
}
export interface Approval {
    id: string;
    conversationId: string;
    /** 'rule' = 规则命中;'consult' = 助理主动提醒。两种卡长得不一样。 */
    source: string;
    tool: string;
    summary: string;
    command: string;
    paths: string[];
    actions: string[];
    reason: string;
    rule: { id: string; text: string } | null;
    at: string;
    // 以下只在 source === 'consult' 时有
    detail?: string;
    risk?: string;
    suggestion?: string;
}

interface State {
    rules: Rule[];
    approvals: Approval[];
    defaultMode: Mode;
    defaultConsult: boolean;
}

export const usePermission = create<State>(() => ({
    rules: [], approvals: [], defaultMode: 'ask', defaultConsult: false,
}));

/** 提醒工具开不开。对话上记的优先,没记就看全局默认。 */
export function useConsult(): boolean {
    const fallback = usePermission((state) => state.defaultConsult);
    const own = useConversation((state) => {
        const found = state.conversations.find((item) => item.id === state.currentId);
        return found?.consult || '';
    });
    return own ? own === 'on' : fallback;
}

export async function setConsult(on: boolean) {
    const value = on ? 'on' : 'off';
    const { currentId, conversations } = useConversation.getState();
    if (currentId) {
        const previous = conversations;
        useConversation.setState({
            conversations: conversations.map((item) => (item.id === currentId ? { ...item, consult: value } : item)),
        });
        try {
            await api.patch(`/api/conversations/${currentId}`, { consult: value });
        } catch (error) {
            useConversation.setState({ conversations: previous });
            throw error;
        }
        return;
    }
    await api.put('/api/settings', { consult: value });
    usePermission.setState({ defaultConsult: on });
}

/** 当前对话停在哪一档;草稿期看全局默认。 */
export function useMode(): Mode {
    const fallback = usePermission((state) => state.defaultMode);
    const own = useConversation((state) => {
        const found = state.conversations.find((item) => item.id === state.currentId);
        return (found?.permission_mode || '') as Mode | '';
    });
    return own || fallback;
}

export async function setMode(mode: Mode) {
    const { currentId, conversations } = useConversation.getState();
    if (currentId) {
        // 先在本地落定。权限控件必须当场回应 —— 等「PATCH → 服务端广播 → 重拉列表」
        // 这三跳,SSE 一抖动(重连、节流)点击就像没生效,而这个控件恰恰不能让人怀疑
        const previous = conversations;
        useConversation.setState({
            conversations: conversations.map((item) => (
                item.id === currentId ? { ...item, permission_mode: mode } : item
            )),
        });
        try {
            await api.patch(`/api/conversations/${currentId}`, { permissionMode: mode });
        } catch (error) {
            useConversation.setState({ conversations: previous }); // 没落库就退回去,不留假象
            throw error;
        }
        return;
    }
    // 还没有对话:改的是「新对话默认用哪一档」
    await api.put('/api/settings', { permissionMode: mode });
    usePermission.setState({ defaultMode: mode });
}

export async function loadPermission() {
    const { currentId } = useConversation.getState();
    const query = currentId ? `?conversationId=${currentId}` : '';
    const [rules, approvals, meta] = await Promise.all([
        api.get<{ rules: Rule[] }>('/api/rules').catch(() => null),
        currentId ? api.get<{ approvals: Approval[] }>(`/api/approvals${query}`).catch(() => null) : null,
        api.get<{ defaultMode: Mode; defaultConsult: string }>('/api/meta').catch(() => null),
    ]);
    usePermission.setState({
        rules: rules?.rules || [],
        approvals: approvals?.approvals || [],
        defaultMode: meta?.defaultMode || 'ask',
        defaultConsult: meta?.defaultConsult === 'on',
    });
}

export function watchPermission() {
    return onChannel((type, data) => {
        if (type === EVENTS.RULES_CHANGED) { void loadPermission(); return; }
        const { currentId } = useConversation.getState();
        if (type === EVENTS.APPROVAL_ASK) {
            const card = data as unknown as Approval;
            if (card.conversationId !== currentId) return;
            usePermission.setState((state) => ({ ...state, approvals: [...state.approvals, card] }));
            return;
        }
        if (type === EVENTS.APPROVAL_DONE) {
            const { id } = data as { id: string };
            usePermission.setState((state) => ({ ...state, approvals: state.approvals.filter((item) => item.id !== id) }));
        }
    });
}

export const answerApproval = (id: string, answer: 'allow' | 'deny') =>
    api.post(`/api/approvals/${id}`, { answer });

export const createRule = (body: Record<string, unknown>) =>
    api.post<{ rule: Rule; note: string; compiled: boolean }>('/api/rules', body);

export const patchRule = (id: string, body: Record<string, unknown>) =>
    api.patch<{ rule: Rule; note: string; compiled: boolean }>(`/api/rules/${id}`, body);

export const removeRule = (id: string) => api.del(`/api/rules/${id}`);

export const reorderRules = (ids: string[]) => api.post('/api/rules/reorder', { ids });

