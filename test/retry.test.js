// 重试判定：状态码优先，字符串表只做兜底，额度类永远终态。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, isRetryable, normalizeRetry, sleep } from '../ai/retry.js';

const err = (message, status) => Object.assign(new Error(message), status ? { status } : {});

test('状态码判定优先于文本', () => {
    assert.equal(isRetryable(err('Responses API 429: slow down', 429)), true);
    assert.equal(isRetryable(err('Responses API 503: unavailable', 503)), true);
    assert.equal(isRetryable(err('Responses API 400: bad request', 400)), false);
    assert.equal(isRetryable(err('Responses API 401: bad key', 401)), false);
    assert.equal(isRetryable(err('Responses API 404: no such model', 404)), false);
});

test('有状态码时不被正文里的数字误伤', () => {
    // 裸子串表会把这句判成可重试；走状态码就不会。
    assert.equal(isRetryable(err('Responses API 400: max 500 tokens exceeded', 400)), false);
});

test('额度与账单错误永不重试，即使是 429', () => {
    assert.equal(isRetryable(err('Responses API 429: insufficient_quota', 429)), false);
    assert.equal(isRetryable(err('Responses API 429: quota exceeded', 429)), false);
    assert.equal(isRetryable(err('billing hard limit reached', 429)), false);
    assert.equal(isRetryable(err('Monthly usage limit reached', 429)), false);
    assert.equal(isRetryable(err('please top up your available balance', 429)), false);
});

test('无状态码时用文本表兜底网络层与流层错误', () => {
    assert.equal(isRetryable(err('fetch failed')), true);
    assert.equal(isRetryable(err('socket hang up')), true);
    assert.equal(isRetryable(err('getaddrinfo EAI_AGAIN api.example.com')), true);
    assert.equal(isRetryable(err('Responses API 流在终结事件前中断')), false);
    assert.equal(isRetryable(err('请求被拒绝：参数非法')), false);
});

test('abort 永远是终态', () => {
    const aborted = new Error('Aborted');
    aborted.name = 'AbortError';
    assert.equal(isRetryable(aborted), false);
    // 即使文本看起来可重试
    const looksRetryable = Object.assign(new Error('fetch failed'), { name: 'AbortError' });
    assert.equal(isRetryable(looksRetryable), false);
});

test('退避递增且受 maxDelayMs 封顶', () => {
    const policy = normalizeRetry({ baseDelayMs: 1000, maxDelayMs: 5000 });
    assert.ok(backoffMs(1, policy) >= 1000 && backoffMs(1, policy) <= 1250);
    assert.ok(backoffMs(2, policy) >= 2000 && backoffMs(2, policy) <= 2500);
    assert.ok(backoffMs(9, policy) <= 6250, '封顶后仅余抖动上浮');
});

test('normalizeRetry 保留默认并接受关闭', () => {
    assert.equal(normalizeRetry(undefined).enabled, true);
    assert.equal(normalizeRetry(false).enabled, false);
    assert.equal(normalizeRetry({ maxRetries: 7 }).maxRetries, 7);
    assert.equal(normalizeRetry({ maxRetries: 7 }).baseDelayMs, 1000, '未指定的字段落回默认');
    assert.equal(normalizeRetry({}).retryAfterStream, false);
});

test('sleep 可被 abort 打断', async () => {
    const controller = new AbortController();
    const waiting = sleep(10_000, controller.signal);
    controller.abort();
    await assert.rejects(() => waiting, (error) => error.name === 'AbortError');
    await assert.rejects(() => sleep(10, AbortSignal.abort()), (error) => error.name === 'AbortError');
});
