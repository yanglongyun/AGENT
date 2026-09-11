// 长按与拖动互斥；抬手、取消或第二根手指落下都会终止计时。
export function createLongPress(open, schedule = setTimeout, unschedule = clearTimeout) {
    let pending = null;
    function cancel() {
        if (pending) unschedule(pending.timer);
        pending = null;
    }
    return {
        start(id, event) {
            cancel();
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
            const press = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, timer: null };
            pending = press;
            press.timer = schedule(() => {
                if (pending !== press) return;
                pending = null;
                open(press.id, press.x, press.y);
            }, 500);
        },
        move(event) {
            if (pending && pending.pointer === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 4) cancel();
        },
        end(event) { if (pending?.pointer === event.pointerId) cancel(); },
        cancel,
    };
}
