// @ts-nocheck
const providerGroups = [
  { id: "default", name: "默认" },
  { id: "aggregator", name: "聚合平台" },
  { id: "coding", name: "Coding Plan" },
  { id: "custom", name: "自定义" },
];

const createProvider = ({
  id,
  name,
  group = "default",
  apiUrl,
  defaultModel,
  keyUrl = "",
  match = null,
  capabilities = {},
}) => ({
  id,
  name,
  group,
  apiUrl,
  defaultModel,
  keyUrl,
  match,
  capabilities: {
    openaiCompatible: true,
    stream: true,
    tools: true,
    ...capabilities,
  },
});

const providers = [
  createProvider({
    id: "openai",
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-5.5",
    keyUrl: "https://platform.openai.com/api-keys",
    match: ({ provider, apiUrl }) => (
      provider === "openai" ||
      String(apiUrl || "").includes("api.openai.com")
    ),
  }),
  createProvider({
    id: "claude",
    name: "Claude",
    apiUrl: "https://api.anthropic.com/v1/chat/completions",
    defaultModel: "claude-sonnet-4-6",
    keyUrl: "https://platform.claude.com/settings/keys",
    capabilities: { openaiCompatible: false },
  }),
  createProvider({
    id: "gemini",
    name: "Gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-3-flash-preview",
    keyUrl: "https://aistudio.google.com/apikey",
    match: ({ provider, apiUrl }) => (
      provider === "gemini" ||
      String(apiUrl || "").includes("generativelanguage.googleapis.com")
    ),
  }),
  createProvider({
    id: "deepseek",
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-v4-flash",
    keyUrl: "https://platform.deepseek.com/api_keys",
    match: ({ provider, apiUrl, model }) => (
      provider === "deepseek" ||
      String(apiUrl || "").includes("api.deepseek.com") ||
      String(model || "").startsWith("deepseek-")
    ),
    capabilities: {
      reasoningContent: true,
      reasoningContentRequiredOnToolCalls: true,
    },
  }),
  createProvider({
    id: "kimi",
    name: "Kimi",
    apiUrl: "https://api.moonshot.cn/v1/chat/completions",
    defaultModel: "kimi-2.6",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    match: ({ provider, apiUrl }) => (
      provider === "kimi" ||
      String(apiUrl || "").includes("moonshot.cn") ||
      String(apiUrl || "").includes("kimi.com")
    ),
    capabilities: { reasoningContent: true },
  }),
  createProvider({
    id: "openrouter",
    name: "OpenRouter",
    group: "aggregator",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "google/gemini-3-flash-preview",
    keyUrl: "https://openrouter.ai/keys",
  }),
  createProvider({
    id: "qwen",
    name: "Qwen",
    group: "coding",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen3.6-plus",
    keyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
  }),
  createProvider({
    id: "custom",
    name: "自定义",
    group: "custom",
    apiUrl: "",
    defaultModel: "",
  }),
];

const providerConfig = ({ provider, apiUrl, model } = {}) => ({
  provider: String(provider || "").trim(),
  apiUrl: String(apiUrl || "").trim(),
  model: String(model || "").trim(),
});

const resolveLlmProvider = (config = {}) => {
  const normalized = providerConfig(config);
  return providers.find((item) => item.match?.(normalized)) ||
    providers.find((item) => item.id === normalized.provider) ||
    providers.find((item) => item.id === "openai");
};

const getProviderCatalog = () => ({
  groups: providerGroups,
  providers: providers.map(({ match, ...provider }) => provider),
});

const buildLlmHeaders = (apiKey, apiUrl) => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (String(apiUrl || "").includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "agent-cli";
  }

  return headers;
};

const normalizeUsage = (usage) => {
  if (!usage || typeof usage !== "object") return null;

  const promptTokens = Math.max(0, Number(usage.prompt_tokens) || 0);
  const completionTokens = Math.max(0, Number(usage.completion_tokens) || 0);
  const totalTokens = Math.max(
    0,
    Number(usage.total_tokens) || promptTokens + completionTokens,
  );
  const cachedPromptTokens = Math.max(
    0,
    Number(usage.prompt_tokens_details?.cached_tokens) || 0,
  );

  return {
    promptTokens,
    cachedPromptTokens,
    completionTokens,
    totalTokens,
  };
};

const parseJson = (raw, label = "json") => {
  const input = String(raw ?? "");
  if (!input) {
    throw new Error(`Invalid JSON in ${label}: empty input`);
  }
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
};

export {
  buildLlmHeaders,
  getProviderCatalog,
  normalizeUsage,
  parseJson,
  providerGroups,
  providers,
  resolveLlmProvider,
};
