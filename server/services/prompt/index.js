import { DEFAULT_SYSTEM_PROMPT } from "./default.js";
import { environment as environmentSection } from "./environment.js";
import { model as modelSection } from "./model.js";
import { tools as toolsSection } from "./tools.js";
import { chats as chatsSection } from "./chats.js";
import { memory as memorySection } from "./memory.js";

const instruction = (settings = {}) =>
  String(settings.system || "").trim() || DEFAULT_SYSTEM_PROMPT;

const buildSystemPrompt = (conversationId, contextMessages = [], settings = {}) => {
  let prompt = instruction(settings);
  prompt += environmentSection(process.cwd());
  prompt += modelSection({
    provider: settings.provider,
    name: settings.model,
    apiUrl: settings.apiUrl,
  });
  prompt += toolsSection({
    enableToolResultTruncate: settings.enableToolResultTruncate,
    toolResultMaxChars: settings.toolResultMaxChars,
    enableToolLoopLimit: settings.enableToolLoopLimit,
    toolMaxRounds: settings.toolMaxRounds,
  });
  prompt += chatsSection(conversationId, contextMessages);
  prompt += memorySection();
  return prompt;
};

export { buildSystemPrompt };
