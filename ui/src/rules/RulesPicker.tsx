// 输入框上的规则标:总开关 + 就地管规则。
//
// 规则就是一句话,原样进系统提示词,靠模型遵守;要问的时候它调 confirm 停下来。
// 没有硬闸,界面上也不假装有。一张全局的单子,没有分组。
import { useEffect, useState } from 'react';

import { Icon } from '../icons/Icon';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import {
    createRule, loadRules, patchRule, removeRule, reorderRules, setRulesEnabled, useRules, type Rule,
} from './store';
import { useConversation } from '../conversation/store';

interface ItemProps {
    rule: Rule;
    canUp: boolean;
    canDown: boolean;
    onMove: (delta: number) => void;
}

function RuleItem({ rule, canUp, canDown, onMove }: ItemProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(rule.text);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => { setDraft(rule.text); }, [rule.text]);

    const save = async () => {
        const text = draft.trim();
        if (!text || saving) return;
        setSaving(true);
        try {
            await patchRule(rule.id, { text });
            await loadRules();
            setEditing(false);
        } catch (error) {
            toast(`没能保存:${(error as Error).message}`);
        } finally { setSaving(false); }
    };

    if (editing) {
        return (
            <div className="rule rule-edit">
                <input
                    className="field-input"
                    value={draft}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void save(); }}
                />
                <div className="rule-edit-bar">
                    <span className="grow" />
                    <button className="btn btn-quiet" onClick={() => { setEditing(false); setDraft(rule.text); }}>取消</button>
                    <button className="btn btn-accent" disabled={saving || !draft.trim()} onClick={() => void save()}>保存</button>
                </div>
            </div>
        );
    }

    return (
        <div className={`rule${rule.enabled ? '' : ' off'}`}>
            <div className="rule-head">
                <button
                    className={`rule-switch${rule.enabled ? ' on' : ''}`}
                    title={rule.enabled ? '已启用,点击停用' : '已停用,点击启用'}
                    onClick={() => void patchRule(rule.id, { enabled: !rule.enabled }).then(loadRules)}
                />
                <span className="rule-text clip" title={rule.text}>{rule.text}</span>

                {confirming ? (
                    <span className="rule-confirm">
                        <span>删除这条?</span>
                        <button className="link" onClick={() => setConfirming(false)}>取消</button>
                        <button className="link danger" onClick={() => void removeRule(rule.id).then(loadRules)}>删除</button>
                    </span>
                ) : (
                    <span className="rule-ops">
                        <button className="op" title="上移" disabled={!canUp} onClick={() => onMove(-1)}><Icon name="up" size={12} /></button>
                        <button className="op" title="下移" disabled={!canDown} onClick={() => onMove(1)}><Icon name="down" size={12} /></button>
                        <button className="op" title="编辑" onClick={() => setEditing(true)}><Icon name="pen" size={13} /></button>
                        <button className="op danger" title="删除" onClick={() => setConfirming(true)}><Icon name="trash" size={13} /></button>
                    </span>
                )}
            </div>
        </div>
    );
}

export function RulesPicker() {
    const enabled = useRules((state) => state.rulesEnabled);
    const rules = useRules((state) => state.rules);
    const currentId = useConversation((state) => state.currentId);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (open) void loadRules(); }, [open, currentId]);

    const add = async () => {
        const value = text.trim();
        if (!value || busy) return;
        setBusy(true);
        try {
            await createRule(value);
            setText('');
            await loadRules();
        } catch (error) {
            toast(`没能保存:${(error as Error).message}`);
        } finally { setBusy(false); }
    };

    const move = async (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= rules.length) return;
        const next = [...rules];
        [next[index], next[target]] = [next[target], next[index]];
        useRules.setState((state) => ({ ...state, rules: next }));
        await reorderRules(next.map((item) => item.id)).catch(() => null);
        await loadRules();
    };

    return (
        <>
            <button
                className={`tool-chip perm-chip ${enabled ? 'on' : 'off'}`}
                title={enabled ? '规则生效中,助理该问的时候会停下来问' : '规则已停用,不问不拦'}
                onClick={() => setOpen(true)}
            >
                <Icon name="spark" size={14} />
                <span className="clip">{enabled ? '规则' : '规则停用'}</span>
            </button>

            {open && (
                <Sheet title="规则" onClose={() => setOpen(false)}>
                    <label className="rules-row">
                        <input type="checkbox" checked={enabled} onChange={(event) => void setRulesEnabled(event.target.checked).catch((error) => toast((error as Error).message))} />
                        <span>
                            {enabled ? '启用' : '已停用'}
                            <span className="rules-note">
                                {enabled
                                    ? '每条规则都会进系统提示词。规则要求先问的,以及助理自己拿不准的,它会停下来问你。这是助理的自觉,不是硬拦截。'
                                    : '规则不生效,助理也不会停下来问。不问不拦,后果自负。'}
                            </span>
                        </span>
                    </label>

                    {enabled && (<>
                        <div className="perm-section">
                            <div className="perm-section-title">添加规则</div>
                            <div className="perm-add">
                                <input
                                    className="field-input"
                                    value={text}
                                    placeholder="什么情况下要先问你?例如「删 Downloads 里的东西之前问我」"
                                    onChange={(event) => setText(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void add(); }}
                                />
                                <button className="btn btn-accent" disabled={busy || !text.trim()} onClick={() => void add()}>保存</button>
                            </div>
                        </div>

                        <div className="perm-section">
                            <div className="perm-section-title">规则</div>
                            <div className="rule-list">
                                {rules.map((rule, index) => (
                                    <RuleItem
                                        key={rule.id}
                                        rule={rule}
                                        canUp={index > 0}
                                        canDown={index < rules.length - 1}
                                        onMove={(delta) => void move(index, delta)}
                                    />
                                ))}
                                {!rules.length && <div className="perm-empty">还没有规则。</div>}
                            </div>
                        </div>
                    </>)}
                </Sheet>
            )}
        </>
    );
}
