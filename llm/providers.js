import { deepseekNormalizer } from "./input/normalizers/deepseek.js";
import { geminiNormalizer } from "./input/normalizers/gemini.js";
import { kimiNormalizer } from "./input/normalizers/kimi.js";
import { openaiNormalizer } from "./input/normalizers/openai.js";
import { deepseekParser } from "./output/parsers/deepseek.js";
import { geminiParser } from "./output/parsers/gemini.js";
import { kimiParser } from "./output/parsers/kimi.js";
import { openaiParser } from "./output/parsers/openai.js";
import { claudeRequester } from "./requester/claude.js";
import { openaiRequester } from "./requester/openai.js";

const providerGroups = [
  { id: "default", name: "默认" },
  { id: "aggregator", name: "聚合平台" },
  { id: "coding", name: "Coding Plan" },
  { id: "custom", name: "自定义" },
];

const openaiPipeline = {
  requester: openaiRequester,
  input: openaiNormalizer,
  output: openaiParser,
};

const deepseekPipeline = {
  requester: openaiRequester,
  input: deepseekNormalizer,
  output: deepseekParser,
};

const kimiPipeline = {
  requester: openaiRequester,
  input: kimiNormalizer,
  output: kimiParser,
};

const geminiPipeline = {
  requester: openaiRequester,
  input: geminiNormalizer,
  output: geminiParser,
};

const claudePipeline = {
  requester: claudeRequester,
  input: openaiNormalizer,
  output: openaiParser,
};

const createProvider = ({
  id,
  name,
  group = "default",
  apiUrl,
  defaultModel,
  keyUrl = "",
  pipeline = openaiPipeline,
  match = null,
  capabilities = {},
}) => ({
  id,
  name,
  group,
  apiUrl,
  defaultModel,
  keyUrl,
  pipeline,
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
    pipeline: claudePipeline,
    capabilities: { openaiCompatible: false },
  }),
  createProvider({
    id: "gemini",
    name: "Gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-3-flash-preview",
    keyUrl: "https://aistudio.google.com/apikey",
    pipeline: geminiPipeline,
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
    pipeline: deepseekPipeline,
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
    pipeline: kimiPipeline,
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

const publicProvider = ({ pipeline, match, ...provider }) => provider;

const getProviderCatalog = () => ({
  groups: providerGroups,
  providers: providers.map(publicProvider),
});

export { getProviderCatalog, providerGroups, providers };
