const dictionaries = {
  en: {
    chat_title: 'Agent Chat',
    chat_tagline: 'Ask anything, stream replies, run shell tools when needed.',
    chat_load_more: 'Load more...',
    chat_today: 'Today',
    chat_tool_call: 'Tool call',
    chat_placeholder_busy: 'Working...',
    chat_placeholder_input: 'Message Agent...',
    chat_history_title: 'Chat History',
    chat_history_new: 'New Chat',
    chat_history_empty: 'No conversations yet',
    chat_history_recent: 'Recent',
    chat_new_title: 'New Chat',
    chat_ws_disconnected: 'Error: WebSocket is not connected. Check whether the service is running.',
    chat_file_title: 'File',
    chat_attachment_default_prompt: 'Please read the attachments first and summarize the key points.',
    chat_upload_failed: 'Local file cache failed',
    chat_upload_limit: 'You can add up to 10 files',
    chat_hint_app_label: 'Build something',
    chat_hint_app_desc: 'Ask the agent to inspect files and write code',
    chat_hint_app_text: 'Build a small todo app in the current folder',
    chat_hint_shell_label: 'Run command',
    chat_hint_shell_desc: 'Use shell when local verification helps',
    chat_hint_shell_text: 'Show the current directory and disk usage',
    chat_hint_file_label: 'Analyze file',
    chat_hint_file_desc: 'Upload a file and ask for a summary',
    chat_hint_file_text: 'I want to upload a file for analysis',
    chat_hint_task_label: 'Plan work',
    chat_hint_task_desc: 'Break a goal into concrete steps',
    chat_hint_task_text: 'Help me plan a small coding project',
    time_just_now: 'Just now',
    time_minutes_ago: '{n} min ago',
    time_hours_ago: '{n} hours ago',
    time_days_ago: '{n} days ago',
  },
  zh: {
    chat_title: 'Agent Chat',
    chat_tagline: '直接提问，需要时可以流式回复并运行 shell 工具。',
    chat_load_more: '加载更多...',
    chat_today: '今天',
    chat_tool_call: '工具调用',
    chat_placeholder_busy: '处理中...',
    chat_placeholder_input: '发送消息给 Agent...',
    chat_history_title: '聊天历史',
    chat_history_new: '新建聊天',
    chat_history_empty: '暂无会话',
    chat_history_recent: '最近',
    chat_new_title: '新建聊天',
    chat_ws_disconnected: '错误：WebSocket 未连接，请检查服务是否启动。',
    chat_file_title: '文件',
    chat_attachment_default_prompt: '请先阅读附件并总结关键信息。',
    chat_upload_failed: '本地文件缓存失败',
    chat_upload_limit: '最多可添加 10 个文件',
    chat_hint_app_label: '构建应用',
    chat_hint_app_desc: '让 Agent 检查文件并编写代码',
    chat_hint_app_text: '在当前目录构建一个小型待办应用',
    chat_hint_shell_label: '执行命令',
    chat_hint_shell_desc: '需要本地验证时使用 shell',
    chat_hint_shell_text: '显示当前目录和磁盘使用情况',
    chat_hint_file_label: '分析文件',
    chat_hint_file_desc: '上传文件并请求总结',
    chat_hint_file_text: '我想上传一个文件进行分析',
    chat_hint_task_label: '规划工作',
    chat_hint_task_desc: '把目标拆成具体步骤',
    chat_hint_task_text: '帮我规划一个小型编码项目',
    time_just_now: '刚刚',
    time_minutes_ago: '{n} 分钟前',
    time_hours_ago: '{n} 小时前',
    time_days_ago: '{n} 天前',
  },
};

const currentLanguage = () => {
  if (typeof localStorage === 'undefined') return 'zh';
  return localStorage.getItem('agent:language') === 'en' ? 'en' : 'zh';
};

const t = (key, fallback, vars = {}) => {
  const language = currentLanguage();
  let text = dictionaries[language]?.[key] || dictionaries.en[key] || fallback || key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
};

export { t };
