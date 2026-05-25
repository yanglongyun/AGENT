import { useEffect, useMemo, useState } from "react";
import type { Provider, ProviderGroup, Settings } from "../api";
import { api } from "../api";
import { ModelSettings } from "./settings/ModelSettings";
import { SystemPromptSettings } from "./settings/SystemPromptSettings";

const DEFAULT_SETTINGS: Settings = {
  provider: "deepseek",
  apiUrl: "",
  apiKey: "",
  model: "",
  system: "",
  contextTurns: 100,
};

const DEFAULT_SYSTEM = `你是一个嵌入在本地控制台里的 Agent，拥有持久化会话、便签索引和真实终端执行能力。

回复使用中文，工程向、简洁。需要保留长期上下文时，在回复中按需写入 <summary> 或 <memo> 标签；这些标签不会展示给用户，会被系统抓取并落库。

使用 shell 工具前简短说明目的。破坏性操作必须先确认。`;

export function SettingsView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [groups, setGroups] = useState<ProviderGroup[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [statusText, setStatusText] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === settings.provider) || providers.find((provider) => provider.id === "custom") || null,
    [providers, settings.provider],
  );

  const refresh = async () => {
    setStatusText("");
    try {
      const [catalog, result] = await Promise.all([api.getProviderCatalog(), api.getSettings()]);
      setGroups(catalog.groups || []);
      setProviders(catalog.providers || []);
      setSettings({ ...DEFAULT_SETTINGS, ...(result.settings || {}) });
    } catch (error) {
      setStatusText(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const applyProviderDefaults = (providerId: string) => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    setSettings((current) => ({
      ...current,
      provider: provider.id,
      apiUrl: provider.apiUrl || "",
      model: provider.defaultModel || "",
    }));
  };

  const save = async () => {
    setStatusText("保存中…");
    try {
      await api.saveSettings(settings);
      await refresh();
      setStatusText("已保存");
      window.setTimeout(() => setStatusText(""), 1500);
    } catch (error) {
      setStatusText(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const applyDefaultSystem = () => {
    if (settings.system && !window.confirm("当前系统提示词非空，是否用默认模板覆盖？")) return;
    setSettings((current) => ({ ...current, system: DEFAULT_SYSTEM }));
  };

  const clearSystem = () => {
    if (!settings.system) return;
    if (!window.confirm("清空系统提示词？")) return;
    setSettings((current) => ({ ...current, system: "" }));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-6 flex flex-col gap-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="m-0 text-2xl font-semibold text-text leading-tight">设置</h2>
            <p className="m-0 text-sm text-text-mute">模型连接、上下文与系统提示</p>
          </div>
          <div className="flex items-center gap-2">
            {statusText ? <span className="text-xs text-text-mute">{statusText}</span> : null}
            <button className="btn btn-sm btn-ghost" onClick={refresh}>重载</button>
            <button className="btn btn-sm btn-primary" onClick={save}>保存</button>
          </div>
        </header>
        <ModelSettings
          settings={settings}
          setSettings={setSettings}
          groups={groups}
          providers={providers}
          selectedProvider={selectedProvider}
          applyProviderDefaults={applyProviderDefaults}
        />
        <SystemPromptSettings
          system={settings.system}
          setSystem={(system) => setSettings((current) => ({ ...current, system }))}
          applyDefault={applyDefaultSystem}
          clearSystem={clearSystem}
        />
      </div>
    </div>
  );
}
