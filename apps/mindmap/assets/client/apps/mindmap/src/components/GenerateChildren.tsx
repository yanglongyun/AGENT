import { useEffect, useRef, useState } from 'react';
import type { Topic } from '../lib/types';

export function GenerateChildren({ mapId, topic, onClose, onGenerated }: {
    mapId: number; topic: Topic; onClose(): void; onGenerated(topics: Topic[]): void;
}) {
    const [count, setCount] = useState(3);
    const [instruction, setInstruction] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => request.current?.abort(), []);

    async function generate() {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/generate', {
                method: 'POST', signal: controller.signal,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ map: mapId, topic: topic.id, count, instruction }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '生成失败');
            onGenerated(result.topics);
        } catch (error) {
            if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '生成失败，请重试');
        } finally { request.current = null; setBusy(false); }
    }

    return <div className="modal-mask" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose(); }}>
        <form className="modal generate-modal" role="dialog" aria-modal="true" aria-labelledby="generate-title" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
            <h2 className="modal-title" id="generate-title">生成子节点</h2>
            <p className="generate-parent">为「{topic.text}」扩展子节点</p>
            <label>生成数量<select value={count} disabled={busy} onChange={(event) => setCount(Number(event.target.value))}>
                {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 个</option>)}
            </select></label>
            <label>生成要求（可选）<textarea autoFocus value={instruction} disabled={busy} maxLength={2000} rows={3} placeholder="例如：从产品、技术和运营三个角度展开" onChange={(event) => setInstruction(event.target.value)} /></label>
            {busy && <p className="generate-hint" role="status">正在生成，可在宿主的任务页查看活动…</p>}
            {error && <p className="generate-error" role="alert">{error}</p>}
            <div className="modal-foot">
                <button type="button" className="btn" onClick={() => { request.current?.abort(); onClose(); }}>{busy ? '取消生成' : '取消'}</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '正在生成…' : '生成'}</button>
            </div>
        </form>
    </div>;
}
