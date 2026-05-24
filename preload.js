const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  openChatWindow: () => ipcRenderer.invoke('open-chat-window'),

  // Memory
  getMemoryStats: () => ipcRenderer.invoke('get-memory-stats'),
  clearMemory: () => ipcRenderer.invoke('clear-memory'),
  getContext: () => ipcRenderer.invoke('get-context'),
  getChatContext: () => ipcRenderer.invoke('get-chat-context'),

  // Vision
  getLatestVision: () => ipcRenderer.invoke('get-latest-vision'),

  // Chat
  chat: (message) => ipcRenderer.invoke('chat', message),

  // Events
  onScreenshotTaken: (callback) => {
    ipcRenderer.on('screenshot-taken', (event, data) => callback(data));
  },

  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', () => callback());
  },

  onNewComment: (callback) => {
    ipcRenderer.on('new-comment', (event, comment) => callback(comment));
  },

  onVisionResult: (callback) => {
    ipcRenderer.on('vision-result', (event, result) => callback(result));
  }
});
