// 待确认的 confirm,停在输入框正上方。
//
// 不插进消息流:确认是待办不是历史 —— 混进历史会被滚走,而这东西正卡着一轮。
import { ConfirmCard } from './ConfirmCard';
import { answerApproval, useRules } from './store';

export function ApprovalDock() {
    const approvals = useRules((state) => state.approvals);
    if (!approvals.length) return null;
    return (
        <div className="approval-dock">
            {approvals.map((card) => (
                <ConfirmCard
                    key={card.id}
                    card={{ id: card.id, summary: card.summary || '', detail: card.detail || '', risk: card.risk || '' }}
                    onAnswer={(value) => void answerApproval(card.id, value)}
                />
            ))}
        </div>
    );
}
