import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { toast } from '../overlay/toast';
import { Icon } from '../icons/Icon';
import { useShell } from './layout';
import { cycleTheme, useTheme } from '../lib/theme';
import { loadMeta } from '../thread/store';

interface SettingsValue {
    responsesUrl: string;
    apiKey: string;
    model: string;
    instructions: string;
    compactThreshold: string;
    toolOutputLimit: string;
    maxRounds: string;
    compactPrompt: string;
}

const EMPTY: SettingsValue = { responsesUrl: '', apiKey: '', model: '', instructions: '', compactThreshold: '', toolOutputLimit: '', maxRounds: '', compactPrompt: '' };

export function Settings() {
    const [value, setValue] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const theme = useTheme((state) => state.mode);
    const shell = useShell();

    useEffect(() => {
        void api.get<{ settings: Partial<SettingsValue> }>('/api/settings')
            .then((result) => setValue({ ...EMPTY, ...result.settings }))
            .catch((error) => toast(error instanceof Error ? error.message : '设置加载失败'))
            .finally(() => setLoading(false));
    }, []);

    const field = (key: keyof SettingsValue, next: string) => setValue((current) => ({ ...current, [key]: next }));
    const save = async () => {
        if (!value.responsesUrl.trim() || !value.apiKey.trim() || !value.model.trim()) {
            toast('Responses 地址、API Key 和模型不能为空'); return;
        }
        setSaving(true);
        try {
            await api.put('/api/settings', value);
            await loadMeta();
            toast('设置已保存');
        } catch (error) { toast(error instanceof Error ? error.message : '设置保存失败'); }
        finally { setSaving(false); }
    };

    return (
        <section className="settings-page">
            <header className="topbar">
                <button className={`icon-btn menu-btn${shell.collapsed ? ' show' : ''}`} title="展开侧栏" onClick={shell.openSidebar}><Icon name="panel" size={17} /></button>
                <span className="topbar-title">设置</span>
            </header>
            <main className="settings-content"><div className="settings-panel">
                <div className="settings-heading"><h1>设置</h1><p>模型连接与 Agent 行为保存在当前产品的本地数据库中。</p></div>
                {loading ? <div className="sheet-note">正在读取设置…</div> : <>
                <section className="settings-section"><div className="settings-section-title">模型</div><div className="settings-form">
                <label><span>Responses 地址</span><input className="field-input mono" value={value.responsesUrl} placeholder="https://api.openai.com/v1/responses" onChange={(event) => field('responsesUrl', event.target.value)} /></label>
                <label><span>API Key</span><div className="secret-field"><input className="field-input mono" type={showKey ? 'text' : 'password'} value={value.apiKey} placeholder="仅保存在本地数据库" onChange={(event) => field('apiKey', event.target.value)} /><button type="button" onClick={() => setShowKey((show) => !show)}>{showKey ? '隐藏' : '显示'}</button></div></label>
                <label><span>模型</span><input className="field-input mono" value={value.model} placeholder="模型 ID" onChange={(event) => field('model', event.target.value)} /></label>
                </div></section>
                <section className="settings-section"><div className="settings-section-title">Agent</div><div className="settings-form"><label><span>系统提示词</span><textarea className="field-input settings-prompt" rows={8} value={value.instructions} placeholder="定义 Agent 的角色和行为" onChange={(event) => field('instructions', event.target.value)} /></label></div></section>
                <section className="settings-section"><div className="settings-section-title">高级</div><p className="sheet-note">调整长对话和工具结果的处理方式，保存后从下一轮请求生效。</p><div className="settings-form">
                    <label><span>压缩阈值</span><div><input className="field-input" type="number" min={0} max={10000000} step={1} value={value.compactThreshold} onChange={(event) => field('compactThreshold', event.target.value)} /><p className="sheet-note">对话达到此 token 数时生成摘要，0 表示关闭自动压缩。摘要失败会报错。</p></div></label>
                    <label><span>工具结果上限</span><div><input className="field-input" type="number" min={1000} max={1000000} step={1} value={value.toolOutputLimit} onChange={(event) => field('toolOutputLimit', event.target.value)} /><p className="sheet-note">单次工具结果保留的最多字符数，范围 1000–1000000。</p></div></label>
                    <label><span>工具循环</span><div><select className="field-input" value={value.maxRounds === '0' ? 'unlimited' : 'limited'} onChange={(event) => field('maxRounds', event.target.value === 'unlimited' ? '0' : '32')}><option value="limited">限制轮数</option><option value="unlimited">不限制</option></select>{value.maxRounds !== '0' && <input className="field-input" aria-label="最大工具循环轮数" type="number" min={1} max={10000} step={1} value={value.maxRounds} onChange={(event) => field('maxRounds', event.target.value)} />}<p className="sheet-note">每轮对话的模型与工具循环上限；不限制时运行到模型结束或手动停止。</p></div></label>
                    <label><span>压缩提示词</span><textarea className="field-input settings-prompt" rows={10} maxLength={30000} value={value.compactPrompt} onChange={(event) => field('compactPrompt', event.target.value)} /></label>
                </div></section>
                <section className="settings-section"><div className="settings-section-title">界面</div><div className="settings-theme"><span>主题</span><button className="btn btn-quiet" onClick={cycleTheme}>{theme === 'auto' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}</button></div></section>
                </>}
                <div className="settings-actions"><button className="btn btn-accent" disabled={loading || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></div>
            </div></main>
        </section>
    );
}
