import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { toast } from '../overlay/toast';
import { Icon } from '../icons/Icon';
import { useShell } from './layout';
import { cycleTheme, useTheme } from '../lib/theme';
import { loadMeta } from '../conversation/store';

interface SettingsValue {
    responsesUrl: string;
    apiKey: string;
    model: string;
    instructions: string;
}

const EMPTY: SettingsValue = { responsesUrl: '', apiKey: '', model: '', instructions: '' };

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
                <section className="settings-section"><div className="settings-section-title">界面</div><div className="settings-theme"><span>主题</span><button className="btn btn-quiet" onClick={cycleTheme}>{theme === 'auto' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}</button></div></section>
                </>}
                <div className="settings-actions"><button className="btn btn-accent" disabled={loading || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></div>
            </div></main>
        </section>
    );
}
