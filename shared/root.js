// 所有 Agent 工具统一以 AGENT 项目根目录为基准，不受启动终端目录影响。
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
