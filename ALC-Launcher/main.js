const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');

// Safe mode: turns off graphics acceleration. Use it if the app opens a blank window or closes
// right away (seen on some virtual machines and ARM PCs). Add  --safe  to the end of the shortcut's Target.
if (process.argv.includes('--safe') || process.env.ALC_SAFE === '1') app.disableHardwareAcceleration();

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');

ipcMain.handle('load', () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return null; } });
ipcMain.handle('save', (e, data) => { fs.writeFileSync(cfgFile(), JSON.stringify(data, null, 2)); return true; });
ipcMain.handle('exists', (e, p) => !!p && (/^https?:/i.test(p) || fs.existsSync(p)));
ipcMain.handle('configPath', () => cfgFile());
// Updates. The website's version.json says which build is newest. Each published build is also tagged
// on GitHub (build-14, build-15, ...), and the files at that tag never change, so quick updates are
// downloaded from there. A quick update only replaces the app's screens (index.html, app.js, images...),
// saved in the settings folder. If the desktop part itself changed (main.js, preload.js, package.json)
// the full zip is needed instead.
const UPDATE_URL = 'https://sources0l.github.io/ALC-Launcher_5/ALC-Launcher/version.json';
const TAG_URL = 'https://raw.githubusercontent.com/SourceS0l/ALC-Launcher_5/build-';
const DOWNLOAD_URL = 'https://github.com/SourceS0l/ALC-Launcher_5/releases/latest/download/ALC-Launcher-Windows.zip';
const SHELL = ['main.js', 'preload.js', 'package.json'];
const updDir = () => path.join(app.getPath('userData'), 'app-update');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const fingerprint = texts => crypto.createHash('sha256').update(texts.map(t => t.replace(/\r/g, '')).join('\0')).digest('hex');
const shellPrint = () => fingerprint(SHELL.map(f => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch { return ''; } }));
const get = async (url, as) => {
  try { const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r[as]() : null; } catch { return null; }
};
// The folder the window loads: a downloaded quick update if it is newer and was made for this same
// desktop part, otherwise the files that came in the zip.
function appDir() {
  const mine = readJson(path.join(__dirname, 'version.json')), upd = readJson(path.join(updDir(), 'version.json'));
  let madeFor = ''; try { madeFor = fs.readFileSync(path.join(updDir(), 'shell.txt'), 'utf8'); } catch {}
  return mine && upd && upd.build > mine.build && madeFor === shellPrint() ? updDir() : __dirname;
}
let offer = null;   // what the last check found: { mode: 'quick' | 'full', base, info }
ipcMain.handle('checkUpdate', async () => {
  const current = (readJson(path.join(appDir(), 'version.json')) || {}).build;
  const latest = await get(UPDATE_URL, 'json');
  const res = { current, latest: latest && latest.build, notes: latest && latest.notes };
  if (!current || !res.latest || res.latest <= current) return res;
  const base = TAG_URL + res.latest + '/ALC-Launcher/';
  const [info, ...shellFiles] = await Promise.all([get(base + 'version.json', 'json'), ...SHELL.map(f => get(base + f, 'text'))]);
  if (!info || info.build !== res.latest || shellFiles.includes(null)) return { ...res, mode: 'pending' };   // still being published
  offer = { mode: fingerprint(shellFiles) === shellPrint() && Array.isArray(info.files) ? 'quick' : 'full', base, info };
  return { ...res, mode: offer.mode };
});
ipcMain.handle('applyUpdate', async e => {
  if (!offer || offer.mode !== 'quick') { shell.openExternal(DOWNLOAD_URL); return ''; }
  const { base, info } = offer, dir = updDir(), tmp = dir + '.tmp';
  try {
    const files = info.files.filter(f => typeof f === 'string' && /^[\w-]+(\/[\w-]+)*\.[\w]+$/.test(f) && !SHELL.includes(f));
    if (!files.includes('index.html')) throw new Error('the update has no index.html');
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of files) {
      const data = await get(base + f, 'arrayBuffer');
      if (!data) throw new Error('could not download ' + f);
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.writeFileSync(path.join(tmp, f), Buffer.from(data));
    }
    fs.writeFileSync(path.join(tmp, 'version.json'), JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(tmp, 'shell.txt'), shellPrint());
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    BrowserWindow.fromWebContents(e.sender).loadFile(path.join(dir, 'index.html'));
    return '';
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return err.message || String(err);
  }
});
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

// Run as administrator: PowerShell's Start-Process -Verb RunAs shows the Windows permission (UAC) prompt.
// The command goes in as -EncodedCommand so spaces and quotes in paths or arguments cannot break it.
const psq = s => "'" + String(s).replace(/'/g, "''") + "'";   // PowerShell single-quoted string
ipcMain.handle('launchAdmin', (e, p, args) => new Promise(resolve => {
  if (/^https?:/i.test(p)) { shell.openExternal(p); return resolve(''); }
  let start = 'Start-Process -Verb RunAs -ErrorAction Stop -FilePath ' + psq(p);
  if (args && args.trim()) start += ' -ArgumentList ' + psq(args.trim());
  if (fs.existsSync(p)) start += ' -WorkingDirectory ' + psq(path.dirname(p));
  // Progress output off and errors caught, so a failure comes back as one plain sentence on stdout
  const cmd = '$ProgressPreference = "SilentlyContinue"; try { ' + start + ' } catch { [Console]::Out.Write($_.Exception.Message); exit 1 }';
  let out = '';
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')], { windowsHide: true });
  ps.stdout.on('data', d => { out += d; });
  ps.on('error', x => resolve(String(x)));
  ps.on('close', code => resolve(code === 0 ? '' : /cancel/i.test(out) ? 'CANCELLED' : (out.trim() || 'PowerShell exit code ' + code)));
}));

// Live network info for the Network panel.
// netQuick: a cheap fingerprint of the current IPv4 addresses (Node reads them instantly), polled every
// couple of seconds so changes show up quickly. netInfo: the full picture from PowerShell (adapter state,
// DHCP/static, gateway, DNS, speed, IP conflicts), fetched when the fingerprint changes or every few seconds.
ipcMain.handle('netQuick', () => Object.entries(os.networkInterfaces())
  .map(([n, list]) => n + '=' + list.filter(a => a.family === 'IPv4').map(a => a.address + '/' + a.netmask).join(',')).join(';'));
const NET_PS = `$ProgressPreference = 'SilentlyContinue'
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)
$routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
$dns = @(Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)
$ifs = @(Get-NetIPInterface -AddressFamily IPv4 -ErrorAction SilentlyContinue)
$list = foreach ($a in @(Get-NetAdapter -ErrorAction SilentlyContinue)) {
  $i = $a.ifIndex
  [pscustomobject]@{
    name = $a.Name; desc = $a.InterfaceDescription; status = "$($a.Status)"; speed = "$($a.LinkSpeed)"
    mac = $a.MacAddress; hardware = [bool]$a.HardwareInterface
    dhcp = "$(($ifs | Where-Object ifIndex -eq $i | Select-Object -First 1).Dhcp)"
    ips = @($ips | Where-Object ifIndex -eq $i | ForEach-Object { [pscustomobject]@{ ip = $_.IPAddress; prefix = [int]$_.PrefixLength; origin = "$($_.PrefixOrigin)"; state = "$($_.AddressState)" } })
    gateways = @($routes | Where-Object ifIndex -eq $i | ForEach-Object { $_.NextHop })
    dns = @(($dns | Where-Object InterfaceIndex -eq $i).ServerAddresses)
  }
}
ConvertTo-Json -InputObject @($list) -Depth 4 -Compress`;
let netBusy = null;   // one PowerShell at a time; callers in the meantime share its answer
ipcMain.handle('netInfo', () => netBusy || (netBusy = new Promise(resolve => {
  let out = '';
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(NET_PS, 'utf16le').toString('base64')], { windowsHide: true });
  ps.stdout.on('data', d => { out += d; });
  ps.on('error', () => resolve(null));
  ps.on('close', () => { try { resolve([].concat(JSON.parse(out))); } catch { resolve(null); } });
}).finally(() => { netBusy = null; })));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 660, height: 820, minWidth: 420, minHeight: 480,
    show: false,   // shown maximized below, so it never flashes at the small size first
    autoHideMenuBar: true, backgroundColor: '#0f1923', title: 'ALC Launcher', icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  win.maximize(); win.show();   // fills the screen but keeps the title bar and taskbar; F11 = full screen
  win.loadFile(path.join(appDir(), 'index.html'));
});
app.on('window-all-closed', () => app.quit());
