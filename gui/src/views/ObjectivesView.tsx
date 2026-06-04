import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, RefreshCw, Square, Target } from "lucide-react";
import type { Objective } from "../api";
import { api } from "../api";
import type { RouteName } from "../components/AppShell";
import { useConversation } from "../state/conversation";
import { useSocket } from "../state/socket";

const HEARTBEAT_PRESETS = [
  { label: "1 分钟", value: 60 },
  { label: "5 分钟", value: 300 },
  { label: "15 分钟", value: 900 },
  { label: "30 分钟", value: 1800 },
  { label: "1 小时", value: 3600 },
  { label: "6 小时", value: 21600 },
];

const statusBadge = (status: string) => {
  if (status === "running") return "badge-success";
  if (status === "paused") return "badge-warning";
  if (status === "done") return "badge-neutral";
  return "";
};

const statusLabel = (status: string) =>
  ({ idle: "未启动", running: "运营中", paused: "已暂停", done: "已完成" }[status] || status);

const formatTime = (value?: string | null) => {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function ObjectivesView({ setRoute }: { setRoute: (route: RouteName) => void }) {
  const conversation = useConversation();
  const socket = useSocket();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<"view" | "create">("view");
  const [errorText, setErrorText] = useState("");
  const [form, setForm] = useState({ title: "", objective: "", heartbeatSeconds: 300 });

  const refresh = useCallback(async () => {
    setErrorText("");
    try {
      const result = await api.listObjectives();
      setObjectives(result.objectives || []);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 服务端心跳推进时实时刷新
  useEffect(() => socket.subscribe("objectives_changed", () => refresh()), [socket, refresh]);

  const selected = useMemo(
    () => objectives.find((item) => item.id === selectedId) || null,
    [objectives, selectedId],
  );

  const startCreate = () => {
    setMode("create");
    setSelectedId(null);
    setForm({ title: "", objective: "", heartbeatSeconds: 300 });
  };

  const submitCreate = async () => {
    const objective = form.objective.trim();
    if (!objective) return;
    try {
      const result = await api.createObjective({
        title: form.title.trim() || undefined,
        objective,
        heartbeatSeconds: form.heartbeatSeconds,
      });
      await refresh();
      setSelectedId(result.objective.id);
      setMode("view");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "创建失败");
    }
  };

  const control = async (
    id: number,
    action: "start" | "resume" | "pause" | "done" | "update",
    heartbeatSeconds?: number,
  ) => {
    try {
      await api.controlObjective(id, { action, heartbeatSeconds });
      await refresh();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "操作失败");
    }
  };

  const openConversation = (conversationId: string) => {
    conversation.setCurrentConversation(conversationId, null);
    setRoute("chat");
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex relative">
      {/* 列表 */}
      <aside
        className="hidden md:flex flex-col min-h-0 overflow-hidden shrink-0 w-[300px]"
        style={{ background: "linear-gradient(to right, var(--nav-from), var(--nav-to)), var(--color-bg)" }}
      >
        <div className="flex items-center justify-between gap-2 p-3">
          <strong className="text-sm font-semibold text-text">目标</strong>
          <button className="btn btn-sm btn-ghost !px-2 !h-8 !w-8" title="刷新" onClick={refresh}>
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="px-3 pb-2 shrink-0">
          <button
            className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-border-soft bg-bg-raised text-text text-sm font-semibold hover:bg-bg-hover transition-colors shadow-sm"
            onClick={startCreate}
          >
            <Plus size={14} strokeWidth={2.2} />
            新建目标
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 flex flex-col gap-0.5">
          {objectives.map((item) => (
            <button
              key={item.id}
              className={["conv-item !py-2.5", item.id === selectedId && mode === "view" ? "active" : ""].join(" ")}
              onClick={() => {
                setSelectedId(item.id);
                setMode("view");
              }}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <div className="flex-1 min-w-0 text-sm font-medium truncate">{item.title}</div>
                <span className={["badge shrink-0 !text-[10px] !py-0 !px-1.5", statusBadge(item.status)].join(" ")}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <div className="text-xs text-text-mute truncate w-full">{item.objective}</div>
              <div className="flex justify-between items-center gap-1.5 text-xxs text-text-faint mt-0.5 w-full">
                <span>♥ {item.beats} 次心跳</span>
                <span>{item.heartbeatSeconds}s</span>
              </div>
            </button>
          ))}
          {objectives.length === 0 ? (
            <div className="empty mx-1 mt-2">
              <div className="text-text-dim font-medium">暂无目标</div>
              <div className="text-xxs text-text-faint">点击上方「新建目标」</div>
            </div>
          ) : null}
        </div>
      </aside>

      {/* 详情 / 创建 */}
      <section className="flex-1 flex flex-col min-h-0 min-w-0">
        {mode === "create" ? (
          <CreateForm
            form={form}
            setForm={setForm}
            errorText={errorText}
            cancel={() => setMode("view")}
            submit={submitCreate}
          />
        ) : selected ? (
          <Detail
            objective={selected}
            errorText={errorText}
            control={control}
            openConversation={openConversation}
          />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {errorText ? <p className="inline-error">{errorText}</p> : null}
            <div className="w-14 h-14 rounded-2xl grid place-items-center text-text-faint bg-bg-raised border border-border-soft">
              <Target size={22} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-text font-medium">选择一个目标进入运营</div>
              <div className="text-xs text-text-mute max-w-[300px]">
                进入目标即进入自主运营模式,在这里配置并启动心跳驱动器。或{" "}
                <button className="text-accent hover:underline" onClick={startCreate}>
                  新建目标
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CreateForm({
  form,
  setForm,
  errorText,
  cancel,
  submit,
}: {
  form: { title: string; objective: string; heartbeatSeconds: number };
  setForm: (form: { title: string; objective: string; heartbeatSeconds: number }) => void;
  errorText: string;
  cancel: () => void;
  submit: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-8 flex flex-col gap-5">
        {errorText ? <p className="inline-error">{errorText}</p> : null}
        <header className="flex flex-col gap-1.5">
          <h2 className="m-0 text-2xl font-semibold text-text leading-tight">新建目标</h2>
          <p className="m-0 text-sm text-text-mute">
            目标会绑定一个独立会话。启动后,心跳驱动器按设定间隔唤醒 Agent,自主朝目标推进。
          </p>
        </header>
        <div className="flex flex-col gap-4 p-5 rounded-2xl border border-border-soft bg-bg-raised">
          <div className="field">
            <label className="field-label">标题(可选)</label>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="input"
              placeholder="留空则自动从目标截取"
            />
          </div>
          <div className="field">
            <label className="field-label">北极星目标</label>
            <textarea
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
              className="textarea"
              rows={6}
              placeholder="描述你要 Agent 持续推进的目标,越具体越好…"
            />
            <span className="field-hint">每次心跳都会以这个目标为锚,推进一步</span>
          </div>
          <div className="field">
            <label className="field-label">心跳间隔</label>
            <select
              value={form.heartbeatSeconds}
              onChange={(event) => setForm({ ...form, heartbeatSeconds: Number(event.target.value) })}
              className="input"
            >
              {HEARTBEAT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="field-hint">Agent 每隔这么久自主行动一次</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button className="btn btn-sm btn-ghost" onClick={cancel}>
              取消
            </button>
            <button className="btn btn-sm btn-primary" disabled={!form.objective.trim()} onClick={submit}>
              创建目标
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  objective,
  errorText,
  control,
  openConversation,
}: {
  objective: Objective;
  errorText: string;
  control: (
    id: number,
    action: "start" | "resume" | "pause" | "done" | "update",
    heartbeatSeconds?: number,
  ) => void;
  openConversation: (conversationId: string) => void;
}) {
  const running = objective.status === "running";
  const finished = objective.status === "done";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-8 flex flex-col gap-5">
        {errorText ? <p className="inline-error">{errorText}</p> : null}

        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="m-0 text-2xl font-semibold text-text leading-tight truncate">{objective.title}</h2>
            <span className={["badge w-fit", statusBadge(objective.status)].join(" ")}>
              {statusLabel(objective.status)}
            </span>
          </div>
        </header>

        {/* 目标 */}
        <div className="flex flex-col gap-2 p-5 rounded-2xl border border-border-soft bg-bg-raised">
          <div className="field-label">北极星目标</div>
          <p className="m-0 text-sm text-text leading-relaxed whitespace-pre-wrap">{objective.objective}</p>
        </div>

        {/* 心跳驱动器 */}
        <div className="flex flex-col gap-4 p-5 rounded-2xl border border-border-soft bg-bg-raised">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm font-semibold text-text">心跳驱动器</strong>
            <span
              className={[
                "text-xxs px-2 py-0.5 rounded-full",
                running ? "text-emerald-600 bg-emerald-500/10" : "text-text-faint bg-bg-hover",
              ].join(" ")}
            >
              {running ? "● 运转中" : "○ 已停"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="间隔" value={`${objective.heartbeatSeconds}s`} />
            <Stat label="已心跳" value={`${objective.beats} 次`} />
            <Stat label="上次心跳" value={formatTime(objective.lastBeatAt)} small />
          </div>

          {!finished ? (
            <div className="field">
              <label className="field-label">调整心跳间隔</label>
              <select
                value={objective.heartbeatSeconds}
                onChange={(event) => control(objective.id, "update", Number(event.target.value))}
                className="input"
              >
                {HEARTBEAT_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex items-center gap-2 flex-wrap">
            {!running && !finished ? (
              <button className="btn btn-sm btn-primary" onClick={() => control(objective.id, "start")}>
                <Play size={14} />
                {objective.status === "paused" ? "继续运营" : "启动运营"}
              </button>
            ) : null}
            {running ? (
              <button className="btn btn-sm btn-ghost" onClick={() => control(objective.id, "pause")}>
                <Pause size={14} />
                暂停
              </button>
            ) : null}
            {!finished ? (
              <button className="btn btn-sm btn-ghost" onClick={() => control(objective.id, "done")}>
                <Square size={14} />
                标记完成
              </button>
            ) : null}
            <button
              className="btn btn-sm btn-ghost ml-auto"
              onClick={() => openConversation(objective.conversationId)}
            >
              进入会话观看运营 →
            </button>
          </div>

          {objective.lastError ? (
            <p className="inline-error">上次心跳出错:{objective.lastError}</p>
          ) : null}
        </div>

        <p className="text-xxs text-text-faint">
          会话 #{objective.conversationId} · 创建于 {formatTime(objective.createdAt)}
          {objective.finishedAt ? ` · 完成于 ${formatTime(objective.finishedAt)}` : ""}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-bg-hover">
      <span className="text-xxs text-text-faint">{label}</span>
      <span className={[small ? "text-xxs" : "text-sm", "font-semibold text-text truncate"].join(" ")}>{value}</span>
    </div>
  );
}
