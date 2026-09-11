import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLongPress } from '../apps/mindmap/assets/client/apps/mindmap/src/lib/longpress.js';

function setup() {
    const timers = new Map(), opened = [];
    let sequence = 0;
    const press = createLongPress((...args) => opened.push(args), (fn, delay) => {
        assert.equal(delay, 500);
        timers.set(++sequence, fn); return sequence;
    }, (id) => timers.delete(id));
    const fire = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); };
    const event = { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200 };
    return { press, event, opened, fire };
}

test('长按触屏节点打开菜单，轻微抖动不取消', () => {
    const { press, event, opened, fire } = setup();
    press.start(42, event); press.move({ ...event, clientX: 102 }); fire(); fire();
    assert.deepEqual(opened, [[42, 100, 200]]);
});

test('拖动、抬手、触摸取消和卸载不会误弹菜单', () => {
    for (const action of ['move', 'end', 'cancel']) {
        const { press, event, opened, fire } = setup();
        press.start(42, event);
        press[action]({ ...event, clientX: 120 });
        fire(); assert.deepEqual(opened, [], action);
    }
});

test('鼠标不触发长按，新的触点取消旧的长按', () => {
    const { press, event, opened, fire } = setup();
    press.start(42, { ...event, pointerType: 'mouse' }); fire();
    assert.deepEqual(opened, []);
    press.start(42, event); press.start(43, { ...event, pointerId: 2 }); fire();
    assert.deepEqual(opened, [[43, 100, 200]]);
});
