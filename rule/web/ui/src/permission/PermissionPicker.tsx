// 输入框上的权限标:选档 + 就地管规矩。
//
// 刻意不放进设置页 —— 选哪一档是每次发消息前的现场决定,和工作目录并列。
// 埋进设置页就等于没有。
//
// 列表顺序 = 判定顺序。用户能拖动它,那它就必须真的决定结果:
// 从上往下,第一条命中的说了算。对话级规矩恒在全局之前,所以分组显示。
import { useEffect, useState } from 'react';

import { Icon } from '../icons/Icon';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import {
    MODES, MODE_LABELS, MODE_NOTES, createRule, hasGuard, loadPermission, patchRule,
    removeRule, reorderRules, setMode, testRule, useMode, usePermission, type Rule,
} from './store';
import { useConversation } from '../conversation/store';

const EFFECT_LABELS: Record<string, string> = { deny: '直接拒绝', ask: '停下来问', allow: '放行不问' };

interface ItemProps {
    rule: Rule;
    canUp: boolean;
    canDown: boolean;
    onMove: (delta: number) => void;
}

/** 一条规矩。展开后能看见它的两个出口、能改、能拿命令当场试。 */
function RuleItem({ rule, canUp, canDown, onMove }: ItemProps) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(rule.text);
    const [effect, setEffect] = useState(rule.effect || 'ask');
    const [saving, setSaving] = useState(false);
    const [probe, setProbe] = useState('');
    const [hit, setHit] = useState<boolean | null>(null);
    const guarded = hasGuard(rule);

    useEffect(() => { setDraft(rule.text); setEffect(rule.effect || 'ask'); }, [rule.text, rule.effect]);

    const run = async (command: string) => {
        setProbe(command);
        if (!command.trim()) { setHit(null); return; }
        const result = await testRule(rule, command).catch(() => null);
        setHit(result ? result.hit : null);
    };

    const save = async () => {
        const text = draft.trim();
        if (!text || saving) return;
        setSaving(true);
        try {
            // 改了原话会在服务端重新编译 —— 拦截条件不会跟原话脱节
            const result = await patchRule(rule.id, { text, effect });
            await loadPermission();
            setEditing(false);
            toast(result.note || (text === rule.text ? '已保存' : '已重新解析'));
        } catch (error) {
            toast(`没能保存:${(error as Error).message}`);
        } finally { setSaving(false); }
    };

    return (
        <div className={`rule${rule.enabled ? '' : ' off'}`}>
            <div className="rule-head">
                <span className="rule-move">
                    <button className="op" title="上移" disabled={!canUp} onClick={() => onMove(-1)}><Icon name="up" size={11} /></button>
                    <button className="op" title="下移" disabled={!canDown} onClick={() => onMove(1)}><Icon name="down" size={11} /></button>
                </span>
                <span className={`rule-caret${open ? ' open' : ''}`} onClick={() => setOpen(!open)}><Icon name="chev" size={12} /></span>
                <span className="rule-text clip" onClick={() => setOpen(!open)}>{rule.text}</span>
                <span className={`rule-tag ${guarded ? 'hard' : 'soft'}`}>{guarded ? '拦得住' : '只靠它自觉'}</span>
                <span className="rule-ops">
                    <button className="op" title="编辑" onClick={() => { setOpen(true); setEditing(true); }}>
                        <Icon name="pen" size={13} />
                    </button>
                    <button
                        className="op" title={rule.enabled ? '停用' : '启用'}
                        onClick={() => void patchRule(rule.id, { enabled: !rule.enabled }).then(loadPermission)}
                    ><Icon name={rule.enabled ? 'check' : 'x'} size={13} /></button>
                    <button
                        className="op danger" title="删除"
                        onClick={() => void removeRule(rule.id).then(loadPermission)}
                    ><Icon name="trash" size={13} /></button>
                </span>
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
                                {rule.kind !== 'memory' && (
                                    <select className="field-input rule-effect" value={effect} onChange={(event) => setEffect(event.target.value)}>
                                        <option value="deny">直接拒绝</option>
                                        <option value="ask">停下来问</option>
                                        <option value="allow">放行不问</option>
                                    </select>
                                )}
                                <span className="grow" />
                                <button className="btn btn-quiet" onClick={() => { setEditing(false); setDraft(rule.text); }}>取消</button>
                                <button className="btn btn-accent" disabled={saving || !draft.trim()} onClick={() => void save()}>
                                    {saving ? '解析中…' : '保存'}
                                </button>
                            </div>
                            <div className="rule-edit-note">改动原话会重新解析拦截条件。</div>
                        </div>
                    ) : (<>
                        <div className="rule-line">
                            <span className="rule-label">写进提示词</span>
                            <span className="rule-value">{rule.prompt}</span>
                        </div>
                        <div className="rule-line">
                            <span className="rule-label">生成拦截器</span>
                            <span className="rule-value">
                                {guarded ? (<>
                                    <b>{EFFECT_LABELS[rule.effect] || rule.effect}</b>
                                    {rule.match.actions.length > 0 && <> · 动作 {rule.match.actions.join('、')}</>}
                                    {rule.match.tools.length > 0 && <> · 工具 {rule.match.tools.join('、')}</>}
                                    {rule.match.paths.length > 0 && <> · 路径 {rule.match.paths.join('、')}</>}
                                </>) : (
                                    // 这句话不许软化:用户必须知道这条规矩没有强制力
                                    <span className="soft-note">这句话没能变成拦截条件,只写进了提示词——助理会看到它,但没有闸拦着。</span>
                                )}
                            </span>
                        </div>
                        {guarded && (
                            <div className="rule-probe">
                                <input
                                    className="field-input mono"
                                    value={probe}
                                    spellCheck={false}
                                    placeholder="粘一条命令进来试试,例如 rm ~/Downloads/a.txt"
                                    onChange={(event) => void run(event.target.value)}
                                />
                                {hit !== null && (
                                    <span className={`probe-verdict ${hit ? 'hit' : 'miss'}`}>{hit ? '命中,会被拦' : '不命中,放行'}</span>
                                )}
                            </div>
                        )}
                    </>)}
                </div>
            )}
        </div>
    );
}

export function PermissionPicker() {
    const mode = useMode();
    const currentId = useConversation((state) => state.currentId);
    const { rules, preview } = usePermission();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [scopeLocal, setScopeLocal] = useState(false);

    useEffect(() => { if (open) void loadPermission(); }, [open, currentId]);

    const add = async () => {
        const value = text.trim();
        if (!value || busy) return;
        setBusy(true);
        try {
            const result = await createRule({ text: value, conversationId: scopeLocal ? currentId : '' });
            setText('');
            await loadPermission();
            toast(result.compiled ? '已立下,并生成了拦截器' : `已立下 —— ${result.note}`);
        } catch (error) {
            toast(`没能立下:${(error as Error).message}`);
        } finally { setBusy(false); }
    };

    /** 只在同一作用域内换位。跨组移动服务端会重新分组,那就是骗人了。 */
    const move = async (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= rules.length) return;
        const next = [...rules];
        [next[index], next[target]] = [next[target], next[index]];
        usePermission.setState((state) => ({ ...state, rules: next })); // 先动起来,不等往返
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

                    {/* 规矩只在「按照规则」档里参与判定,另外两档摆出来只会让人以为它在起作用 */}
                    {mode === 'rules' && (<>
                    <div className="perm-section">
                        <div className="perm-section-title">我的规矩</div>
                        <div className="perm-add">
                            <input
                                className="field-input"
                                value={text}
                                placeholder="用一句话立个规矩,例如「不要删我 Downloads 里的东西」"
                                onChange={(event) => setText(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void add(); }}
                            />
                            <button className="btn btn-accent" disabled={busy || !text.trim()} onClick={() => void add()}>
                                {busy ? '解析中…' : '立下'}
                            </button>
                        </div>
                        {currentId && (
                            <label className="perm-scope">
                                <input type="checkbox" checked={scopeLocal} onChange={(event) => setScopeLocal(event.target.checked)} />
                                <span>只在这个对话生效</span>
                            </label>
                        )}

                        {rules.length > 1 && <div className="perm-order-note">从上往下判,第一条命中的说了算。</div>}

                        <div className="rule-list">
                            {rules.map((rule, index) => {
                                const previous = rules[index - 1];
                                const next = rules[index + 1];
                                const sameAs = (other?: Rule) => other && Boolean(other.conversationId) === Boolean(rule.conversationId);
                                return (
                                    <div key={rule.id}>
                                        {!sameAs(previous) && (
                                            <div className="rule-group">{rule.conversationId ? '只在这个对话' : '全局'}</div>
                                        )}
                                        <RuleItem
                                            rule={rule}
                                            canUp={Boolean(sameAs(previous))}
                                            canDown={Boolean(sameAs(next))}
                                            onMove={(delta) => void move(index, delta)}
                                        />
                                    </div>
                                );
                            })}
                            {!rules.length && <div className="perm-empty">还没有规矩。「按照规则」档下没有规矩 = 什么都不拦。</div>}
                        </div>
                    </div>

                    <div className="perm-section">
                        <div className="perm-section-title">助理此刻看到的</div>
                        <pre className="perm-preview">{preview || '(没有规矩要注入)'}</pre>
                    </div>
                    </>)}
                </Sheet>
            )}
        </>
    );
}
