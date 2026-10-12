const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: d => ipcRenderer.invoke('save', d),
  exists: p => ipcRenderer.invoke('exists', p),
  browse: () => ipcRenderer.invoke('browse'),
  pickImage: () => ipcRenderer.invoke('pickImage'),
  icon: p => ipcRenderer.invoke('icon', p),
  launch: (p, a) => ipcRenderer.invoke('launch', p, a),
  configPath: () => ipcRenderer.invoke('configPath')
});
