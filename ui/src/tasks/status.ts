export const taskStatus: Record<string, string> = {
    pending: '待执行', running: '执行中', paused: '已暂停',
    completed: '已完成', failed: '执行失败', cancelled: '已取消',
};

export function taskTime(value?: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
}
