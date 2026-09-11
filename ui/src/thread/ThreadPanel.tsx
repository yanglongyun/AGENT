import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { api } from '../lib/api';
import { toast } from '../overlay/toast';
import { getDraftRules, setDraftRules, type Thread } from './store';

export function ThreadPanel({ id, onClose }: { id: string; onClose(): void }) {
    const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 900px)');
        const update = () => setMobile(query.matches);
        query.addEventListener('change', update);
        update();
        return () => query.removeEventListener('change', update);
    }, []);
    const [instructions, setInstructions] = useState('');
    const [rules, setRules] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState('');
    useEffect(() => {
        let alive = true;
        void Promise.all([
            api.get<{ settings: { instructions?: string } }>('/api/settings'),
            id ? api.get<{ thread: Thread }>(`/api/threads/${id}`) : Promise.resolve({ thread: { rules: getDraftRules() } }),
        ]).then(([global, local]) => {
            if (alive) { setInstructions(global.settings.instructions || ''); setRules(local.thread.rules || ''); }
        }).catch((error) => { if (alive) setError(error.message || '加载失败'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [id]);
    useEffect(() => {
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', escape);
        return () => window.removeEventListener('keydown', escape);
    }, [onClose]);
    async function save(section: 'global' | 'rules') {
        setSaving(section);
        try {
            if (section === 'global') await api.put('/api/settings', { instructions });
            else if (id) await api.patch(`/api/threads/${id}`, { rules });
            else setDraftRules(rules);
            toast(section === 'global' ? '全局提示词已保存' : '本对话规则已保存');
        } catch (error) { toast(error instanceof Error ? error.message : '保存失败'); }
        finally { setSaving(''); }
    }
    return <div className="thread-panel-veil" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <aside className="thread-panel" role={mobile ? 'dialog' : 'complementary'} aria-modal={mobile ? true : undefined} aria-label="对话配置">
            <header className="topbar"><strong>对话面板</strong><span className="grow" /><button className="icon-btn" aria-label="关闭对话配置" onClick={onClose}><Icon name="x" size={17} /></button></header>
            <div className="thread-panel-body">
                {loading ? <p>正在加载…</p> : error ? <p role="alert">{error}</p> : <>
                    <section><h2>全局提示词</h2><p>所有对话共用，修改后从下一次请求生效。</p>
                        <textarea className="field-input" aria-label="全局提示词" rows={8} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
                        <button className="btn btn-quiet" disabled={!!saving} onClick={() => void save('global')}>{saving === 'global' ? '保存中…' : '保存全局提示词'}</button>
                    </section>
                    <section><h2>本对话规则</h2><p>只用于当前对话，和全局提示词一起生效。{!id && '发送首条消息时随对话保存。'}</p>
                        <textarea className="field-input" aria-label="本对话规则" rows={8} maxLength={20000} placeholder="在这里写下本对话需要遵守的规则" value={rules} onChange={(event) => setRules(event.target.value)} />
                        <button className="btn btn-quiet" disabled={!!saving} onClick={() => void save('rules')}>{saving === 'rules' ? '保存中…' : '保存本对话规则'}</button>
                    </section>
                </>}
            </div>
        </aside>
    </div>;
}
