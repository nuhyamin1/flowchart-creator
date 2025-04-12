// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI', // This will be window.electronAPI in the renderer
  {
    saveDialog: (filter) => ipcRenderer.invoke('dialog:showSaveDialog', filter),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data)
    // Add other IPC channels as needed
  }
);

console.log('Preload script loaded.');
