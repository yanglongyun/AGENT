// 待决定的提议,停在输入框正上方。不阻塞:模型提了就走,用户点勾才生效,点叉丢掉,不点一直在。
//
// rule:记成规则 / 改规则 / 删规则,原文可以先改再勾。
// prompt:建议的下一句话,勾了填进输入框,发不发用户定。
import { useState } from 'react';

import { Icon } from '../icons/Icon';
import { toast } from '../overlay/toast';
import { seedDraft } from '../conversation/draft';
import { acceptProposal, dismissProposal, useRules, type Proposal } from './store';

function RuleProposal({ card }: { card: Proposal }) {
    const [text, setText] = useState(card.text);
    const removing = Boolean(card.replaces) && !card.text;
    const label = removing ? '删规则' : card.replaces ? '改规则' : '记成规则';

    const accept = async () => {
        try { await acceptProposal(card.id, removing ? '' : text.trim()); }
        catch (error) { toast(`没能记下:${(error as Error).message}`); }
    };

    return (
        <div className="proposal">
            <div className="proposal-head">
                <span className="proposal-kind">{label}</span>
                <span className="grow" />
                <button className="op" title="不要" onClick={() => void dismissProposal(card.id)}><Icon name="x" size={13} /></button>
                <button className="op accent" title="记下" disabled={!removing && !text.trim()} onClick={() => void accept()}><Icon name="check" size={14} /></button>
            </div>
            {card.replaces && <div className="proposal-old">原:{card.replacesText}</div>}
            {!removing && (
                <input className="proposal-input" value={text} onChange={(event) => setText(event.target.value)} />
            )}
        </div>
    );
}

function PromptProposal({ card }: { card: Proposal }) {
    const accept = async () => {
        seedDraft(card.text);
        await acceptProposal(card.id).catch(() => null);
    };
    return (
        <div className="proposal">
            <div className="proposal-head">
                <span className="proposal-kind">下一步</span>
                <span className="proposal-text clip" title={card.text}>{card.text}</span>
                <span className="grow" />
                <button className="op" title="不要" onClick={() => void dismissProposal(card.id)}><Icon name="x" size={13} /></button>
                <button className="op accent" title="填进输入框" onClick={() => void accept()}><Icon name="check" size={14} /></button>
            </div>
        </div>
    );
}

export function ProposalDock() {
    const proposals = useRules((state) => state.proposals);
    if (!proposals.length) return null;
    return (
        <div className="proposal-dock">
            {proposals.map((card) => (card.kind === 'rule'
                ? <RuleProposal key={card.id} card={card} />
                : <PromptProposal key={card.id} card={card} />))}
        </div>
    );
}
