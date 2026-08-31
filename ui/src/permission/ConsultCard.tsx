// 提醒卡。刻意和规则命中的卡长得不一样 ——
// 规则命中是「你定的条件到了」,提醒是「助理自己觉得该问」,后者是判断不是保证。
//
// 纯展示组件:除了 React 什么都不 import。宿主怎么发请求、怎么建规则,都由 props 传进来,
// 这样整个 consult 目录可以整体删掉而不留断口。
import { useState } from 'react';

export interface ConsultCardData {
    id: string;
    summary: string;
    detail: string;
    risk: string;
    /** 助理建议的规则原话;空则不显示「记成规则」。 */
    suggestion: string;
}

interface Props {
    card: ConsultCardData;
    onAnswer: (answer: 'allow' | 'deny', makeRule: boolean) => void;
}

export function ConsultCard({ card, onAnswer }: Props) {
    const [makeRule, setMakeRule] = useState(false);

    return (
        <div className="consult">
            <div className="consult-head">
                <span className="consult-badge">助理提醒</span>
                <span className="consult-title clip">{card.summary}</span>
            </div>

            {card.detail && <pre className="consult-detail">{card.detail}</pre>}
            {card.risk && <div className="consult-risk">{card.risk}</div>}

            {card.suggestion && (
                <label className="consult-rule">
                    <input type="checkbox" checked={makeRule} onChange={(event) => setMakeRule(event.target.checked)} />
                    {/* 升级成规则之后,下次由拦截器保证,不再依赖助理记得问 */}
                    <span>同时记成规则:<b>{card.suggestion}</b></span>
                </label>
            )}

            <div className="consult-ops">
                <button className="btn btn-quiet" onClick={() => onAnswer('deny', false)}>不允许</button>
                <button className="btn btn-accent" onClick={() => onAnswer('allow', makeRule)}>允许</button>
            </div>
        </div>
    );
}
