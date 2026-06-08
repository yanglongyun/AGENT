const messages = {
  chat_title: 'Agent Chat',
  chat_tagline: 'Ask anything, stream replies, run shell tools when needed.',
  chat_load_more: 'Load more...',
  chat_today: 'Today',
  chat_tool_call: 'Tool call',
  chat_placeholder_busy: 'Working...',
  chat_placeholder_input: 'Message Agent Chat...',
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
};

const t = (key, fallback, vars = {}) => {
  let text = messages[key] || fallback || key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
};

export { t };
