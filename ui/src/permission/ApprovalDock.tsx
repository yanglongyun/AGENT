// 待确认的调用,停在输入框正上方。
//
// 不插进消息流:审批是待办不是历史 —— 混进历史会被滚走,而这东西正卡着一轮。
// 两种来源两种卡:规则命中(你定的闸到了)/ 助理请示(它自己觉得该问)。
import { ConsultCard } from './ConsultCard';
import { Icon } from '../icons/Icon';
import { answerApproval, createRule, loadPermission, usePermission, type Approval } from './store';
import { toast } from '../overlay/toast';

const ACTION_LABELS: Record<string, string> = {
    delete: '删除文件', overwrite: '覆盖写入', move: '移动改名', network: '联网请求',
    install: '安装软件包', sudo: '提权执行', gitPush: '推送代码', daemon: '起后台进程', format: '格式化磁盘',
};

function RuleCard({ card }: { card: Approval }) {
    return (
        <div className="approval">
            <div className="approval-head">
                <Icon name="terminal" size={14} />
                <span className="approval-title clip">{card.summary || `${card.tool} 调用`}</span>
                {card.actions.map((action) => (
                    <span key={action} className="approval-act">{ACTION_LABELS[action] || action}</span>
                ))}
            </div>
            {card.command && <pre className="approval-cmd">{card.command}</pre>}
            {!card.command && card.paths.length > 0 && <pre className="approval-cmd">{card.paths.join('\n')}</pre>}
            <div className="approval-why">{card.rule ? `命中规则:${card.rule.text}` : card.reason}</div>
            <div className="approval-ops">
                <button className="btn btn-quiet" onClick={() => void answerApproval(card.id, 'deny')}>不允许</button>
                <button className="btn btn-accent" onClick={() => void answerApproval(card.id, 'allow')}>允许这一次</button>
            </div>
        </div>
    );
}

/** 勾了「记成规则」就先建规则再放行 —— 下次由拦截器保证,不再依赖助理记得问。 */
async function answerConsult(card: Approval, answer: 'allow' | 'deny', makeRule: boolean) {
    if (makeRule && card.suggestion) {
        await createRule({ text: card.suggestion }).catch(() => null);
        await loadPermission();
        toast('已记成规则');
    }
    await answerApproval(card.id, answer);
}

export function ApprovalDock() {
    const approvals = usePermission((state) => state.approvals);
    if (!approvals.length) return null;
    return (
        <div className="approval-dock">
            {approvals.map((card) => (card.source === 'consult'
                ? (
                    <ConsultCard
                        key={card.id}
                        card={{
                            id: card.id,
                            summary: card.summary || '',
                            detail: card.detail || '',
                            risk: card.risk || '',
                            suggestion: card.suggestion || '',
                        }}
                        onAnswer={(answer, makeRule) => void answerConsult(card, answer, makeRule)}
                    />
                )
                : <RuleCard key={card.id} card={card} />))}
        </div>
    );
}
