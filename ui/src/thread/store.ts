// 对话状态与动作。
//
// currentId 为空 = 空白草稿:不落库不进列表,发首条消息那刻才真正建对话 ——
// 侧栏不会攒出一排空的「新对话」。行数组是可变结构,流式直接改行,tick 触发重渲染。
import { create } from 'zustand';
import { EVENTS } from '@shared/events';

import { api, ApiError } from '../lib/api';
import { connectChannel, onChannel, useChannel, type ChannelEvent } from '../lib/channel';
import { toast } from '../overlay/toast';
import { mkKey, renderMessages, type Attachment, type RawMessage, type Row } from './thread';
import { setupStream } from './stream';

export interface Thread {
    id: string;
    title: string;
    pinned?: number;
    type: 'chat' | 'task';
    rules?: string;
    status?: string;
    finished?: string | null;
    created: string;
    updated: string;
}

export interface Meta {
    model: string;
    version: string;
}

export function getDraftRules() { try { return localStorage.getItem('agent.draft.rules') || ''; } catch { return ''; } }
export function setDraftRules(rules: string) { try { localStorage.setItem('agent.draft.rules', rules); } catch { /* unavailable */ } }

const ID_KEY = 'agent.thread';
const PAGE = 60;

// null = 从没记过,回到最近对话;'' = 用户明确停在草稿,恢复草稿
const loadId = (): string | null => { try { return localStorage.getItem(ID_KEY); } catch { return null; } };
const saveId = (id: string) => { try { localStorage.setItem(ID_KEY, id); } catch { /* ignore */ } };

interface ThreadState {
    threads: Thread[];
    currentId: string;
    meta: Meta;
    liveIds: string[];

    /** 可变数组:流式直接改行,靠 tick 触发重渲染。 */
    rows: Row[];
    busy: boolean;
    stopping: boolean;
    ready: boolean;
    tick: number;
    /** 自增 = 把视口拉回底部。 */
    viewSeq: number;
    hasMore: boolean;
    loadingOlder: boolean;
}

export const useThread = create<ThreadState>(() => ({
    threads: [],
    currentId: '',
    meta: { model: '', version: '' },
    liveIds: [],
    rows: [],
    busy: false,
    stopping: false,
    ready: false,
    tick: 0,
    viewSeq: 0,
    hasMore: false,
    loadingOlder: false,
}));

const set = useThread.setState;
const get = useThread.getState;

let stream: ReturnType<typeof setupStream> | null = null;
let bound = false;
let oldestId = 0;
let lastSig = '';

const bump = () => set((state) => ({ tick: state.tick + 1 }));
const pushRow = (row: Row) => { get().rows.push(row); return row; };

function rebuildStream() {
    stream?.close();
    const id = get().currentId;
    stream = id
        ? setupStream({
            thread: id,
            getRows: () => get().rows,
            pushRow,
            setBusy: (busy) => set({ busy, ...(busy ? {} : { stopping: false }) }),
            bump,
        })
        : null;
}

function bind() {
    if (bound) return;
    bound = true;

    // 断线重连:补上断线期间漏掉的消息和状态。首次连接不刷 —— init 刚拉过,再刷只会闪一下
    let hadConnected = false;
    useChannel.subscribe((state) => {
        if (!state.connected) return;
        if (!hadConnected) { hadConnected = true; return; }
        void loadThreads();
        void loadRuns();
        void refresh({ keepView: true });
    });

    onChannel((type, event: ChannelEvent) => {
        stream?.onEvent(type, event);

        const id = String(event.thread || '');
        const ENDED = [EVENTS.DONE, EVENTS.ABORTED, EVENTS.ERROR] as string[];
        // 呼吸点跟事件走,任何对话的都算 —— 切走之后它还活着,侧栏那行得替它说话
        if (id && type === EVENTS.START && !get().liveIds.includes(id)) {
            set((state) => ({ liveIds: [...state.liveIds, id] }));
        }
        if (id && ENDED.includes(type)) {
            set((state) => ({ liveIds: state.liveIds.filter((value) => value !== id) }));
        }

        if (type === EVENTS.THREADS_CHANGED) void loadThreads();
        if (type === EVENTS.THREAD_DELETED && id === get().currentId) {
            void (async () => {
                await loadThreads();
                const next = get().threads[0]?.id;
                set({ currentId: '' });
                if (next) await openThread(next);
                else createDraft();
            })();
        }
    });
}

export async function loadMeta() {
    const meta = await api.get<Meta>('/api/meta').catch(() => null);
    if (meta) set({ meta });
}

export async function loadThreads() {
    const [chats, tasks] = await Promise.all([
        api.get<{ chats: Thread[] }>('/api/chats').catch(() => null),
        api.get<{ tasks: Thread[] }>('/api/tasks').catch(() => null),
    ]);
    if (!chats || !tasks) return false;
    set({ threads: [
        ...chats.chats.map((item) => ({ ...item, type: 'chat' as const })),
        ...tasks.tasks.map((item) => ({ ...item, type: 'task' as const })),
    ] });
    return true;
}

/** 谁还在跑。失败当成都没有 —— 少画一个点,好过网络一抖整列都亮。 */
export async function loadRuns() {
    const data = await api.get<{ ids: string[] }>('/api/turns').catch(() => null);
    if (!data) return;
    set({ liveIds: data.ids || [] });
    const id = get().currentId;
    if (id) set({ busy: data.ids.includes(id) });
}

/** 入口:连通道 → 拉列表 → 恢复上次停留(草稿或某段对话)。 */
export async function init() {
    bind();
    connectChannel();
    void loadMeta();
    await loadThreads();
    let id = loadId();
    if (id === null) id = get().threads[0]?.id || '';
    else if (id && !get().threads.some((item) => item.id === id)) id = get().threads[0]?.id || '';
    if (!id) { createDraft(); return; }
    set({ currentId: id });
    rebuildStream();
    void loadRuns();
    await refresh();
}

/** 切换对话或断线重连时补拉历史；正常回答完成不刷新列表。 */
export async function refresh({ keepView = false }: { keepView?: boolean } = {}) {
    const id = get().currentId;
    if (!id) return;
    const data = await api
        .get<{ messages: RawMessage[]; hasMore: boolean }>(`/api/threads/${id}/messages?limit=${PAGE}`)
        .catch(() => null);
    if (!data || id !== get().currentId) return; // 期间切走了,丢弃

    const raw = data.messages || [];
    // 指纹没变就跳过整体替换,避免无谓重渲染;有行还在流式时不替换
    const sig = `${raw.length}:${raw[0]?.id || 0}:${raw[raw.length - 1]?.id || 0}`;
    if (get().ready && sig === lastSig && !get().rows.some((row) => row.streaming)) return;
    // 真在跑才护着直播行;不在跑还挂着 streaming 的是残骸(比如服务重启),照常替换
    if (get().busy && keepView && get().rows.some((row) => row.streaming)) return;
    lastSig = sig;
    oldestId = raw[0]?.id || 0;

    const next = renderMessages(raw);
    // 同位置同类的行复用旧 key:React 原地复用 DOM,不整屏重挂
    const prev = get().rows;
    for (let i = 0; i < next.length && i < prev.length; i++) {
        if (next[i].kind === prev[i].kind) next[i].key = prev[i].key;
    }
    set((state) => ({
        rows: next,
        ready: true,
        hasMore: Boolean(data.hasMore),
        viewSeq: keepView ? state.viewSeq : state.viewSeq + 1,
    }));
    bump();
}

/** 上滑加载更早一页:往头部插入。 */
export async function loadOlder() {
    const { hasMore, loadingOlder, currentId } = get();
    if (!hasMore || loadingOlder || !oldestId || !currentId) return;
    set({ loadingOlder: true });
    try {
        const data = await api
            .get<{ messages: RawMessage[]; hasMore: boolean }>(
                `/api/threads/${currentId}/messages?limit=${PAGE}&before=${oldestId}`,
            )
            .catch(() => null);
        if (currentId !== get().currentId) return;
        const raw = data?.messages || [];
        if (!raw.length) { set({ hasMore: false }); return; }
        oldestId = raw[0].id;
        set({ rows: [...renderMessages(raw), ...get().rows], hasMore: Boolean(data?.hasMore) });
        bump();
    } finally {
        set({ loadingOlder: false });
    }
}

/** 切对话。正在跑的那段不打断 —— 轮子在服务端,切走它继续转,呼吸点替它说话。 */
export async function openThread(id: string) {
    if (!id || id === get().currentId) return;
    set((state) => ({
        currentId: id, rows: [], ready: false, hasMore: false,
        busy: state.liveIds.includes(id), stopping: false,
    }));
    saveId(id);
    oldestId = 0;
    lastSig = '';
    rebuildStream();
    void loadRuns(); // live 集合可能是十秒前的,切完对一次账
    await refresh();
}

/** 新对话 = 本地空白草稿。 */
export function createDraft() {
    set((state) => ({
        currentId: '', rows: [], ready: true, hasMore: false,
        busy: false, stopping: false,
        viewSeq: state.viewSeq + 1,
    }));
    saveId('');
    oldestId = 0;
    lastSig = '';
    rebuildStream();
    bump();
}

export async function send(text: string, attachments: Attachment[] = [], retryRow: Row | null = null) {
    const current = get().threads.find((item) => item.id === get().currentId);
    if (current?.type === 'task') return;
    const content = text.trim();
    if ((!content && !attachments.length) || get().busy) return;

    const row = retryRow || pushRow({
        key: mkKey('u'), kind: 'user', content,
        attachments, clientId: crypto.randomUUID(), sending: true, failed: false, at: Date.now(),
    });
    row.clientId ||= crypto.randomUUID();
    row.sending = true;
    row.failed = false;
    set((state) => ({ busy: true, stopping: false, viewSeq: state.viewSeq + 1 }));
    bump();

    const fail = (message?: string) => {
        row.sending = false;
        row.failed = true;
        set({ busy: false });
        bump();
        if (message) toast(message);
    };

    // 草稿的首条消息:此刻才真正建对话
    if (!get().currentId) {
        const created = await api
            .post<{ thread: Thread }>('/api/chats', { rules: getDraftRules() })
            .catch((error: unknown) => { fail(error instanceof Error ? error.message : '创建对话失败'); return null; });
        if (!created?.thread) return;
        set((state) => ({
            threads: [created.thread, ...state.threads],
            currentId: created.thread.id,
        }));
        setDraftRules('');
        saveId(created.thread.id);
        rebuildStream();
    }

    const id = get().currentId;
    try {
        await api.post(`/api/threads/${id}/messages`, { content, attachments: row.attachments, clientId: row.clientId });
        row.sending = false;
        if (!get().liveIds.includes(id)) set((state) => ({ liveIds: [...state.liveIds, id] }));
        bump();
    } catch (error) {
        if (error instanceof ApiError && error.status === 409) fail('这个对话正在运行,等它跑完再发');
        else fail(error instanceof Error ? error.message : '发送失败');
    }
}

export const retrySend = (row: Row) => (row.failed ? send(row.content || '', row.attachments || [], row) : undefined);

export function stopRun() {
    const { busy, stopping, currentId } = get();
    if (!busy || stopping || !currentId) return;
    set({ stopping: true });
    void api.post(`/api/threads/${currentId}/stop`).catch(() => set({ stopping: false }));
}

export async function renameThread(id: string, title: string) {
    await api.patch(`/api/threads/${id}`, { title }).catch(() => toast('重命名失败'));
    await loadThreads();
}

export async function togglePinned(thread: Thread) {
    await api.patch(`/api/threads/${thread.id}`, { pinned: !thread.pinned }).catch(() => null);
    await loadThreads();
}

export async function removeThread(id: string) {
    const removed = await api.del<{ deleted: boolean }>(`/api/threads/${id}`).catch(() => null);
    if (!removed) { toast('删除失败'); return; }
    await loadThreads();
    if (id !== get().currentId) return;
    set({ currentId: '' }); // 保证 openThread 不被同 id 短路
    const next = get().threads[0]?.id;
    if (next) await openThread(next);
    else createDraft();
}

export async function cancelTask(id: string) {
    await api.patch(`/api/threads/${id}`, { status: 'cancelled' }).catch((error: unknown) => toast(error instanceof Error ? error.message : '取消失败'));
    await loadThreads();
}
