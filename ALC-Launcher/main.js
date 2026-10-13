const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const dgram = require('dgram');

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
    index = $i; name = $a.Name; desc = $a.InterfaceDescription; status = "$($a.Status)"; speed = "$($a.LinkSpeed)"
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

// Change an adapter's IPv4 settings from the Network panel. netsh does the work, run as administrator: the
// Windows permission prompt appears, the elevated PowerShell writes netsh's output to a temp file, and this
// reads it back (an elevated process cannot hand its output to us directly). Every value is checked to be a
// plain IPv4 address and the adapter is given by its number, so nothing typed can reach the command line.
const isIPv4 = s => typeof s === 'string' && /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
ipcMain.handle('setIp', (e, cfg = {}) => new Promise(resolve => {
  cfg = cfg || {};
  const idx = parseInt(cfg.index, 10), dns = [].concat(cfg.dns || []).filter(Boolean);
  if (!(idx > 0)) return resolve({ ok: false, msg: 'Unknown network adapter.' });
  const ni = 'name=' + idx, cmds = [];   // each netsh command as a list of words
  if (cfg.dhcp) {
    cmds.push(['interface', 'ipv4', 'set', 'address', ni, 'source=dhcp'], ['interface', 'ipv4', 'set', 'dnsservers', ni, 'source=dhcp']);
  } else {
    if (![cfg.ip, cfg.mask].every(isIPv4) || (cfg.gateway && !isIPv4(cfg.gateway)) || !dns.every(isIPv4)) return resolve({ ok: false, msg: 'One of the addresses is not valid.' });
    cmds.push(['interface', 'ipv4', 'set', 'address', ni, 'source=static', 'address=' + cfg.ip, 'mask=' + cfg.mask, 'gateway=' + (cfg.gateway || 'none')]);
    cmds.push(dns[0] ? ['interface', 'ipv4', 'set', 'dnsservers', ni, 'source=static', 'address=' + dns[0], 'register=primary', 'validate=no']
                     : ['interface', 'ipv4', 'set', 'dnsservers', ni, 'source=static', 'address=none']);
    if (dns[1]) cmds.push(['interface', 'ipv4', 'add', 'dnsservers', ni, 'address=' + dns[1], 'index=2', 'validate=no']);
  }
  const log = path.join(os.tmpdir(), 'alc-setip-' + process.pid + '-' + Date.now() + '.txt');
  const inner = '$out = @(); $code = 0; $cmds = New-Object System.Collections.ArrayList\n' +
    cmds.map(c => '[void]$cmds.Add(@(' + c.map(psq).join(',') + '))\n').join('') +
    'foreach ($a in $cmds) {\n' +
    '  $o = (& netsh.exe @a 2>&1 | Out-String).Trim(); $out += $o; if ($LASTEXITCODE -ne 0 -and $o -notmatch "already enabled") { $code = 1 } }\n' +   // "DHCP is already enabled" = nothing to do
    'Set-Content -LiteralPath ' + psq(log) + ' -Value ($out -join "`n") -Encoding UTF8\nexit $code';
  const outer = '$ProgressPreference = "SilentlyContinue"; try { $p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop ' +
    '-ArgumentList "-NoProfile","-NonInteractive","-EncodedCommand","' + Buffer.from(inner, 'utf16le').toString('base64') + '"; ' +
    '[Console]::Out.Write("EXIT:" + $p.ExitCode) } catch { [Console]::Out.Write("ERR:" + $_.Exception.Message) }';
  let out = '';
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(outer, 'utf16le').toString('base64')], { windowsHide: true });
  ps.stdout.on('data', d => { out += d; });
  ps.on('error', x => resolve({ ok: false, msg: String(x) }));
  ps.on('close', () => {
    let detail = ''; try { detail = fs.readFileSync(log, 'utf8').replace(/^﻿/, '').trim(); fs.unlinkSync(log); } catch {}
    if (out.startsWith('EXIT:0')) return resolve({ ok: true, msg: detail });
    if (out.startsWith('ERR:')) return resolve({ ok: false, cancelled: /cancel/i.test(out), msg: /cancel/i.test(out) ? 'The administrator prompt was cancelled; nothing was changed.' : out.slice(4) });
    resolve({ ok: false, msg: detail || out || 'netsh did not report a result.' });
  });
}));

// ---------- Find devices (Network panel) ----------
// Two things run side by side: a ping sweep of the adapter's subnet (one PowerShell, pings in batches, then
// the ARP table for devices that ignore ping) and BACnet discovery (Who-Is broadcast on UDP 47808, I-Am
// replies, then a ReadProperty of each device's name).
const ipToNum = s => s.split('.').reduce((n, o) => n * 256 + +o, 0);
const numToIp = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
// Address ranges to sweep, as [first, count]. Networks larger than /22 only get the /24 around our own address;
// on a 169.254.x.x link 169.254.1.x is added too, where controller service ports usually sit.
function scanRanges(ip, prefix) {
  const me = ipToNum(ip), ranges = [];
  const add = (net, bits) => { const size = 2 ** (32 - bits); ranges.push([net + 1, size - 2]); };
  if (prefix >= 22 && prefix <= 30) add(Math.floor(me / 2 ** (32 - prefix)) * 2 ** (32 - prefix), prefix);
  else add(Math.floor(me / 256) * 256, 24);
  if (/^169\.254\./.test(ip) && Math.floor(me / 256) !== ipToNum('169.254.1.0') / 256) add(ipToNum('169.254.1.0'), 24);
  return ranges;
}
function pingSweep(index, ip, ranges) {
  const ps = `$ProgressPreference = 'SilentlyContinue'
$me = '${ip}'
$ranges = New-Object System.Collections.ArrayList   # added one by one: a single @(@(a,b)) would be flattened
${ranges.map(r => '[void]$ranges.Add(@(' + r[0] + ',' + r[1] + '))').join('\n')}
$ips = foreach ($r in $ranges) { for ($k = 0; $k -lt $r[1]; $k++) { $n = [int64]$r[0] + $k
  '{0}.{1}.{2}.{3}' -f ($n -shr 24), (($n -shr 16) -band 255), (($n -shr 8) -band 255), ($n -band 255) } }
$ips = @($ips | Where-Object { $_ -ne $me })
$alive = @{}
for ($b = 0; $b -lt $ips.Count; $b += 128) {
  $batch = @($ips[$b..([Math]::Min($b + 127, $ips.Count - 1))])
  $tasks = @(foreach ($a in $batch) { (New-Object System.Net.NetworkInformation.Ping).SendPingAsync($a, 800) })
  try { [void][System.Threading.Tasks.Task]::WaitAll($tasks, 3000) } catch {}
  for ($k = 0; $k -lt $batch.Count; $k++) { $t = $tasks[$k]
    if ($t.Status -eq 'RanToCompletion' -and $t.Result.Status -eq 'Success') { $alive[$batch[$k]] = [int]$t.Result.RoundtripTime } }
}
$want = @{}; foreach ($a in $ips) { $want[$a] = 1 }
$nb = @{}
foreach ($n in @(Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex ${index} -ErrorAction SilentlyContinue)) {
  $mac = "$($n.LinkLayerAddress)"
  if ($want[$n.IPAddress] -and $mac -and $mac -notmatch '^(FF-FF-FF-FF-FF-FF|01-00-5E|00-00-00-00-00-00)') { $nb[$n.IPAddress] = @{ mac = $mac; state = "$($n.State)" } } }
$found = @(foreach ($a in $ips) { $e = $nb[$a]
  if ($alive.ContainsKey($a) -or ($e -and $e.state -in 'Reachable','Delay','Probe','Permanent')) {
    [pscustomobject]@{ ip = $a; mac = $(if ($e) { $e.mac } else { '' }); ms = $(if ($alive.ContainsKey($a)) { $alive[$a] } else { $null }); name = '' } } })
$dns = @(foreach ($f in $found) { [System.Net.Dns]::GetHostEntryAsync($f.ip) })
try { [void][System.Threading.Tasks.Task]::WaitAll($dns, 1500) } catch {}
for ($k = 0; $k -lt $found.Count; $k++) { if ($dns[$k].Status -eq 'RanToCompletion' -and $dns[$k].Result.HostName -ne $found[$k].ip) { $found[$k].name = $dns[$k].Result.HostName } }
ConvertTo-Json -InputObject @($found) -Compress`;
  return new Promise(resolve => {
    let out = '';
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true });
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => { try { resolve([].concat(JSON.parse(out || '[]'))); } catch { resolve(null); } });
  });
}
// BACnet vendor IDs (ASHRAE list) for the brands most often found on site; others show their number.
const BACNET_VENDORS = { 2: 'Trane', 5: 'Johnson Controls', 7: 'Siemens', 8: 'Delta Controls', 10: 'Schneider Electric', 16: 'Carrier', 17: 'Honeywell', 18: 'Alerton', 24: 'Automated Logic' };
// Read a BACnet message: where it came from (IP, or network + MAC behind a router) and its APDU.
function bacnetRead(buf, rinfo) {
  if (buf.length < 8 || buf[0] !== 0x81) return null;
  let i = 4, ip = rinfo.address, port = rinfo.port;
  if (buf[1] === 0x04) { ip = [...buf.slice(4, 8)].join('.'); port = buf.readUInt16BE(8); i = 10; }   // forwarded by a BBMD
  else if (buf[1] !== 0x0a && buf[1] !== 0x0b) return null;
  if (buf[i] !== 0x01) return null;
  const ctl = buf[i + 1]; i += 2;
  if (ctl & 0x80) return null;   // network-layer message, not for us
  if (ctl & 0x20) i += 3 + buf[i + 2];
  let snet = null, sadr = null;
  if (ctl & 0x08) { snet = buf.readUInt16BE(i); const len = buf[i + 2]; sadr = [...buf.slice(i + 3, i + 3 + len)]; i += 3 + len; }
  if (ctl & 0x20) i += 1;   // hop count
  return { ip, port, snet, sadr, apdu: buf.slice(i) };
}
// An application-tagged unsigned/enumerated value at pos: returns [value, next position]
function bacnetUint(a, pos) { const len = a[pos] & 7; let v = 0; for (let k = 1; k <= len; k++) v = v * 256 + a[pos + k]; return [v, pos + 1 + len]; }
function bacnetDiscover(broadcast) {
  return new Promise(resolve => {
    const devs = new Map(), byInvoke = new Map();
    let sock, finished = false;
    const done = error => { if (finished) return; finished = true; try { sock.close(); } catch {} resolve({ devices: [...devs.values()], error }); };
    try { sock = dgram.createSocket({ type: 'udp4', reuseAddr: true }); } catch (e) { return resolve({ devices: [], error: e.message }); }
    sock.on('error', e => done(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? 'UDP port 47808 is held by another BACnet program, so BACnet devices could not be listed.' : e.message));
    sock.on('message', (buf, rinfo) => {
      const m = bacnetRead(buf, rinfo); if (!m) return;
      const a = m.apdu;
      if (a[0] === 0x10 && a[1] === 0x00 && a[2] === 0xc4) {   // I-Am
        const obj = a.readUInt32BE(3), instance = obj & 0x3fffff;
        let pos = 7, maxApdu, seg, vendor;
        [maxApdu, pos] = bacnetUint(a, pos); [seg, pos] = bacnetUint(a, pos); [vendor, pos] = bacnetUint(a, pos);
        if (!devs.has(instance)) devs.set(instance, { instance, ip: m.ip, port: m.port, net: m.snet, mac: m.sadr ? m.sadr.map(b => b.toString(16).padStart(2, '0')).join(':') : '', sadr: m.sadr, vendorId: vendor, vendor: BACNET_VENDORS[vendor] || '', name: '' });
      } else if ((a[0] & 0xf0) === 0x30 && a[2] === 0x0c && byInvoke.has(a[1])) {   // ReadProperty answer
        // object id (context tag 0), property id (context tag 1), optional array index (2), then the value in tags 3
        const d = byInvoke.get(a[1]);
        let pos = 3;
        if (a[pos] !== 0x0c) return; pos += 5;
        if ((a[pos] & 0xf8) !== 0x18) return; pos += 1 + (a[pos] & 7);
        if ((a[pos] & 0xf8) === 0x28) pos += 1 + (a[pos] & 7);
        if (a[pos] !== 0x3e || (a[pos + 1] >> 4) !== 7) return;   // opening tag 3, then a character string
        pos++;
        let len = a[pos] & 7; pos++;
        if (len === 5) { len = a[pos]; pos++; if (len === 254) { len = a.readUInt16BE(pos); pos += 2; } }
        const charset = a[pos], raw = a.slice(pos + 1, pos + len);
        d.name = charset === 4 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString(charset === 0 ? 'utf8' : 'latin1');
      }
    });
    sock.bind({ port: 47808, exclusive: false }, () => {
      sock.setBroadcast(true);
      // Who-Is to every network (DNET 0xFFFF), so devices behind BACnet routers answer too
      const whoIs = Buffer.from([0x81, 0x0b, 0x00, 0x0c, 0x01, 0x20, 0xff, 0xff, 0x00, 0xff, 0x10, 0x08]);
      sock.send(whoIs, 47808, broadcast);
      setTimeout(() => {
        // ask each device for its name (property 77 of its device object), a little apart so MS/TP links keep up
        const list = [...devs.values()].slice(0, 255);
        list.forEach((d, n) => setTimeout(() => {
          if (finished) return;
          byInvoke.set(n, d);
          const npdu = d.net != null ? [0x01, 0x24, d.net >> 8, d.net & 255, d.sadr.length, ...d.sadr, 0xff] : [0x01, 0x04];
          const obj = (8 << 22 | d.instance) >>> 0;
          const apdu = [0x00, 0x05, n, 0x0c, 0x0c, obj >>> 24, (obj >>> 16) & 255, (obj >>> 8) & 255, obj & 255, 0x19, 0x4d];
          const len = 4 + npdu.length + apdu.length;
          try { sock.send(Buffer.from([0x81, 0x0a, len >> 8, len & 255, ...npdu, ...apdu]), d.port, d.ip); } catch {}
        }, n * 25));
        setTimeout(() => done(null), list.length * 25 + 2500);
      }, 3000);
    });
  });
}
ipcMain.handle('scan', async (e, cfg = {}) => {
  cfg = cfg || {};
  const idx = parseInt(cfg.index, 10), prefix = parseInt(cfg.prefix, 10);
  if (!(idx > 0) || !isIPv4(cfg.ip) || !(prefix >= 1 && prefix <= 30)) return { error: 'This adapter has no usable IPv4 address to scan from.' };
  const t0 = Date.now(), ranges = scanRanges(cfg.ip, prefix);
  const mask = prefix ? (0xffffffff << (32 - prefix)) >>> 0 : 0, broadcast = numToIp((ipToNum(cfg.ip) & mask | ~mask) >>> 0);
  const [hosts, bacnet] = await Promise.all([pingSweep(idx, cfg.ip, ranges), bacnetDiscover(broadcast)]);
  return {
    hosts: hosts || [], hostsError: hosts ? '' : 'The address sweep failed.',
    bacnet: bacnet.devices.map(({ sadr, ...d }) => d), bacnetError: bacnet.error || '',
    ranges: ranges.map(([first, count]) => numToIp(first) + ' - ' + numToIp(first + count - 1)),
    limited: prefix < 22, count: ranges.reduce((n, r) => n + r[1], 0), seconds: (Date.now() - t0) / 1000
  };
});

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
