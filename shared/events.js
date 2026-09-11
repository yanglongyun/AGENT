// 服务端与界面共用的事件名 —— 跨进程的字符串只写这一份。
// 服务端经 /api/events(SSE)广播,界面按 thread 认领。
export const EVENTS = Object.freeze({
    /** 一轮开始跑了(用户消息已落库)。 */
    START: 'thread.start',
    PROPOSALS_CHANGED: 'proposals.changed',
    /** 思考流增量。 */
    REASONING: 'thread.reasoning',
    /** 正文流增量。 */
    DELTA: 'thread.delta',
    TEXT_DONE: 'thread.textDone',
    /** 模型转去吐工具参数了:正文行到此为止。 */
    CALL_STARTED: 'thread.callStarted',
    /** 一批工具调用已就绪(参数完整),即将执行。 */
    CALLS: 'thread.calls',
    /** 某次工具调用出结果了。 */
    CALL_OUTPUT: 'thread.callOutput',
    /** 上下文压缩:开始 / 结束。 */
    COMPACT_START: 'thread.compactStart',
    COMPACT_DONE: 'thread.compactDone',
    /** 终局三态。 */
    DONE: 'thread.done',
    ABORTED: 'thread.aborted',
    ERROR: 'thread.error',
    /** 对话列表变了(标题 / 置顶 / 新建),界面重拉列表。 */
    THREADS_CHANGED: 'threads.changed',
    /** 某个对话被删了(可能来自另一个窗口)。 */
    THREAD_DELETED: 'thread.deleted',
    /** 有一次工具调用停在确认上,等用户表态。 */
    APPROVAL_ASK: 'approval.ask',
    /** 确认有了结果(用户点了,或超时,或整轮被停)。 */
    APPROVAL_DONE: 'approval.done',
    /** app 装载变化(新增 / 删除 / manifest 改动),界面重拉列表。 */
    APPS_CHANGED: 'apps.changed',
    /** 某个 app 子进程状态变了:stopped / starting / ready / failed。 */
    APP_STATUS: 'app.status',
    /** app 经宿主能力发来的通知:toast 或侧边栏角标。 */
    APP_NOTIFY: 'app.notify',
});

/** SSE 通道上会出现的全部事件名,界面据此逐个 addEventListener。 */
export const EVENT_NAMES = Object.freeze(Object.values(EVENTS));
