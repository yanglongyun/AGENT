// 待确认的工具调用,停在输入框正上方。
//
// 不插进消息流:审批是待办不是历史 —— 混进历史会被滚走,而这东西正卡着一轮。
import { Icon } from '../icons/Icon';
import { answerApproval, createRule, loadPermission, useMode, usePermission, type Approval } from './store';
import { toast } from '../overlay/toast';
import { useConversation } from '../conversation/store';

const ACTION_LABELS: Record<string, string> = {
    delete: '删除文件', overwrite: '覆盖写入', move: '移动改名', network: '联网请求',
    install: '安装软件包', sudo: '提权执行', gitPush: '推送代码', daemon: '起后台进程', format: '格式化磁盘',
};

function Card({ card }: { card: Approval }) {
    const currentId = useConversation((state) => state.currentId);
    const mode = useMode();

    /** 「以后这类不用问」——按这次调用的形状直接生成条件,不过模型,所以精确且即时。
        默认只落在这个对话:被打断的那一秒不该做长期决定。 */
    const always = async () => {
        await createRule({
            text: `以后允许${card.tool === 'bash' ? '这类命令' : `用 ${card.tool}`}:${card.actions.map((a) => ACTION_LABELS[a] || a).join('、') || '这类操作'}`,
            conversationId: currentId,
            kind: 'grant',
            effect: 'allow',
            match: { tools: [card.tool], actions: card.actions, paths: [] },
        }).catch(() => null);
        await answerApproval(card.id, 'allow');
        await loadPermission();
        toast('已允许,并在这个对话里免问');
    };

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
            <div className="approval-why">{card.rule ? `命中规矩:${card.rule.text}` : card.reason}</div>
            <div className="approval-ops">
                <button className="btn btn-quiet" onClick={() => void answerApproval(card.id, 'deny')}>不允许</button>
                {/* 「逐步确认」的承诺就是每一次都问 —— 这一档里不该出现让人一劳永逸的按钮 */}
                {mode === 'rules' && (
                    <button className="btn btn-quiet" onClick={() => void always()}>以后这类不用问</button>
                )}
                <button className="btn btn-accent" onClick={() => void answerApproval(card.id, 'allow')}>允许这一次</button>
            </div>
        </div>
    );
}

export function ApprovalDock() {
    const approvals = usePermission((state) => state.approvals);
    if (!approvals.length) return null;
    return <div className="approval-dock">{approvals.map((card) => <Card key={card.id} card={card} />)}</div>;
}
