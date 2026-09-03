import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/base.css';
import './shell/shell.css';
import './conversation/conversation.css';
import './rules/rules.css';
import './rules/confirm.css';
import './apps/apps.css';
import './styles/touch.css'; // 放最后:要压过各模块的字号

import { App } from './App';
import { initTheme } from './lib/theme';

initTheme();

createRoot(document.getElementById('app')!).render(
    <StrictMode><App /></StrictMode>,
);
