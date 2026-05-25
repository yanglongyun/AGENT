// @ts-nocheck
import { createConversation, runChatTurn, titleFromPrompt } from "../lib/chat.js";

const commandChat = async (args) => {
  const prompt = args.join(" ").trim();
  if (!prompt) {
    throw new Error("chat message is required");
  }
  const conversationId = await createConversation(titleFromPrompt(prompt));
  process.stdout.write(`conversation ${conversationId}\n`);
  await runChatTurn(conversationId, prompt);
};

export { commandChat };
