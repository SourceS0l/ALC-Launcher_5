const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Safe mode: turns off graphics acceleration. Use it if the app opens a blank window or closes
// right away (seen on some virtual machines and ARM PCs). Add  --safe  to the end of the shortcut's Target.
if (process.argv.includes('--safe') || process.env.ALC_SAFE === '1') app.disableHardwareAcceleration();

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');

ipcMain.handle('load', () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return null; } });
ipcMain.handle('save', (e, data) => { fs.writeFileSync(cfgFile(), JSON.stringify(data, null, 2)); return true; });
ipcMain.handle('exists', (e, p) => !!p && (/^https?:/i.test(p) || fs.existsSync(p)));
ipcMain.handle('configPath', () => cfgFile());
ipcMain.handle('browse', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk'] }, { name: 'All files', extensions: ['*'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('pickImage', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp'] }]
  });
  if (r.canceled) return null;
  const p = r.filePaths[0], ext = path.extname(p).slice(1).toLowerCase();
  const mime = { svg: 'image/svg+xml', ico: 'image/x-icon', jpg: 'image/jpeg' }[ext] || 'image/' + ext;
  return 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64');
});
ipcMain.handle('icon', async (e, p) => {
  try { return (await app.getFileIcon(p, { size: 'large' })).toDataURL(); } catch { return null; }
});
ipcMain.handle('launch', async (e, p, args) => {
  if (/^https?:/i.test(p)) { shell.openExternal(p); return ''; }
  if (args && args.trim()) {
    try {
      const list = args.match(/(?:[^\s"]+|"[^"]*")+/g).map(a => a.replace(/^"|"$/g, ''));
      spawn(p, list, { detached: true, stdio: 'ignore', cwd: path.dirname(p) }).unref();
      return '';
    } catch (err) { return String(err); }
  }
  return await shell.openPath(p); // empty string = success
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 660, height: 820, minWidth: 420, minHeight: 480,
    autoHideMenuBar: true, backgroundColor: '#0f1923', title: 'ALC Launcher', icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
