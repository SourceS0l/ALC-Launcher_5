const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: d => ipcRenderer.invoke('save', d),
  exists: p => ipcRenderer.invoke('exists', p),
  browse: () => ipcRenderer.invoke('browse'),
  pickImage: () => ipcRenderer.invoke('pickImage'),
  icon: p => ipcRenderer.invoke('icon', p),
  launch: (p, a) => ipcRenderer.invoke('launch', p, a),
  launchAdmin: (p, a) => ipcRenderer.invoke('launchAdmin', p, a),
  netQuick: () => ipcRenderer.invoke('netQuick'),
  netInfo: () => ipcRenderer.invoke('netInfo'),
  setIp: cfg => ipcRenderer.invoke('setIp', cfg),
  scan: cfg => ipcRenderer.invoke('scan', cfg),
  configPath: () => ipcRenderer.invoke('configPath'),
  checkUpdate: () => ipcRenderer.invoke('checkUpdate'),
  applyUpdate: () => ipcRenderer.invoke('applyUpdate')
});
