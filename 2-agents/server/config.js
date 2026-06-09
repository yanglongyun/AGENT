// @ts-nocheck
// 运行配置只从 settings 表取(在设置面板里填)。没有配置文件、不读环境变量。
import { getSettings } from "./settings.js";

const getConfig = () => {
  const s = getSettings();
  const config = {
    apiUrl: s.apiUrl || "",
    apiKey: s.apiKey || "",
    model: s.model || "",
    system: s.system || "",
  };
  const missing = [];
  if (!config.apiUrl) missing.push("接口地址");
  if (!config.apiKey) missing.push("API Key");
  if (!config.model) missing.push("模型");
  if (missing.length) throw new Error(`请先在设置里填写:${missing.join("、")}`);
  return config;
};

export { getConfig };
