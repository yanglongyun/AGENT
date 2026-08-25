import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startDesktopServer } from '../server/index.js';

const here = dirname(fileURLToPath(import.meta.url));
let localServer;

async function loadConfig() {
    const source = app.isPackaged ? join(process.resourcesPath, 'config.example.js') : join(here, '../../config.js');
    const userConfig = join(app.getPath('userData'), 'config.mjs');
    if (app.isPackaged && !existsSync(userConfig)) {
        await mkdir(dirname(userConfig), { recursive: true });
        await copyFile(source, userConfig);
    }
    const loaded = (await import(`${pathToFileURL(app.isPackaged ? userConfig : source).href}?t=${Date.now()}`)).default;
    return {
        ...loaded,
        workdir: loaded.workdir || app.getPath('home'),
        web: { ...loaded.web, host: '127.0.0.1', port: 0, dataFile: join(app.getPath('userData'), 'agent.db') },
        images: { ...loaded.images, directory: join(app.getPath('userData'), 'files') },
    };
}

function bindNativeApis() {
    ipcMain.handle('desktop:select-files', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
        return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle('desktop:select-directory', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return result.canceled ? '' : result.filePaths[0];
    });
}

async function boot() {
    const config = await loadConfig();
    const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8'));
    localServer = await startDesktopServer({ config, uiRoot: join(here, '../ui/dist'), version: pkg.version });
    bindNativeApis();
    const window = new BrowserWindow({
        width: 1240, height: 820, minWidth: 760, minHeight: 560,
        webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    await window.loadURL(localServer.url);
}

app.whenReady().then(boot).catch((error) => { dialog.showErrorBox('AGENT 启动失败', String(error?.stack || error)); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => localServer?.close());
