const CATS = ['Apps', 'Browsers', 'Other'];
const PF = 'C:\\Program Files\\', PF86 = 'C:\\Program Files (x86)\\';
// Paths for ALC tools are left blank on purpose: click a tile (or use Edit) and Browse to the .exe once.
const DEFAULTS = [
  ['WebCTRL Server','W','#3a6ea5','Apps',''], ['Site Builder','sb','#1c1c1c','Apps',''],
  ['EIKON Logic Builder','ek','#4d6b3c','Apps',''], ['View Builder','vb','#1c1c1c','Apps',''],
  ['WebCTRL Design Server','W','#7a5a8c','Apps',''], ['Third-Party BACnet Utility','B','#2b3a4a','Apps',''],
  ['Equipment Builder','eb','#1c1c1c','Apps',''], ['Field Assistant','fa','#14808a','Apps',''],
  ['PuTTY','P','#2d6fb7','Apps',PF+'PuTTY\\putty.exe'],
  ['Windows Explorer','fx','#c99a2e','Apps','C:\\Windows\\explorer.exe'], ['Wireshark','ws','#1f7aa8','Apps',PF+'Wireshark\\Wireshark.exe'],
  ['BBMD Config. Tool','BB','#1c1c1c','Apps',''],
  ['Microsoft Edge','e','#1b8a8f','Browsers',PF86+'Microsoft\\Edge\\Application\\msedge.exe'],
  ['Google Chrome','gc','#d44638','Browsers',PF+'Google\\Chrome\\Application\\chrome.exe'],
  ['Mozilla Firefox','ff','#e66a1f','Browsers',PF+'Mozilla Firefox\\firefox.exe']
].map((d, i) => ({ id: 'd' + i, name: d[0], abbr: d[1], color: d[2], cat: d[3], versions: [{ label: 'Default', path: d[4] }], active: 'Default', args: '' }));
// Tools added after the first release. They have fixed ids so they are added to saved settings once
// (and not again if someone deletes them).
const ADDED = [
  { id: 'ipconfig', name: 'IP Config', abbr: 'ip', color: '#2f7d4f', cat: 'Apps',   // shows this PC's IP address
    versions: [{ label: 'Default', path: 'C:\\Windows\\System32\\cmd.exe' }], active: 'Default', args: '/c start "IP Config" cmd /k ipconfig' },   // start opens a new Command Prompt window
  { id: 'ethernet', name: 'Change IP (Ethernet)', abbr: 'net', color: '#2d6fb7', cat: 'Apps',   // Settings > Ethernet: adapter > IP assignment > Edit
    versions: [{ label: 'Default', path: 'ms-settings:network-ethernet' }], active: 'Default', args: '' },
  { id: 'optiflex', name: 'OptiFlex Service Port', abbr: 'of', color: '#c4512b', cat: 'Apps',   // controller's service-port web page, in the default browser
    versions: [{ label: 'Default', path: 'http://169.254.1.1' }], active: 'Default', args: '' }
];
DEFAULTS.push(...ADDED);

let state = { theme: 'dark', tools: [] };
let editMode = false, editingId = null, newId = null;
let intro = true, tileIdx = 0;   // intro: play the entrance animation on the first draw only

function startSplash() {
  const s = $('splash'); if (!s) return;
  let n = 0;   // "Powered by" is soft, the brand name "Accs" is bold green
  [['Powered by ', 'dim'], ['ACCS', 'brand']].forEach(([txt, cls]) => [...txt].forEach(ch => {
    const sp = document.createElement('span');
    sp.className = cls;
    sp.textContent = ch === ' ' ? '\u00a0' : ch;
    sp.style.setProperty('--n', n++);
    $('splashWord').appendChild(sp);
  }));
  let done = false;
  const born = Date.now();
  const end = skipped => {
    if (done) return; done = true;
    if (skipped) document.body.classList.add('ready');
    s.classList.add('out'); setTimeout(() => s.remove(), 800);
  };
  // Ignore clicks/keys in the first 0.8s (e.g. the second click of a double-click on the icon)
  const skip = () => { if (Date.now() - born > 800) end(true); };
  setTimeout(() => end(false), 3000);   // how long the intro stays up (milliseconds)
  s.addEventListener('click', skip);
  window.addEventListener('keydown', skip, { once: true });
}
const $ = id => document.getElementById(id);
const save = () => window.api.save(state);
// Windows links such as ms-settings:network-ethernet (a Settings page) are not files: the desktop app
// counts them as found and hands them to Windows (explorer.exe) to open. The browser opens them itself.
const isWinLink = p => !window.api.web && /^[a-z][a-z0-9+.-]+:/i.test(p) && !/^[a-z]:[\\/]/i.test(p) && !/^https?:/i.test(p);
const getVer = t => t.versions.find(v => v.label === t.active) || t.versions[0];
const allLabels = () => [...new Set(state.tools.flatMap(t => t.versions.map(v => v.label)))];
// Status bar text. With a kind ('ok', 'info', 'warn', 'error') the message also pops up as a notification;
// without one it is a passing progress message ("Opening...") and stays in the status bar only.
const say = (t, kind) => { $('status').textContent = t; if (kind) toast(t, kind); };
const TOAST_ICONS = { ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/>', error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>' };
function toast(text, kind = 'info') {
  let box = $('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const same = [...box.children].find(x => x.dataset.text === text && !x.classList.contains('out'));
  if (same) { same.remove(); }   // the same message again: move it to the front instead of stacking a copy
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.dataset.text = text; el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = '<svg class="toast-ic" viewBox="0 0 24 24" aria-hidden="true">' + TOAST_ICONS[kind] + '</svg><span class="toast-t"></span><button type="button" class="toast-x" aria-label="Dismiss">×</button>';
  el.querySelector('.toast-t').textContent = text;
  const close = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.toast-x').onclick = close;
  let left = kind === 'error' ? 8000 : kind === 'warn' ? 6000 : 4000, since = Date.now(), timer = setTimeout(close, left);
  el.onmouseenter = () => { clearTimeout(timer); left -= Date.now() - since; };   // hovering keeps it up
  el.onmouseleave = () => { since = Date.now(); timer = setTimeout(close, Math.max(left, 1500)); };
  box.appendChild(el);
  while (box.querySelectorAll('.toast:not(.out)').length > 3) box.querySelector('.toast:not(.out) .toast-x').click();   // at most three
}

async function init() {
  startSplash();
  const saved = await window.api.load();
  state = saved || { theme: 'dark', tools: DEFAULTS };
  state.added = state.added || [];   // ids from ADDED this settings file has already been given
  for (const t of ADDED) {
    if (state.added.includes(t.id)) continue;
    const have = state.tools.some(x => x.id === t.id ||   // or they already made one with the same path themselves
      (x.versions || []).some(v => (v.path || '').toLowerCase() === t.versions[0].path.toLowerCase()));
    if (!have) state.tools.push(JSON.parse(JSON.stringify(t)));
    state.added.push(t.id); save();
  }
  // Built-in tools that were dropped from the list. Removed from saved settings too, but only the
  // built-in copies (ids d0, d1...), so a tool someone added back themselves stays.
  const DROPPED = ['Internet Explorer', 'SeriCap', 'Sensor Scan', 'Sensor Builder', 'Trend Conversion Utility',
    'Test + Balance', 'Virtual BACview', 'Alarm Notification Client', 'LONworks Integration Tool'].map(n => n.toLowerCase());
  const kept = state.tools.filter(t => !(/^d\d+$/.test(t.id) && DROPPED.includes(t.name.toLowerCase())));
  if (kept.length !== state.tools.length) { state.tools = kept; save(); }
  state.tools.forEach(t => {   // upgrade settings saved by the older single-path version
    if (!t.versions) { t.versions = [{ label: 'Default', path: t.path || '' }]; t.active = 'Default'; delete t.path; }
  });
  document.documentElement.dataset.theme = state.theme;
  setLook('modern');   // the modern look is the only look now (style.css alone is the old classic design)
  setView(state.view || 'comfortable');
  initNotes();
  $('catBtn').textContent = state.cat === false ? 'Cat: off' : 'Cat: on';
  if (window.api.netInfo) showNet(state.netOpen !== false);   // open by default
  CATS.forEach(c => $('fCat').add(new Option(c, c)));
  await render();
  intro = false;
}

async function render() {
  const q = $('search').value.trim().toLowerCase();
  const board = $('board');
  board.innerHTML = '';
  board.className = editMode ? 'editing' : '';
  refreshLabels();
  let shown = 0;
  for (const cat of CATS) {
    const items = state.tools.filter(t => t.cat === cat && t.name.toLowerCase().includes(q));
    if (!items.length && !editMode) continue;   // in Edit mode empty groups stay, so tiles can be dropped in
    shown += items.length;
    const g = document.createElement('section');
    g.className = 'group';
    g.innerHTML = `<div class="ghead"><h2>${cat}</h2><span class="count m-only">${items.length}</span></div><div class="grid"></div>`;
    board.appendChild(g);
    if (editMode) dropZone(g.lastChild, cat);
    for (const t of items) g.lastChild.appendChild(await makeTile(t));
  }
  if (editMode) return;
  if (!shown) board.innerHTML = '<p class="empty">No tools match. Turn on Edit to add one.</p>';
}

async function makeTile(t) {
  const v = getVer(t);
  const ok = isWinLink(v.path) || await window.api.exists(v.path);
  const icon = ok && !/^https?:/i.test(v.path) && !isWinLink(v.path) ? await window.api.icon(v.path) : null;
  const b = document.createElement('div');
  b.className = 'tile'; b.tabIndex = 0; b.dataset.id = t.id; b.style.setProperty('--c', t.color);
  if (intro) { b.classList.add('enter'); b.style.setProperty('--i', tileIdx++); } b.setAttribute('role', 'button');
  b.title = v.path || 'No path set';
  const badge = document.createElement('span');
  badge.className = 'badge';
  const pic = t.icon || icon;
  if (pic) { const im = document.createElement('img'); im.src = pic; im.alt = ''; badge.appendChild(im); badge.classList.add('real'); if (t.icon) badge.classList.add('custom'); }
  else badge.textContent = t.abbr;
  badge.style.setProperty('--c', t.color);
  const name = document.createElement('span');
  name.className = 'name'; name.textContent = t.name;
  const dot = document.createElement('span');
  dot.className = 'dot' + (ok ? '' : ' warn');
  dot.title = ok ? (window.api.web ? 'Path set' : 'Found') : (v.path ? 'File not found at this path' : 'Path not set');
  b.append(dot, badge, name);
  if (!ok) {   // modern look: say what is wrong under the name
    const sub = document.createElement('span');
    sub.className = 'sub m-only'; sub.textContent = v.path ? 'File not found' : 'Set up path';
    b.appendChild(sub);
  }
  b.insertAdjacentHTML('beforeend', '<svg class="m-only ic go" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>');
  if (t.versions.length > 1) {
    const sel = document.createElement('select');
    sel.className = 'ver'; sel.setAttribute('aria-label', t.name + ' version');
    t.versions.forEach(x => sel.add(new Option(x.label, x.label)));
    sel.value = v.label;
    ['click', 'keydown', 'contextmenu'].forEach(ev => sel.addEventListener(ev, e => e.stopPropagation()));
    sel.onchange = () => { t.active = sel.value; save(); render(); };
    b.appendChild(sel);
  }
  const act = () => (editMode || !ok) ? openEditor(t.id) : launch(t);
  b.onclick = act;
  b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
  b.oncontextmenu = e => {
    e.preventDefault();
    const r = b.getBoundingClientRect(), kb = !e.clientX && !e.clientY;   // menu key / Shift+F10: open it at the tile
    openMenu(t, ok, kb ? r.left + 12 : e.clientX, kb ? r.top + 24 : e.clientY);
  };
  if (t.admin && window.api.launchAdmin) b.insertAdjacentHTML('beforeend', '<svg class="shield" viewBox="0 0 24 24"><title>Runs as administrator</title><path d="M12 2 4 5v6c0 5.3 3.4 9.4 8 11 4.6-1.6 8-5.7 8-11V5z"/></svg>');
  if (editMode) {
    b.draggable = true;
    b.ondragstart = e => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); b.classList.add('dragging'); };
    b.ondragend = () => { dragId = null; b.classList.remove('dragging'); clearMarks(); };
  }
  return b;
}

// Edit mode: drag tiles to rearrange them. The dragged tile goes before or after the tile nearest the
// pointer (whichever side the pointer is on); an empty group just takes it.
let dragId = null;
const clearMarks = () => document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
function dropTarget(grid, e) {
  let best = null, dist = Infinity;
  for (const tile of grid.querySelectorAll('.tile')) {
    const r = tile.getBoundingClientRect();
    const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    if (d < dist) { dist = d; best = tile; }
  }
  if (!best) return { tile: null };
  const r = best.getBoundingClientRect();
  return { tile: best, after: e.clientX > r.left + r.width / 2, self: best.dataset.id === dragId };
}
function dropZone(grid, cat) {
  grid.ondragover = e => {
    if (!dragId) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const { tile, after, self } = dropTarget(grid, e);
    clearMarks();
    if (self) return;
    if (tile) tile.classList.add(after ? 'drop-after' : 'drop-before'); else grid.classList.add('drop-into');
  };
  grid.ondragleave = e => { if (!grid.contains(e.relatedTarget)) clearMarks(); };
  grid.ondrop = e => {
    if (!dragId) return;
    e.preventDefault();
    const { tile, after, self } = dropTarget(grid, e);
    clearMarks();
    if (!self) moveTool(dragId, cat, tile && tile.dataset.id, after);
  };
}
function moveTool(id, cat, nearId, after) {
  const from = state.tools.findIndex(t => t.id === id);
  if (from < 0) return;
  const [t] = state.tools.splice(from, 1);
  t.cat = cat;
  let at = state.tools.findIndex(x => x.id === nearId);
  if (at < 0) {   // no tile under the pointer: after the last tool of this group (or at the end)
    const last = state.tools.map(x => x.cat).lastIndexOf(cat);
    at = last < 0 ? state.tools.length : last + 1;
  } else if (after) at++;
  state.tools.splice(at, 0, t);
  dragId = null;
  save(); render(); say('Moved ' + t.name, 'ok');
}

// Version names already in use, offered as suggestions when typing a version name in the editor.
function refreshLabels() {
  const labels = allLabels();
  $('labels').innerHTML = '';
  labels.forEach(l => { const o = document.createElement('option'); o.value = l; $('labels').appendChild(o); });
}

async function launch(t, admin = t.admin) {
  const p = getVer(t).path;
  if (admin && window.api.launchAdmin && !isWinLink(p)) {   // settings links have nothing to elevate
    say('Opening ' + t.name + ' as administrator...');
    const err = await window.api.launchAdmin(p, t.args);
    return err === 'CANCELLED' ? say(t.name + ' was not opened: the administrator prompt was cancelled.', 'warn')
      : err ? say('Could not open ' + t.name + ' as administrator: ' + err, 'error') : say('Opened ' + t.name + ' as administrator', 'ok');
  }
  say('Opening ' + t.name + '...');
  const err = isWinLink(p) ? await window.api.launch('C:\\Windows\\explorer.exe', p) : await window.api.launch(p, t.args);
  if (err === 'COPIED' || err === 'COPY_FAILED') {
    say(err === 'COPIED' ? 'Path of ' + t.name + ' copied.' : 'Path: ' + getVer(t).path, 'info');
    return showDesktop(err === 'COPIED' ? 'For now, the path of ' + t.name + ' was copied, so you can paste it into Win+R.' : '');
  }
  if (err) say('Could not open ' + t.name + ': ' + err, 'error'); else say('Opened ' + t.name, 'ok');
}

// Right-click menu on a tile: Open, Run as administrator, Always run as administrator, Edit.
// The administrator items only exist in the desktop app (browsers cannot start programs at all).
if (!window.api.launchAdmin) document.body.classList.add('no-admin');
let menuFor = null;
function openMenu(t, ok, x, y) {
  const m = $('ctx');
  menuFor = t;
  m.querySelector('[data-act="always"]').setAttribute('aria-checked', String(!!t.admin));
  m.querySelectorAll('[data-act="open"],[data-act="admin"]').forEach(b => { b.disabled = !ok; b.title = ok ? '' : 'Set up the path first (Edit)'; });
  m.hidden = false;
  const r = m.getBoundingClientRect();   // keep it inside the window
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  m.querySelector('button:not([disabled])').focus();
}
function closeMenu() { $('ctx').hidden = true; menuFor = null; }
$('ctx').onclick = e => {
  const b = e.target.closest('button'), t = menuFor;
  if (!b || b.disabled || !t) return;
  closeMenu();
  if (b.dataset.act === 'open') launch(t);
  if (b.dataset.act === 'admin') launch(t, true);
  if (b.dataset.act === 'edit') openEditor(t.id);
  if (b.dataset.act === 'always') {
    t.admin = !t.admin; save(); render();
    say(t.admin ? t.name + ' will always run as administrator' : t.name + ' will run normally', 'ok');
  }
};
$('ctx').onkeydown = e => {   // arrow keys move through the items, Escape closes
  const items = [...$('ctx').querySelectorAll('button:not([disabled])')].filter(b => b.offsetParent);
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); }
};
document.addEventListener('mousedown', e => { if (menuFor && !$('ctx').contains(e.target)) closeMenu(); });
window.addEventListener('scroll', () => { if (menuFor) closeMenu(); }, true);   // any scrolling area
window.addEventListener('resize', () => { if (menuFor) closeMenu(); });
window.addEventListener('blur', e => { if (menuFor && e.target === window) closeMenu(); });   // the window itself, not items inside it

// Network panel (desktop app only): a card per network adapter with its IP addresses, subnet, gateway, DNS,
// DHCP/static, MAC and speed. A cheap check runs every 2 s; the full details are fetched from Windows when
// that check sees a change, or every 15 s, so plugging in a cable or changing an IP shows up within seconds.
if (!window.api.netInfo) document.body.classList.add('no-net');
let netSig = null, netAt = 0, netJson = '', netIps = null, netSelfChange = 0;
const maskOf = p => [0, 8, 16, 24].map(s => p - s >= 8 ? 255 : p - s <= 0 ? 0 : 256 - 2 ** (8 - (p - s))).join('.');
const isWifi = a => /wi-?fi|wireless|wlan|802\.11/i.test(a.name + ' ' + a.desc);
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); document.execCommand('copy'); x.remove(); }
  say('Copied ' + t, 'ok');
}
function showNet(open) {
  state.netOpen = open; save();
  $('net').hidden = !open;
  $('netBtn').classList.toggle('on', open);
  if (open) netPoll(true);
}
async function netPoll(force) {
  if (!window.api.netInfo || $('net').hidden || document.hidden) return;
  const sig = await window.api.netQuick();
  if (!force && sig === netSig && Date.now() - netAt < 15000) return;
  netSig = sig; netAt = Date.now();
  if (!netJson) $('netAge').textContent = 'Checking...';
  const list = await window.api.netInfo();
  netAt = Date.now();
  if (!list) { $('netAge').textContent = 'Could not read the network adapters'; return; }
  const json = JSON.stringify(list);
  if (json !== netJson && !netEditing) { netJson = json; drawNet(list); }   // never redraw under an open IP form
  netAge();
}
function netAge() {
  if (!netJson || $('net').hidden) return;
  const s = Math.round((Date.now() - netAt) / 1000);
  $('netAge').textContent = s < 3 ? 'Live, updated just now' : 'Live, updated ' + s + ' s ago';
}
function drawNet(list) {
  // physical adapters (minus "Not Present" ghosts of removed hardware), plus virtual ones such as a VPN only while connected
  const shown = list.filter(a => a.status !== 'Not Present' && (a.hardware || a.status === 'Up'))
    .sort((a, b) => (b.status === 'Up') - (a.status === 'Up') || isWifi(a) - isWifi(b) || a.name.localeCompare(b.name));
  const box = $('netList'); box.innerHTML = '';
  if (!shown.length) { box.innerHTML = '<p class="net-empty">No network adapters found.</p>'; return; }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const seen = {};
  for (const a of shown) {
    const up = a.status === 'Up', ips = [].concat(a.ips || []), dns = [].concat(a.dns || []).filter(Boolean), gws = [].concat(a.gateways || []).filter(Boolean);
    const card = el('article', 'nic ' + (up ? 'up' : 'down'));
    const head = el('div', 'nic-h');
    head.append(el('span', 'nic-dot'), el('span', 'nic-name', a.name));
    if (up && a.dhcp) head.append(el('span', 'nic-tag ' + (a.dhcp === 'Enabled' ? 'dhcp' : 'static'), a.dhcp === 'Enabled' ? 'DHCP' : 'Static'));
    card.append(head);
    const stateText = up ? 'Connected' : a.status === 'Disconnected' ? (isWifi(a) ? 'Not connected' : 'Cable unplugged') : a.status;
    card.append(el('div', 'nic-state', stateText + (up && a.speed && a.speed !== '0 bps' ? ' \u00b7 ' + a.speed : '')));
    if (up) {
      if (!ips.length) card.append(el('div', 'nic-warn', 'No IPv4 address'));
      for (const x of ips) {
        const row = el('div', 'nic-ip');
        const ip = el('button', 'nic-addr', x.ip); ip.type = 'button'; ip.title = 'Copy ' + x.ip; ip.onclick = () => copyText(x.ip);
        row.append(ip, el('span', 'nic-mask', maskOf(x.prefix) + '  /' + x.prefix));
        card.append(row);
        if (x.state === 'Duplicate') card.append(el('div', 'nic-warn', 'IP conflict: another device on this network is using ' + x.ip));
        else if (/^169\.254\./.test(x.ip)) card.append(el('div', 'nic-warn', 'Self-assigned address: no DHCP server answered. Set a static IP or check the cable/network.'));
      }
      const kv = el('dl', 'nic-kv');
      const add = (k, v) => { if (v) kv.append(el('dt', '', k), el('dd', '', v)); };
      add('Gateway', gws.join(', ') || 'None');
      add('DNS', dns.join(', ') || 'None');
      add('MAC', a.mac);
      card.append(kv);
    } else if (a.mac) {
      const kv = el('dl', 'nic-kv'); kv.append(el('dt', '', 'MAC'), el('dd', '', a.mac)); card.append(kv);
    }
    const acts = el('div', 'nic-acts');
    if (window.api.setIp && a.index) {
      const ed = el('button', 'btn primary nic-change', 'Edit IP'); ed.type = 'button';
      ed.title = 'Set a static IP or switch back to DHCP for ' + a.name;
      ed.onclick = () => editIp(card, a, ips, gws, dns);
      acts.append(ed);
    }
    const scanFrom = ips.find(x => x.state !== 'Duplicate' && x.prefix <= 30) || null;
    if (up && window.api.scan && scanFrom) {
      const fd = el('button', 'btn nic-change', 'Find devices'); fd.type = 'button';
      fd.title = 'List the devices and BACnet controllers on ' + a.name + "'s network";
      fd.onclick = () => findDevices(a, scanFrom);
      acts.append(fd);
    }
    const ch = el('button', 'btn nic-change', 'Windows settings'); ch.type = 'button';
    ch.title = 'Open the Windows settings page for ' + a.name;
    ch.onclick = () => window.api.launch('C:\\Windows\\explorer.exe', isWifi(a) ? 'ms-settings:network-wifi' : 'ms-settings:network-ethernet');
    acts.append(ch);
    card.append(acts);
    // briefly highlight a card whose addresses changed since the last look
    const now = ips.map(x => x.ip + '/' + x.prefix).join(',') + '|' + a.status;
    const before = netIps && netIps[a.name];
    if (netIps && before !== now && (before != null || up)) {   // changed, or an adapter newly plugged in
      card.classList.add('changed');
      // announce changes made outside the app (cable plugged in, DHCP); our own Edit IP already said so
      if (Date.now() - netSelfChange > 15000) {
        const addr = ips.filter(x => x.state !== 'Duplicate').map(x => x.ip).join(', ');
        const wasUp = before != null && before.endsWith('|Up');
        if (up && !wasUp) say(a.name + ' connected' + (addr ? ' · ' + addr : ''), 'info');
        else if (!up && wasUp) say(a.name + ' ' + (isWifi(a) ? 'disconnected' : 'cable unplugged'), 'warn');
        else if (up) say(a.name + ' is now ' + (addr || 'without an IPv4 address'), 'info');
      }
    }
    seen[a.name] = now;
    box.append(card);
  }
  // adapters that vanished from the list while connected (a USB adapter unplugged)
  if (netIps && Date.now() - netSelfChange > 15000) for (const [n, v] of Object.entries(netIps)) if (!(n in seen) && v.endsWith('|Up')) say(n + ' removed', 'warn');
  netIps = seen;
}
// Edit IP form inside an adapter card: DHCP or static IP, subnet mask, gateway, DNS. Checked here first,
// then main.js applies it with netsh as administrator (Windows asks for permission).
let netEditing = false;
const ipNum = s => s.split('.').reduce((n, o) => n * 256 + +o, 0);
const validIp = s => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
function parseMask(s) {   // "255.255.255.0", "24" or "/24" -> prefix length, or null
  s = s.trim().replace(/^\//, '');
  if (/^\d{1,2}$/.test(s)) return +s >= 1 && +s <= 32 ? +s : null;
  if (!validIp(s)) return null;
  const bits = ipNum(s).toString(2).padStart(32, '0');
  return /^1+0*$/.test(bits) ? bits.indexOf('0') < 0 ? 32 : bits.indexOf('0') : null;
}
function editIp(card, a, ips, gws, dns) {
  if (card.querySelector('.ipform')) return;
  netEditing = true;
  const cur = ips.find(x => !/^169\.254\./.test(x.ip)) || {};
  const f = document.createElement('form');
  f.className = 'ipform';
  f.innerHTML = `
    <div class="ipmode" role="radiogroup" aria-label="How this adapter gets its address">
      <label><input type="radio" name="mode" value="dhcp"> Automatic (DHCP)</label>
      <label><input type="radio" name="mode" value="static"> Static</label>
    </div>
    <div class="ipfields">
      <label>IP address <input name="ip" placeholder="192.168.168.10" inputmode="decimal" autocomplete="off"></label>
      <label>Subnet mask <input name="mask" placeholder="255.255.255.0 or 24" autocomplete="off"></label>
      <label>Gateway (optional) <input name="gw" placeholder="192.168.168.1" inputmode="decimal" autocomplete="off"></label>
      <label>DNS 1 (optional) <input name="dns1" inputmode="decimal" autocomplete="off"></label>
      <label>DNS 2 (optional) <input name="dns2" inputmode="decimal" autocomplete="off"></label>
    </div>
    <p class="iperr" hidden></p>
    <div class="nic-acts">
      <button type="submit" class="btn primary">Apply</button>
      <button type="button" class="btn" data-cancel>Cancel</button>
    </div>
    <p class="note">Windows asks for administrator permission to change the address.</p>`;
  const F = n => f.elements[n];
  F('mode').value = a.dhcp === 'Enabled' ? 'dhcp' : 'static';
  F('ip').value = cur.ip || ''; F('mask').value = cur.prefix ? maskOf(cur.prefix) : '';
  F('gw').value = gws[0] || ''; F('dns1').value = dns[0] || ''; F('dns2').value = dns[1] || '';
  const sync = () => { f.classList.toggle('dhcp', F('mode').value === 'dhcp'); };
  f.querySelectorAll('[name=mode]').forEach(r => { r.onchange = sync; }); sync();
  const err = f.querySelector('.iperr');
  const fail = (m, field) => { err.textContent = m; err.hidden = false; if (field) F(field).focus(); return false; };
  const close = () => { f.remove(); card.querySelector('.nic-acts').hidden = false; netEditing = false; netJson = ''; netPoll(true); };
  f.querySelector('[data-cancel]').onclick = close;
  f.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const dhcp = F('mode').value === 'dhcp';
    const cfg = { index: a.index, dhcp };
    if (!dhcp) {
      const ip = F('ip').value.trim(), prefix = parseMask(F('mask').value), gw = F('gw').value.trim();
      const d = [F('dns1').value.trim(), F('dns2').value.trim()].filter(Boolean);
      if (!validIp(ip)) return fail('Enter an IP address like 192.168.168.10.', 'ip');
      if (prefix == null) return fail('Enter a subnet mask like 255.255.255.0, or 24.', 'mask');
      const m = prefix ? (0xFFFFFFFF << (32 - prefix)) >>> 0 : 0, net = (ipNum(ip) & m) >>> 0, bc = (net | ~m) >>> 0;
      if (prefix < 31 && (ipNum(ip) === net || ipNum(ip) === bc)) return fail(ip + ' is the ' + (ipNum(ip) === net ? 'network' : 'broadcast') + ' address of that subnet; pick another.', 'ip');
      if (gw && !validIp(gw)) return fail('The gateway is not a valid address.', 'gw');
      if (gw && ((ipNum(gw) & m) >>> 0) !== net) return fail('Gateway ' + gw + ' is not on the same network as ' + ip + ' with mask ' + maskOf(prefix) + '.', 'gw');
      if (gw && gw === ip) return fail('The gateway cannot be this computer\'s own address.', 'gw');
      const badDns = d.find(x => !validIp(x)); if (badDns) return fail('DNS ' + badDns + ' is not a valid address.', d.indexOf(badDns) ? 'dns2' : 'dns1');
      Object.assign(cfg, { ip, mask: maskOf(prefix), gateway: gw, dns: d });
    }
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Waiting for Windows...';
    say('Changing ' + a.name + '... approve the Windows permission prompt');
    const r = await window.api.setIp(cfg);
    btn.disabled = false; btn.textContent = 'Apply';
    if (!r.ok) { if (r.cancelled) say('Nothing changed: the permission prompt was cancelled', 'warn'); else say('Could not change ' + a.name, 'error'); return fail(r.msg || 'netsh reported an error.'); }
    netSelfChange = Date.now();   // our own change: the live panel should not announce it a second time
    say(dhcp ? a.name + ' is now set to automatic (DHCP)' : a.name + ' is now ' + cfg.ip + ' / ' + cfg.mask + (cfg.gateway ? ', gateway ' + cfg.gateway : ''), 'ok');
    close();
  };
  card.querySelector('.nic-acts').hidden = true;
  card.append(f);
  (F('mode').value === 'static' ? F('ip') : f.querySelector('[name=mode]:checked')).focus();
}

// Find devices: sweep the adapter's subnet and ask for BACnet devices (main.js 'scan'), then list them.
let scanRun = 0;
async function findDevices(a, from) {
  const box = $('scanBox'), run = ++scanRun, t0 = Date.now();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  box.hidden = false; box.innerHTML = '';
  const head = el('div', 'scan-head');
  head.append(el('h3', '', 'Devices on ' + a.name), el('span', 'scan-meta', 'from ' + from.ip + ' /' + from.prefix), el('span', 'grow'));
  const again = el('button', 'btn', 'Scan again'); again.type = 'button'; again.disabled = true; again.onclick = () => findDevices(a, from);
  const close = el('button', 'btn', 'Close'); close.type = 'button'; close.onclick = () => { scanRun++; box.hidden = true; box.innerHTML = ''; };
  head.append(again, close);
  const body = el('div', 'scan-body');
  const wait = el('div', 'scan-wait'); wait.append(el('span', 'spin'), el('span', 'scan-wait-t', 'Checking every address and asking for BACnet devices...'));
  body.append(wait); box.append(head, body);
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const tick = setInterval(() => { wait.lastChild.textContent = 'Checking every address and asking for BACnet devices... ' + Math.round((Date.now() - t0) / 1000) + ' s'; }, 1000);
  const r = await window.api.scan({ index: a.index, ip: from.ip, prefix: from.prefix });
  clearInterval(tick);
  if (run !== scanRun) return;   // closed or restarted meanwhile
  again.disabled = false; body.innerHTML = '';
  if (r.error) { body.append(el('p', 'nic-warn', r.error)); say(r.error, 'error'); return; }
  // one row per IP address; BACnet devices on IP join the row with the same address
  const rows = new Map();
  for (const h of r.hosts) rows.set(h.ip, { ip: h.ip, mac: h.mac, ms: h.ms, name: h.name, bac: null });
  const routed = [];
  for (const d of r.bacnet) {
    if (d.net != null) { routed.push(d); continue; }
    const row = rows.get(d.ip) || { ip: d.ip, mac: '', ms: null, name: '', bac: null };
    row.bac = d; rows.set(d.ip, row);
  }
  const list = [...rows.values()].sort((x, y) => ipNum(x.ip) - ipNum(y.ip));
  const nBac = r.bacnet.length;
  const sum = el('p', 'scan-sum');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  sum.textContent = plural(list.length, 'device') + ' on the network' + (routed.length ? ' + ' + routed.length + ' behind routers' : '') +
    ' · ' + plural(nBac, 'BACnet device') + ' · ' + r.count + ' addresses checked (' + r.ranges.join(', ') + ') in ' + r.seconds.toFixed(1) + ' s';
  body.append(sum);
  if (r.limited) body.append(el('p', 'scan-note', 'This network is large, so only the 256 addresses around this computer were checked. BACnet discovery still covered the whole network.'));
  if (r.hostsError) body.append(el('p', 'nic-warn', r.hostsError));
  if (r.bacnetError) body.append(el('p', 'nic-warn', r.bacnetError));
  else if (!nBac) body.append(el('p', 'scan-note', 'No BACnet devices answered. If Windows asked whether ALC Launcher may use the network, it has to be allowed, or BACnet replies are blocked.'));
  const filter = el('input', 'scan-filter'); filter.type = 'search'; filter.placeholder = 'Filter by IP, name, MAC, vendor or device number';
  if (list.length + routed.length >= 6) body.append(filter);
  const vendor = d => d.vendor || 'vendor ' + d.vendorId;
  const table = (cols, items, fill) => {
    const t = el('table', 'scan-table'), tr = el('tr');
    cols.forEach(c => tr.append(el('th', '', c)));
    const thead = el('thead'); thead.append(tr); t.append(thead);
    const tb = el('tbody'); items.forEach(it => { const row = el('tr'); fill(row, it); row.dataset.text = row.textContent.toLowerCase(); tb.append(row); }); t.append(tb);
    const wrap = el('div', 'scan-wrap'); wrap.append(t); return wrap;
  };
  const btn = (text, title, fn) => { const b = el('button', 'btn scan-act', text); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
  if (list.length) body.append(table(['IP address', 'Name', 'BACnet', 'MAC address', 'Ping', ''], list, (tr, x) => {
    const ipc = el('td', 'mono'); const ipb = el('button', 'nic-addr scan-ip', x.ip); ipb.type = 'button'; ipb.title = 'Copy ' + x.ip; ipb.onclick = () => copyText(x.ip); ipc.append(ipb);
    const bac = el('td');
    if (x.bac) { bac.append(el('span', 'scan-tag', '#' + x.bac.instance), document.createTextNode(' ' + vendor(x.bac))); }
    const act = el('td', 'scan-acts');
    act.append(btn('Open', 'Open http://' + x.ip + ' in the web browser', () => window.api.launch('http://' + x.ip)));
    tr.append(ipc, el('td', '', (x.bac && x.bac.name) || x.name || ''), bac, el('td', 'mono', x.mac || ''), el('td', 'mono', x.ms != null ? x.ms + ' ms' : 'no reply'), act);
  }));
  if (routed.length) {
    body.append(el('h4', 'scan-sub', 'BACnet devices behind routers (MS/TP and other networks)'));
    body.append(table(['Device', 'Name', 'Network', 'MAC', 'Through router', 'Vendor'], routed.sort((x, y) => x.net - y.net || x.instance - y.instance), (tr, d) => {
      const rt = el('td', 'mono'); const rb = el('button', 'nic-addr scan-ip', d.ip); rb.type = 'button'; rb.title = 'Copy ' + d.ip; rb.onclick = () => copyText(d.ip); rt.append(rb);
      tr.append(el('td', 'mono', '#' + d.instance), el('td', '', d.name || ''), el('td', 'mono', String(d.net)), el('td', 'mono', d.mac), rt, el('td', '', vendor(d)));
    }));
  }
  const plural2 = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  say('Found ' + plural2(list.length + routed.length, 'device') + ' on ' + a.name + (nBac ? ' (' + nBac + ' BACnet)' : ''), list.length + routed.length ? 'ok' : 'warn');
  if (!list.length && !routed.length) body.append(el('p', 'scan-note', 'Nothing answered. Check the cable and that this computer has an address on the right network.'));
  filter.oninput = () => { const q = filter.value.trim().toLowerCase(); body.querySelectorAll('tbody tr').forEach(tr => { tr.hidden = !!q && !tr.dataset.text.includes(q); }); };
}

// ---------- Sticky notes ----------
// Saved notes live in state.notes (newest first) with the rest of the settings; the sheet being written is
// kept in state.noteDraft as you type, so closing the app does not lose it. Saving tears the top sheet off.
const notesList = () => (state.notes = state.notes || []);
let noteId = null, draftTimer = 0;   // noteId: the saved note open on the pad, or null for a new one
function showNotes(open) {
  state.notesOpen = open;
  $('notes').hidden = !open;
  $('notesBtn').classList.toggle('on', open);
}
function notesView(list) {   // the pad, or the list of saved notes
  $('notesPadView').hidden = list; $('notesListView').hidden = !list;
  $('notesListBtn').classList.toggle('on', list);
  if (list) { drawNotesList(); $('notesFilter').focus(); }
}
function loadNote(n) {
  noteId = n ? n.id : null;
  $('noteTitle').value = n ? n.title : ''; $('noteBody').value = n ? n.body : '';
  $('noteState').textContent = n ? 'Editing a saved note' : '';
  $('notesCount').textContent = notesList().length;
}
const noteDirty = () => {
  const t = $('noteTitle').value.trim(), b = $('noteBody').value.trim(), n = noteId && notesList().find(x => x.id === noteId);
  return n ? t !== n.title || b !== n.body : !!(t || b);
};
function keepDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { state.noteDraft = { id: noteId, title: $('noteTitle').value, body: $('noteBody').value }; save(); }, 600);
}
function saveNote() {
  const title = $('noteTitle').value.trim(), body = $('noteBody').value.trim();
  if (!title && !body) return say('Nothing to save yet: the note is empty', 'info');
  const subject = title || body.split('\n')[0].slice(0, 40) || 'Untitled note', now = Date.now();
  let n = noteId && notesList().find(x => x.id === noteId);
  if (n) Object.assign(n, { title: subject, body, updated: now });
  else n = { id: 'n' + now, title: subject, body, created: now, updated: now };
  state.notes = [n, ...notesList().filter(x => x !== n)];
  clearTimeout(draftTimer); state.noteDraft = null; save();
  tearOff();
  loadNote(null);
  say('Saved note "' + subject + '"', 'ok');
}
// The top sheet tears off: a copy of it peels up from the pad and flies away, showing the blank sheet below.
function tearOff() {
  const sheet = $('note').cloneNode(true);
  sheet.removeAttribute('id'); sheet.classList.add('tearing'); sheet.setAttribute('aria-hidden', 'true');
  sheet.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  sheet.querySelector('.note-title').value = $('noteTitle').value;
  sheet.querySelector('.note-body').value = $('noteBody').value;
  sheet.querySelectorAll('input,textarea').forEach(e => { e.readOnly = true; e.tabIndex = -1; });
  $('note').parentElement.appendChild(sheet);
  sheet.querySelector('.note-body').scrollTop = $('noteBody').scrollTop;
  sheet.addEventListener('animationend', () => sheet.remove());
  setTimeout(() => sheet.remove(), 4000);   // backup in case animationend never fires
}
function drawNotesList() {
  const q = $('notesFilter').value.trim().toLowerCase(), box = $('notesItems');
  box.innerHTML = '';
  const all = notesList(), list = all.filter(n => !q || (n.title + ' ' + n.body).toLowerCase().includes(q));
  if (!list.length) {
    const p = document.createElement('p'); p.className = 'notes-empty';
    p.textContent = all.length ? 'No notes match "' + q + '".' : 'No saved notes yet. Write one on the pad and press Save note.';
    return box.appendChild(p);
  }
  for (const n of list) {
    const it = document.createElement('div');
    it.className = 'note-item'; it.tabIndex = 0; it.setAttribute('role', 'button'); it.title = 'Open "' + n.title + '"';
    const h = document.createElement('div'); h.className = 'note-item-t'; h.textContent = n.title;
    const d = document.createElement('div'); d.className = 'note-item-d';
    d.textContent = new Date(n.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const p = document.createElement('div'); p.className = 'note-item-p'; p.textContent = n.body;
    const del = document.createElement('button'); del.type = 'button'; del.className = 'note-item-x'; del.textContent = '×';
    del.title = 'Delete this note'; del.setAttribute('aria-label', 'Delete note ' + n.title);
    del.onclick = e => {
      e.stopPropagation();
      if (!confirm('Delete the note "' + n.title + '"?')) return;
      state.notes = notesList().filter(x => x !== n); save();
      if (noteId === n.id) loadNote(null);
      $('notesCount').textContent = notesList().length; drawNotesList();
      say('Deleted note "' + n.title + '"', 'info');
    };
    const open = () => {
      if (noteDirty() && noteId !== n.id && !confirm('Discard the note you are writing and open "' + n.title + '"?')) return;
      loadNote(n); notesView(false); $('noteBody').focus();
    };
    it.onclick = open;
    it.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    it.append(del, h, d, p);
    box.appendChild(it);
  }
}
$('notesBtn').onclick = () => { showNotes($('notes').hidden); save(); };
$('notesHide').onclick = () => { showNotes(false); save(); };
$('notesListBtn').onclick = () => notesView($('notesListView').hidden);
$('notesNew').onclick = () => {
  if (noteDirty() && !confirm('Discard the note you are writing and start a new one?')) return;
  loadNote(null); state.noteDraft = null; save(); notesView(false); $('noteTitle').focus();
};
$('noteSave').onclick = saveNote;
$('notesFilter').oninput = drawNotesList;
['noteTitle', 'noteBody'].forEach(id => $(id).addEventListener('input', keepDraft));
$('note').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNote(); } });
$('notesListView').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); notesView(false); } });
function initNotes() {
  showNotes(state.notesOpen != null ? state.notesOpen : innerWidth >= 1100);   // open by default where there is room
  loadNote(null);
  const d = state.noteDraft;
  if (d) {
    const n = d.id && notesList().find(x => x.id === d.id);
    if (n) loadNote(n);
    $('noteTitle').value = d.title || ''; $('noteBody').value = d.body || '';
  }
}

$('netBtn').onclick = () => showNet($('net').hidden);
$('netHide').onclick = () => showNet(false);
$('netRefresh').onclick = () => { netSig = null; netPoll(true); };
setInterval(netPoll, 2000);
setInterval(netAge, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) netPoll(true); });

let draft = [], draftIcon = '';
function openEditor(id) {
  editingId = id;
  const t = id ? state.tools.find(x => x.id === id) : { name: '', versions: [{ label: 'Default', path: '' }], active: 'Default', args: '', abbr: '', color: '#3a6ea5', cat: 'Apps' };
  draft = t.versions.map(v => ({ ...v }));
  draftIcon = t.icon || '';
  $('dlgTitle').textContent = id ? 'Edit ' + t.name : 'Add tool';
  $('fName').value = t.name; $('fArgs').value = t.args || ''; $('fAdmin').checked = !!t.admin;
  $('fAbbr').value = t.abbr; $('fColor').value = t.color; $('fCat').value = t.cat;
  $('fDelete').hidden = !id;
  $('pathTip').hidden = true;
  drawRows(); drawPrev();
  $('dlg').showModal();
}
function drawRows() {
  const box = $('verRows'); box.innerHTML = '';
  draft.forEach((v, i) => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('input');
    lab.className = 'vlabel'; lab.placeholder = 'Version'; lab.value = v.label; lab.setAttribute('list', 'labels');
    lab.oninput = () => { v.label = lab.value; };
    const path = document.createElement('input');
    path.placeholder = 'C:\\Program Files\\...\\app.exe or https://...'; path.value = v.path;
    path.oninput = () => { v.path = path.value.trim().replace(/^"(.*)"$/, '$1'); };   // "Copy as path" adds quotes
    path.onchange = () => { path.value = v.path; };
    const br = document.createElement('button'); br.type = 'button'; br.className = 'btn browse'; br.textContent = 'Browse';
    br.onclick = async () => {
      // Browsers never reveal where a file is, so the web version explains how to copy the path instead.
      if (window.api.web) { $('pathTip').hidden = false; path.focus(); return; }
      const p = await window.api.browse(); if (p) { v.path = p; path.value = p; }
    };
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn x'; rm.textContent = '\u00d7';
    rm.title = 'Remove this version'; rm.setAttribute('aria-label', 'Remove this version'); rm.disabled = draft.length < 2;
    rm.onclick = () => { draft.splice(i, 1); drawRows(); };
    row.append(lab, path, br, rm); box.appendChild(row);
  });
}
function drawPrev() {
  const p = $('iconPrev');
  p.innerHTML = '';
  p.style.setProperty('--c', $('fColor').value);
  p.className = 'badge' + (draftIcon ? ' real custom' : '');
  if (draftIcon) { const im = document.createElement('img'); im.src = draftIcon; im.alt = 'Icon preview'; p.appendChild(im); }
  else p.textContent = $('fAbbr').value || $('fName').value.slice(0, 2);
}
// Shrink big images so the settings file stays small.
function shrink(url) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      if (!im.width || !im.height) return res(url);
      const k = Math.min(1, 128 / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/png'));
    };
    im.onerror = () => res(url);
    im.src = url;
  });
}
$('iconPick').onclick = async () => { const u = await window.api.pickImage(); if (u) { draftIcon = await shrink(u); drawPrev(); } };
$('iconClear').onclick = () => { draftIcon = ''; drawPrev(); };
['fAbbr', 'fColor', 'fName'].forEach(id => $(id).addEventListener('input', drawPrev));
$('addVer').onclick = () => {
  draft.push({ label: '', path: draft.length ? draft[draft.length - 1].path : '' });  // copy the last path, then edit the version number in it
  drawRows(); box_focus();
};
function box_focus() { const r = $('verRows').querySelectorAll('.vlabel'); if (r.length) r[r.length - 1].focus(); }

$('fCancel').onclick = () => $('dlg').close();
$('fDelete').onclick = () => {
  if (!confirm('Delete this tool from the launcher?')) return;
  state.tools = state.tools.filter(x => x.id !== editingId);
  save(); $('dlg').close(); render();
};
$('form').onsubmit = () => {
  const name = $('fName').value.trim();
  const versions = draft.map((v, i) => ({
    label: v.label.trim() || (i ? 'Version ' + (i + 1) : 'Default'),
    path: v.path.trim().replace(/^"|"$/g, '')
  }));
  const prev = editingId ? state.tools.find(x => x.id === editingId) : null;
  const active = prev && versions.some(v => v.label === prev.active) ? prev.active : versions[0].label;
  const data = {
    name, versions, active, icon: draftIcon, args: $('fArgs').value.trim(), admin: $('fAdmin').checked,
    abbr: $('fAbbr').value.trim() || name.slice(0, 2), color: $('fColor').value, cat: $('fCat').value
  };
  if (prev) Object.assign(prev, data);
  else { newId = 't' + Date.now(); state.tools.push({ id: newId, ...data }); }
  save();
  render().then(() => {
    if (newId) { const el = document.querySelector('[data-id="' + newId + '"]'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); newId = null; }
  });
  say((prev ? 'Saved ' : 'Added ') + name, 'ok');
};

$('editBtn').onclick = () => {
  editMode = !editMode;
  $('editBtn').classList.toggle('on', editMode);
  $('editBtn').querySelector('.lbl').textContent = editMode ? 'Done' : 'Edit';
  $('hint').hidden = !editMode;
  render();
};
$('addBtn').onclick = () => openEditor(null);
$('themeBtn').onclick = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme; save();
};
$('search').oninput = render;
// Ctrl+K (or /) jumps to the search box
window.addEventListener('keydown', e => {
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) {
    e.preventDefault(); $('search').focus(); $('search').select();
  }
  if (e.key === 'Escape' && document.activeElement === $('search') && $('search').value) { $('search').value = ''; render(); }
});
// The look: always modern. modern.css only applies while <html data-ui="modern">; without it style.css gives
// the original classic design, which is no longer offered in the app.
function setLook(ui) {
  state.ui = ui;
  document.documentElement.dataset.ui = ui;
}
$('catBtn').onclick = () => {
  state.cat = state.cat === false;   // flips on <-> off (on is the default)
  $('catBtn').textContent = state.cat ? 'Cat: on' : 'Cat: off'; save();
  say(state.cat ? 'The cat will visit every couple of minutes' : 'The cat will stay away', 'info');
};
// Compact view: tiles become slim rows (body.compact in style.css / modern.css). Saved per person.
function setView(view) {
  state.view = view;
  const on = view === 'compact';
  document.body.classList.toggle('compact', on);
  $('viewBtn').textContent = on ? 'Compact: on' : 'Compact: off';
  $('viewBtn').setAttribute('aria-pressed', String(on));
  $('viewBtn').title = on ? 'Back to the normal view: larger tiles' : 'Compact view: slim tiles, more programs on screen';
}
// Open at Windows startup (desktop app only). Windows keeps this setting, not the app's settings file, so the
// button always shows what Windows will really do (including a "disabled" set in Task Manager).
if (!window.api.getStartup) document.body.classList.add('no-startup');
const showStartup = on => { $('startBtn').textContent = on ? 'Startup: on' : 'Startup: off'; $('startBtn').setAttribute('aria-pressed', String(on)); };
if (window.api.getStartup) window.api.getStartup().then(showStartup).catch(() => {});
$('startBtn').onclick = async () => {
  const want = $('startBtn').getAttribute('aria-pressed') !== 'true';
  const on = await window.api.setStartup(want);
  showStartup(on);
  if (on === want) say(on ? 'ALC Launcher will open when you sign in to Windows' : 'ALC Launcher will no longer open at startup', 'info');
  else say('Windows did not accept the change. Check Task Manager > Startup apps.', 'warn');
};
$('viewBtn').onclick = () => { setView(state.view === 'compact' ? 'comfortable' : 'compact'); save(); say(state.view === 'compact' ? 'Compact view' : 'Normal view', 'info'); };

// Update notice: checks the published version.json on start, every 30 minutes, and when the window
// comes back into view. "Later" hides it until an even newer build is published.
let skipped = 0, updMode = '';
async function checkUpdate(manual) {
  if (!window.api.checkUpdate) return;
  const u = await window.api.checkUpdate();
  if (u.current) $('stamp').textContent = 'Build ' + u.current;
  if (!u.current || !u.latest) return manual && say('Could not check for updates. Check your internet connection and try again.', 'error');
  if (u.latest <= u.current) return manual && say('You have the latest version (Build ' + u.current + ').', 'ok');
  // Desktop only: 'pending' = GitHub is still publishing it, 'quick' = installs in place, 'full' = needs the zip
  if (u.mode === 'pending') return manual && say('Build ' + u.latest + ' is still being published. Try again in a few minutes.', 'info');
  if (u.latest <= skipped && !manual) return;
  if (manual) say('Update available: Build ' + u.latest, 'info');
  updMode = window.api.web ? 'web' : u.mode;
  $('updMsg').textContent = 'Update available: Build ' + u.latest + (u.notes ? ' - ' + u.notes : '') +
    (updMode === 'full' ? '. This one needs a new download: extract the zip and replace your old ALC Launcher folder. Your tools and settings are kept.' : '');
  $('updBtn').textContent = { web: 'Reload to update', quick: 'Update now', full: 'Download' }[updMode];
  $('updBtn').disabled = false;
  $('updLater').onclick = () => { skipped = u.latest; $('update').hidden = true; };
  $('update').hidden = false;
}
// Web version only: offer the desktop app, which can actually start programs.
function showDesktop(msg) {
  $('deskCopied').textContent = msg || '';
  $('deskDlg').showModal();
}
if (window.api.desktopUrl) {
  $('deskBtn').href = $('deskGet').href = window.api.desktopUrl;
  $('deskBtn').onclick = e => { e.preventDefault(); showDesktop(); };
  $('deskGet').onclick = () => $('deskDlg').close();
}
$('updBtn').onclick = async () => {
  if (updMode !== 'quick') return window.api.applyUpdate();
  $('updBtn').disabled = true; say('Downloading the update...');
  const err = await window.api.applyUpdate();   // on success the window reloads with the new version
  if (err) { say('Update failed: ' + err + '. Check your internet connection and try again.', 'error'); $('updBtn').disabled = false; }
};
$('checkBtn').onclick = async () => {
  $('checkBtn').disabled = true; say('Checking for updates...');
  await checkUpdate(true);
  $('checkBtn').disabled = false;
};
setInterval(() => checkUpdate(), 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
init().then(() => checkUpdate());
