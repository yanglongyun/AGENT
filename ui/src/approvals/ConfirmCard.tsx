// confirm 卡:助理停下来问的那一句。
//
// 纯展示组件:除了 React 什么都不 import。怎么答由 props 传进来。
export interface ConfirmCardData {
    id: string;
    summary: string;
    detail: string;
    risk: string;
}

interface Props {
    card: ConfirmCardData;
    onAnswer: (answer: 'allow' | 'deny') => void;
}

export function ConfirmCard({ card, onAnswer }: Props) {
    return (
        <div className="confirm">
            <div className="confirm-head">
                <span className="confirm-badge">先问一句</span>
                <span className="confirm-title clip">{card.summary}</span>
            </div>

            {card.detail && <pre className="confirm-detail">{card.detail}</pre>}
            {card.risk && <div className="confirm-risk">{card.risk}</div>}

            <div className="confirm-ops">
                <button className="btn btn-quiet" onClick={() => onAnswer('deny')}>不允许</button>
                <button className="btn btn-accent" onClick={() => onAnswer('allow')}>允许</button>
            </div>
        </div>
    );
}
