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
    versions: [{ label: 'Default', path: 'C:\\Windows\\System32\\cmd.exe' }], active: 'Default', args: '/c start "IP Config" cmd /k ipconfig' }   // start opens a new Command Prompt window
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
const getVer = t => t.versions.find(v => v.label === t.active) || t.versions[0];
const allLabels = () => [...new Set(state.tools.flatMap(t => t.versions.map(v => v.label)))];
const say = t => { $('status').textContent = t; };

async function init() {
  startSplash();
  const saved = await window.api.load();
  state = saved || { theme: 'dark', tools: DEFAULTS };
  state.added = state.added || [];   // ids from ADDED this settings file has already been given
  for (const t of ADDED) {
    if (state.added.includes(t.id)) continue;
    if (!state.tools.some(x => x.id === t.id)) state.tools.push(JSON.parse(JSON.stringify(t)));
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
  setLook(state.ui || 'modern');
  $('catBtn').textContent = state.cat === false ? 'Cat: off' : 'Cat: on';
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
  const ok = await window.api.exists(v.path);
  const icon = ok && !/^https?:/i.test(v.path) ? await window.api.icon(v.path) : null;
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
  b.oncontextmenu = e => { e.preventDefault(); openEditor(t.id); };
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
  save(); render(); say('Moved ' + t.name);
}

// Version names already in use, offered as suggestions when typing a version name in the editor.
function refreshLabels() {
  const labels = allLabels();
  $('labels').innerHTML = '';
  labels.forEach(l => { const o = document.createElement('option'); o.value = l; $('labels').appendChild(o); });
}

async function launch(t) {
  say('Opening ' + t.name + '...');
  const err = await window.api.launch(getVer(t).path, t.args);
  if (err === 'COPIED' || err === 'COPY_FAILED') {
    say(err === 'COPIED' ? 'Path of ' + t.name + ' copied.' : 'Path: ' + getVer(t).path);
    return showDesktop(err === 'COPIED' ? 'For now, the path of ' + t.name + ' was copied, so you can paste it into Win+R.' : '');
  }
  say(err ? 'Could not open ' + t.name + ': ' + err : 'Opened ' + t.name);
}

let draft = [], draftIcon = '';
function openEditor(id) {
  editingId = id;
  const t = id ? state.tools.find(x => x.id === id) : { name: '', versions: [{ label: 'Default', path: '' }], active: 'Default', args: '', abbr: '', color: '#3a6ea5', cat: 'Apps' };
  draft = t.versions.map(v => ({ ...v }));
  draftIcon = t.icon || '';
  $('dlgTitle').textContent = id ? 'Edit ' + t.name : 'Add tool';
  $('fName').value = t.name; $('fArgs').value = t.args || '';
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
    name, versions, active, icon: draftIcon, args: $('fArgs').value.trim(),
    abbr: $('fAbbr').value.trim() || name.slice(0, 2), color: $('fColor').value, cat: $('fCat').value
  };
  if (prev) Object.assign(prev, data);
  else { newId = 't' + Date.now(); state.tools.push({ id: newId, ...data }); }
  save();
  render().then(() => {
    if (newId) { const el = document.querySelector('[data-id="' + newId + '"]'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); newId = null; }
  });
  say((prev ? 'Saved ' : 'Added ') + name);
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
// Modern or classic look (modern.css only applies while <html data-ui="modern">)
function setLook(ui) {
  state.ui = ui;
  document.documentElement.dataset.ui = ui;
  $('uiBtn').textContent = ui === 'modern' ? 'Classic look' : 'Modern look';
}
$('catBtn').onclick = () => {
  state.cat = state.cat === false;   // flips on <-> off (on is the default)
  $('catBtn').textContent = state.cat ? 'Cat: on' : 'Cat: off'; save();
  say(state.cat ? 'The cat will visit every couple of minutes' : 'The cat will stay away');
};
$('uiBtn').onclick = () => { setLook(state.ui === 'modern' ? 'classic' : 'modern'); save(); say(state.ui === 'modern' ? 'Switched to the modern look' : 'Switched to the classic look'); };

// Update notice: checks the published version.json on start, every 30 minutes, and when the window
// comes back into view. "Later" hides it until an even newer build is published.
let skipped = 0, updMode = '';
async function checkUpdate(manual) {
  if (!window.api.checkUpdate) return;
  const u = await window.api.checkUpdate();
  if (u.current) $('stamp').textContent = 'Build ' + u.current;
  if (!u.current || !u.latest) return manual && say('Could not check for updates. Check your internet connection and try again.');
  if (u.latest <= u.current) return manual && say('You have the latest version (Build ' + u.current + ').');
  // Desktop only: 'pending' = GitHub is still publishing it, 'quick' = installs in place, 'full' = needs the zip
  if (u.mode === 'pending') return manual && say('Build ' + u.latest + ' is still being published. Try again in a few minutes.');
  if (u.latest <= skipped && !manual) return;
  if (manual) say('Update available: Build ' + u.latest);
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
  if (err) { say('Update failed: ' + err + '. Check your internet connection and try again.'); $('updBtn').disabled = false; }
};
$('checkBtn').onclick = async () => {
  $('checkBtn').disabled = true; say('Checking for updates...');
  await checkUpdate(true);
  $('checkBtn').disabled = false;
};
setInterval(() => checkUpdate(), 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
init().then(() => checkUpdate());
