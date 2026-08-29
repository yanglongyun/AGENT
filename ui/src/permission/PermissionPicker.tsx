// 输入框上的权限标:选档 + 就地管规则。
//
// 刻意不放进设置页 —— 选哪一档是每次发消息前的现场决定,和工作目录并列。
//
// 一条规则就是一个触发条件:命中了就停下来问你。没有类别,没有拒绝/放行的分档 ——
// 该不该做,你在弹窗那一刻自己判断。
import { useEffect, useState } from 'react';

import { Icon } from '../icons/Icon';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import {
    MODES, MODE_LABELS, MODE_NOTES, createRule, loadPermission, patchRule,
    removeRule, reorderRules, setConsult, setMode, useConsult, useMode, usePermission, type Rule,
} from './store';
import { useConversation } from '../conversation/store';

/** 拦截条件的原样展示。空的就明说拦不住,不含糊。 */
function conditionOf(rule: Rule): string {
    const parts: string[] = [];
    if (rule.match.actions.length) parts.push(`动作 ${rule.match.actions.join(' ')}`);
    if (rule.match.tools.length) parts.push(`工具 ${rule.match.tools.join(' ')}`);
    if (rule.match.paths.length) parts.push(`路径 ${rule.match.paths.join(' ')}`);
    return parts.join('   ·   ');
}

interface ItemProps {
    rule: Rule;
    canUp: boolean;
    canDown: boolean;
    onMove: (delta: number) => void;
}

function RuleItem({ rule, canUp, canDown, onMove }: ItemProps) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(rule.text);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const condition = conditionOf(rule);

    useEffect(() => { setDraft(rule.text); }, [rule.text]);

    const save = async () => {
        const text = draft.trim();
        if (!text || saving) return;
        setSaving(true);
        try {
            // 改了原话会在服务端重新编译 —— 拦截条件不会跟原话脱节
            const result = await patchRule(rule.id, { text });
            await loadPermission();
            setEditing(false);
            toast(result.note || '已保存');
        } catch (error) {
            toast(`没能保存:${(error as Error).message}`);
        } finally { setSaving(false); }
    };

    return (
        <div className={`rule${rule.enabled ? '' : ' off'}`}>
            <div className="rule-head">
                <button
                    className={`rule-switch${rule.enabled ? ' on' : ''}`}
                    title={rule.enabled ? '已启用,点击停用' : '已停用,点击启用'}
                    onClick={() => void patchRule(rule.id, { enabled: !rule.enabled }).then(loadPermission)}
                />
                <span className="rule-text clip" onClick={() => setOpen(!open)}>{rule.text}</span>

                {confirming ? (
                    <span className="rule-confirm">
                        <span>删除这条?</span>
                        <button className="link" onClick={() => setConfirming(false)}>取消</button>
                        <button className="link danger" onClick={() => void removeRule(rule.id).then(loadPermission)}>删除</button>
                    </span>
                ) : (
                    <span className="rule-ops">
                        <button className="op" title="上移" disabled={!canUp} onClick={() => onMove(-1)}><Icon name="up" size={12} /></button>
                        <button className="op" title="下移" disabled={!canDown} onClick={() => onMove(1)}><Icon name="down" size={12} /></button>
                        <button className="op" title="编辑" onClick={() => { setOpen(true); setEditing(true); }}><Icon name="pen" size={13} /></button>
                        <button className="op danger" title="删除" onClick={() => setConfirming(true)}><Icon name="trash" size={13} /></button>
                    </span>
                )}
            </div>

            {open && (
                <div className="rule-body">
                    {editing ? (
                        <div className="rule-edit">
                            <input
                                className="field-input"
                                value={draft}
                                autoFocus
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void save(); }}
                            />
                            <div className="rule-edit-bar">
                                <span className="rule-edit-note">改动之后会重新解析拦截条件。</span>
                                <span className="grow" />
                                <button className="btn btn-quiet" onClick={() => { setEditing(false); setDraft(rule.text); }}>取消</button>
                                <button className="btn btn-accent" disabled={saving || !draft.trim()} onClick={() => void save()}>
                                    {saving ? '解析中…' : '保存'}
                                </button>
                            </div>
                        </div>
                    ) : (<>
                        {/* 一前一后:先是助理读到的那句话,再是真正拦下操作的那个条件 */}
                        <div className="rule-line">
                            <span className="rule-label">提示词</span>
                            <span className="rule-value">{rule.prompt}</span>
                        </div>
                        <div className="rule-line">
                            <span className="rule-label">拦截规则</span>
                            <span className="rule-value">
                                {condition
                                    ? <code className="rule-cond">{condition}</code>
                                    : <span className="soft-note">没有拦截条件,这条只写进提示词,靠助理自觉遵守。</span>}
                            </span>
                        </div>
                    </>)}
                </div>
            )}
        </div>
    );
}

export function PermissionPicker() {
    const mode = useMode();
    const consult = useConsult();
    const currentId = useConversation((state) => state.currentId);
    const rules = usePermission((state) => state.rules);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (open) void loadPermission(); }, [open, currentId]);

    const add = async () => {
        const value = text.trim();
        if (!value || busy) return;
        setBusy(true);
        try {
            const result = await createRule({ text: value });
            setText('');
            await loadPermission();
            toast(result.note || '已保存');
        } catch (error) {
            toast(`没能保存:${(error as Error).message}`);
        } finally { setBusy(false); }
    };

    const move = async (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= rules.length) return;
        const next = [...rules];
        [next[index], next[target]] = [next[target], next[index]];
        usePermission.setState((state) => ({ ...state, rules: next }));
        await reorderRules(next.map((item) => item.id)).catch(() => null);
        await loadPermission();
    };

    return (
        <>
            <button
                className={`tool-chip perm-chip ${mode}`}
                title={`权限:${MODE_LABELS[mode]} —— ${MODE_NOTES[mode]}`}
                onClick={() => setOpen(true)}
            >
                <Icon name="spark" size={14} />
                <span className="clip">{MODE_LABELS[mode]}</span>
            </button>

            {open && (
                <Sheet title="这一轮怎么放权" onClose={() => setOpen(false)}>
                    <div className="perm-modes">
                        {MODES.map((item) => (
                            <button
                                key={item}
                                className={`perm-mode${item === mode ? ' on' : ''}`}
                                onClick={() => void setMode(item)}
                            >
                                <span className="perm-mode-name">{MODE_LABELS[item]}</span>
                                <span className="perm-mode-note">{MODE_NOTES[item]}</span>
                            </button>
                        ))}
                    </div>
                    {!currentId && <div className="perm-hint">还没有对话,改的是「新对话默认用哪一档」。</div>}

                    {/* 请示是扩展功能:规则没说到的地方,助理凭自己判断问一句。
                        逐步确认档下每次调用都要问,再开它是多余的,所以不给这个开关 */}
                    {mode !== 'ask' && (
                        <label className="perm-consult">
                            <input type="checkbox" checked={consult} onChange={(event) => void setConsult(event.target.checked)} />
                            <span>
                                允许助理主动请示
                                <span className="perm-consult-note">
                                    遇到它自己觉得敏感的操作时停下来问你。这是助理的判断,不是保证 —— 别指望它每次都想得起来。
                                </span>
                            </span>
                        </label>
                    )}

                    {/* 规则只在「按照规则」档参与判定,另外两档摆出来只会让人以为它在起作用 */}
                    {mode === 'rules' && (<>
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
                                <button className="btn btn-accent" disabled={busy || !text.trim()} onClick={() => void add()}>
                                    {busy ? '解析中…' : '保存'}
                                </button>
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
                                {!rules.length && <div className="perm-empty">还没有规则。这一档下没有规则 = 什么都不问。</div>}
                            </div>
                        </div>
                    </>)}
                </Sheet>
            )}
        </>
    );
}
