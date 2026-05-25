// @ts-nocheck
import readline from "readline";
import { createConversation, runChatTurn, titleFromPrompt } from "../lib/chat.js";

const commandRepl = async () => {
  process.stdout.write("输入消息开始对话，输入 /exit 退出。\n");
  let conversationId = null;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();
  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === "/exit" || input === "/quit") {
      rl.close();
      return;
    }

    rl.pause();
    try {
      if (!conversationId) {
        conversationId = await createConversation(titleFromPrompt(input));
        process.stdout.write(`conversation ${conversationId}\n`);
      }
      await runChatTurn(conversationId, input);
    } catch (error) {
      process.stderr.write(`error: ${error.message}\n`);
    } finally {
      rl.resume();
      rl.prompt();
    }
  });
};

export { commandRepl };
