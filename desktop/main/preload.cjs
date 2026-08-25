const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
    selectFiles: () => ipcRenderer.invoke('desktop:select-files'),
    selectDirectory: () => ipcRenderer.invoke('desktop:select-directory'),
    pathForFile: (file) => webUtils.getPathForFile(file),
    platform: process.platform,
});
