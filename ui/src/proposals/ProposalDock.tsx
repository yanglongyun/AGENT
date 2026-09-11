import { useEffect, useState } from 'react';
import { EVENTS } from '@shared/events';
import { api } from '../lib/api';
import { onChannel, useChannel } from '../lib/channel';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import { useThread } from '../thread/store';
import { seedDraft } from '../thread/draft';
import './proposals.css';

type Proposal = { id: number; thread: string; kind: 'rule' | 'prompt'; summary: string; detail: string; text: string };
export function ProposalDock() {
    const thread = useThread((state) => state.currentId);
    return thread ? <ThreadProposals key={thread} thread={thread} /> : null;
}
function ThreadProposals({ thread }: { thread: string }) {
    const [cards, setCards] = useState<Proposal[]>([]);
    const [opened, setOpened] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const connected = useChannel((state) => state.connected);
    const [revision, setRevision] = useState(0);
    useEffect(() => onChannel((type, data) => {
        if (type === EVENTS.PROPOSALS_CHANGED && data.thread === thread) setRevision((value) => value + 1);
    }), [thread]);
    useEffect(() => {
        let alive = true;
        void api.get<{ proposals: Proposal[] }>(`/api/threads/${thread}/proposals`).then(({ proposals }) => {
            if (alive) { setCards(proposals); setError(''); }
        }).catch(() => { if (alive) setError('提议加载失败'); });
        return () => { alive = false; };
    }, [thread, connected, revision]);
    async function answer(card: Proposal, choice: 'accept' | 'ignore') {
        if (busy) return;
        setBusy(true);
        try {
            await api.post(`/api/threads/${thread}/proposals/${card.id}`, { answer: choice });
            if (choice === 'accept' && card.kind === 'prompt') {
                const key = `agent.draft:${thread}`;
                const existing = localStorage.getItem(key) || '';
                const text = [existing, card.text].filter(Boolean).join('\n\n');
                localStorage.setItem(key, text);
                if (useThread.getState().currentId === thread) seedDraft(text);
            }
            setCards((items) => items.filter((item) => item.id !== card.id));
            setOpened(null);
            toast(choice === 'ignore' ? '已忽略' : card.kind === 'rule' ? '已追加到本对话规则' : '已填入输入框，尚未发送');
        } catch (error) {
            toast(error instanceof Error ? error.message : '处理失败');
            setRevision((value) => value + 1);
        } finally { setBusy(false); }
    }
    const actions = (card: Proposal) => <div className="proposal-actions">
        <button className="btn btn-quiet" disabled={busy} onClick={() => void answer(card, 'accept')}>同意</button>
        <button className="btn btn-quiet" disabled={busy} onClick={() => void answer(card, 'ignore')}>忽略</button>
    </div>;
    const selected = cards.find((card) => card.id === opened);
    return <>
        {error && <button className="proposal-retry" onClick={() => setRevision((value) => value + 1)}>{error}，点击重试</button>}
        {!!cards.length && <div className="proposal-dock">{cards.map((card) => <div className="proposal-card" key={card.id}>
            <button className="proposal-summary" onClick={() => setOpened(card.id)} title="展开提议详情"><span>{card.kind === 'rule' ? '规则提议' : '提议'}</span><strong className="clip">{card.summary}</strong></button>
            {actions(card)}
        </div>)}</div>}
        {selected && <Sheet title="提议详情" onClose={() => setOpened(null)}>
            <div className="proposal-detail"><h3>{selected.summary}</h3><p>{selected.detail}</p><pre>{selected.text}</pre>
                <p className="proposal-effect">{selected.kind === 'rule' ? '同意后追加到本对话规则，从下一轮对话生效。' : '同意后填入输入框，由你确认发送。'}</p>
                {actions(selected)}<button className="btn btn-quiet" onClick={() => setOpened(null)}>关闭</button>
            </div>
        </Sheet>}
    </>;
}
