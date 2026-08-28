// app 清单与状态。清单来自 /api/apps,状态变化由 SSE 推 —— 侧边栏上的
// 「启动中 / 就绪 / 故障」跟子进程是同一份真相,不靠轮询猜。
import { create } from 'zustand';
import { EVENTS } from '@shared/events';

import { api } from '../lib/api';
import { onChannel } from '../lib/channel';

export type AppStatus = 'stopped' | 'starting' | 'ready' | 'failed' | 'static' | 'invalid';

export interface AppInfo {
    id: string;
    name: string;
    icon: string;
    version: string;
    description: string;
    permissions: string[];
    hasServer: boolean;
    hasDoc: boolean;
    hidden: boolean;
    order: number;
    status: AppStatus;
    error: string;
}

export interface AppLog { stream: string; line: string; at: string }

export const useApps = create<{ apps: AppInfo[]; sandbox: string }>(() => ({
    apps: [],
    sandbox: 'allow-scripts allow-forms',
}));

export async function loadApps() {
    const data = await api.get<{ apps: AppInfo[]; sandbox: string }>('/api/apps').catch(() => null);
    if (data) useApps.setState({ apps: data.apps, sandbox: data.sandbox || 'allow-scripts allow-forms' });
}

/** 只订一次。app.status 只改那一行,不整表重拉。 */
export function watchApps() {
    return onChannel((type, data) => {
        if (type === EVENTS.APPS_CHANGED) { void loadApps(); return; }
        if (type !== EVENTS.APP_STATUS) return;
        const { appId, status, error } = data as { appId: string; status: AppStatus; error: string };
        useApps.setState((state) => ({
            ...state,
            apps: state.apps.map((app) => (app.id === appId ? { ...app, status, error: error || '' } : app)),
        }));
    });
}

export const appToken = (id: string) => api.get<{ token: string }>(`/api/apps/${id}/token`).then((data) => data.token);
export const appServedAt = (id: string) => api.get<{ at: number }>(`/api/apps/${id}/served`).then((data) => data.at);
export const appLogs = (id: string) => api.get<{ logs: AppLog[] }>(`/api/apps/${id}/logs`).then((data) => data.logs);
export const restartApp = (id: string) => api.post<{ status: AppStatus }>(`/api/apps/${id}/restart`);
