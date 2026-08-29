#!/usr/bin/env bash
# webctl —— AGENT Web 服务进程管理:启动 / 停止 / 重启 / 状态 / 日志。
#
# 设计要点(配合 ngrok 远程访问):
#   ngrok 是独立进程,只转发 9500 端口;本脚本永远不碰它。
#   重启走「SIGTERM 平滑退出 → 等端口让出 → 启动并验证归属 → 失败回滚」,
#   隧道自始至终在线。不用 pgrep/pgrep -f:对相对路径命令行的匹配不可靠。
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRY="server/index.js"
PID_FILE="$ROOT/.data/web.pid"
LOG_FILE="$ROOT/.data/web.log"
PREV_LOG="$ROOT/.data/web.log.prev"
HEALTH_URL="http://127.0.0.1:${PORT:-9500}/api/health"
STOP_TIMEOUT=15   # 秒;超过就走 SIGKILL 兜底

log() { printf '[ctl] %s\n' "$*"; }

# 用 ps 找所有命令行形如「node …server/index.js」的进程,列出 PID。
healthy() { curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; }

who_listens() {
    lsof -nP -iTCP:"${PORT:-9500}" -sTCP:LISTEN -t 2>/dev/null | sort -u
}

server_pids() {
    # 首列是 PID、命令以 node 开头且含我们的入口路径;顺手排除 grep 自己和当前脚本进程树
    ps -axo pid=,command= | awk -v entry="$ENTRY" '$2 == "node" && index($0, entry) {print $1}'
}

wait_pid_gone() {
    local pid=$1 i
    for ((i = 0; i < STOP_TIMEOUT * 5; i++)); do
        kill -0 "$pid" 2>/dev/null || return 0
        sleep 0.2
    done
    return 1
}

kill_server_pids() {
    local pids pid
    pids="$(server_pids)"
    [ -n "$pids" ] || return 0
    for pid in $pids; do
        log "SIGTERM → PID $pid(服务端会先收尾在跑的轮子)"
        kill "$pid" 2>/dev/null
    done
    for pid in $pids; do
        if ! wait_pid_gone "$pid"; then
            log "PID $pid 等待超时,SIGKILL 兜底"
            kill -9 "$pid" 2>/dev/null
        fi
    done
    # 端口让出需要一点时间(TIME_WAIT 不占 LISTEN,但内核回收有延迟)
    for ((pids = 0; pids < 25; pids++)); do
        [ -z "$(who_listens)" ] && return 0
        sleep 0.2
    done
    return 1
}

start() {
    if healthy && [ -s "$PID_FILE" ] && server_pids | grep -qx "$(cat "$PID_FILE")"; then
        log "已在运行 (PID $(cat "$PID_FILE")),无需启动"
        return 0
    fi

    # 先清场:PID 文件丢了也不要紧,按命令行找幸存者
    if [ -n "$(server_pids)" ] || [ -n "$(who_listens)" ]; then
        log "发现残留服务进程/端口占用,先停止"
        kill_server_pids || { log "端口迟迟不让出,放弃启动"; return 1; }
    fi
    rm -f "$PID_FILE"

    nohup node "$ROOT/$ENTRY" >> "$LOG_FILE.tmp" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"

    # 健康检查通过后,还必须验证「监听者就是我刚起的这个 PID」,防假阳性
    local i
    for ((i = 0; i < 50; i++)); do
        if healthy && [ "$(who_listens)" = "$pid" ]; then
            [ -f "$LOG_FILE" ] && cp "$LOG_FILE" "$PREV_LOG"
            mv "$LOG_FILE.tmp" "$LOG_FILE"
            log "已启动 (PID $pid) → $HEALTH_URL ✅"
            return 0
        fi
        if ! kill -0 "$pid" 2>/dev/null; then
            log "启动失败:"
            tail -n 20 "$LOG_FILE.tmp" | sed 's/^/    /'
            rm -f "$PID_FILE"; return 1
        fi
        sleep 0.2
    done

    log "启动超时(10s),回滚:"
    kill -9 "$pid" 2>/dev/null; rm -f "$PID_FILE"
    tail -n 20 "$LOG_FILE.tmp" | sed 's/^/    /'; return 1
}

stop() {
    if [ -z "$(server_pids)" ] && [ -z "$(who_listens)" ]; then
        log "未在运行"; rm -f "$PID_FILE"; return 0
    fi
    kill_server_pids
    rm -f "$PID_FILE"
    log "已停止"
}

restart() {
    log "--- 重启开始 ---"
    stop || true
    start
}

status() {
    local listeners pids pid
    listeners="$(who_listens)"
    pids="$(server_pids)"
    if [ -z "$listeners$pids" ]; then
        log "未运行 ❌"; return 1
    fi
    if healthy; then
        pid="$(cat "$PID_FILE" 2>/dev/null || echo "?")"
        log "运行中 (PID $pid),健康检查通过 ✅"
    else
        log "进程在 ($listeners) 但健康检查失败 ⚠️"
    fi
    log "进行中的轮子: $(curl -fsS --max-time 2 "${HEALTH_URL%/health}/runs" 2>/dev/null || echo '未知')"
}

recent() { tail -n "${1:-50}" "$LOG_FILE" 2>/dev/null || log "暂无日志"; }
logs()   { tail -n "${2:-100}" -f "$LOG_FILE" 2>/dev/null || log "暂无日志"; }

case "${1:-status}" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    logs)    logs "$@" ;;
    recent)  recent "$@" ;;
    *)
        echo "用法: npm run ctl -- <start|stop|restart|status|logs|recent>"
        exit 2
        ;;
esac
