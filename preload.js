// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI', // This will be window.electronAPI in the renderer
  {
    // Renderer to Main (Invoke/Handle)
    saveDialog: (filter) => ipcRenderer.invoke('dialog:showSaveDialog', filter),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),

    // Main to Renderer (Send/On) - Expose a listener function
    onUndo: (callback) => ipcRenderer.on('undo-action', (event, ...args) => callback(...args)),
    onRedo: (callback) => ipcRenderer.on('redo-action', (event, ...args) => callback(...args))
  }
);

console.log('Preload script loaded.');
