const CATS = ['Apps', 'Browsers', 'Other'];
const PF = 'C:\\Program Files\\', PF86 = 'C:\\Program Files (x86)\\';
// Paths for ALC tools are left blank on purpose: click a tile (or use Edit) and Browse to the .exe once.
const DEFAULTS = [
  ['WebCTRL Server','W','#3a6ea5','Apps',''], ['Site Builder','sb','#1c1c1c','Apps',''],
  ['EIKON Logic Builder','ek','#4d6b3c','Apps',''], ['View Builder','vb','#1c1c1c','Apps',''],
  ['WebCTRL Design Server','W','#7a5a8c','Apps',''], ['Third-Party BACnet Utility','B','#2b3a4a','Apps',''],
  ['LONworks Integration Tool','L','#b8442f','Apps',''], ['Equipment Builder','eb','#1c1c1c','Apps',''],
  ['Field Assistant','fa','#14808a','Apps',''], ['Alarm Notification Client','an','#a02a2a','Apps',''],
  ['Virtual BACview','bv','#1c1c1c','Apps',''], ['Test + Balance','tb','#6a3d8f','Apps',''],
  ['Trend Conversion Utility','tc','#c0392b','Apps',''], ['Sensor Builder','S','#1c1c1c','Apps',''],
  ['Sensor Scan','ss','#1c1c1c','Apps',''], ['PuTTY','P','#2d6fb7','Apps',PF+'PuTTY\\putty.exe'],
  ['Windows Explorer','fx','#c99a2e','Apps','C:\\Windows\\explorer.exe'], ['Wireshark','ws','#1f7aa8','Apps',PF+'Wireshark\\Wireshark.exe'],
  ['SeriCap','sc','#7b6a1f','Apps',''], ['BBMD Config. Tool','BB','#1c1c1c','Apps',''],
  ['Internet Explorer','ie','#2a8fd6','Browsers',PF+'Internet Explorer\\iexplore.exe'],
  ['Microsoft Edge','e','#1b8a8f','Browsers',PF86+'Microsoft\\Edge\\Application\\msedge.exe'],
  ['Google Chrome','gc','#d44638','Browsers',PF+'Google\\Chrome\\Application\\chrome.exe'],
  ['Mozilla Firefox','ff','#e66a1f','Browsers',PF+'Mozilla Firefox\\firefox.exe']
].map((d, i) => ({ id: 'd' + i, name: d[0], abbr: d[1], color: d[2], cat: d[3], versions: [{ label: 'Default', path: d[4] }], active: 'Default', args: '' }));

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
  state.tools.forEach(t => {   // upgrade settings saved by the older single-path version
    if (!t.versions) { t.versions = [{ label: 'Default', path: t.path || '' }]; t.active = 'Default'; delete t.path; }
  });
  document.documentElement.dataset.theme = state.theme;
  CATS.forEach(c => $('fCat').add(new Option(c, c)));
  await render();
  intro = false;
}

async function render() {
  const q = $('search').value.trim().toLowerCase();
  const board = $('board');
  board.innerHTML = '';
  board.className = editMode ? 'editing' : '';
  refreshGlobal();
  let shown = 0;
  for (const cat of CATS) {
    const items = state.tools.filter(t => t.cat === cat && t.name.toLowerCase().includes(q));
    if (!items.length) continue;
    shown += items.length;
    const g = document.createElement('section');
    g.className = 'group';
    g.innerHTML = `<h2>${cat}</h2><div class="grid"></div>`;
    board.appendChild(g);
    for (const t of items) g.lastChild.appendChild(await makeTile(t));
  }
  if (!shown) board.innerHTML = '<p class="empty">No tools match. Turn on Edit to add one.</p>';
}

async function makeTile(t) {
  const v = getVer(t);
  const ok = await window.api.exists(v.path);
  const icon = ok && !/^https?:/i.test(v.path) ? await window.api.icon(v.path) : null;
  const b = document.createElement('div');
  b.className = 'tile'; b.tabIndex = 0; b.dataset.id = t.id;
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
  return b;
}

// Header dropdown: switch every tool that has a matching version label in one go.
function refreshGlobal() {
  const sel = $('verSel'), labels = allLabels();
  sel.hidden = labels.length < 2;
  sel.innerHTML = '';
  labels.forEach(l => sel.add(new Option('Version: ' + l, l)));
  const multi = state.tools.filter(t => t.versions.length > 1);
  const same = labels.find(l => multi.length && multi.every(t => t.active === l || !t.versions.some(x => x.label === l)));
  if (same) sel.value = same; else { sel.add(new Option('Version: mixed', ''), 0); sel.value = ''; }
  $('labels').innerHTML = '';
  labels.forEach(l => { const o = document.createElement('option'); o.value = l; $('labels').appendChild(o); });
}
$('verSel').onchange = e => {
  const l = e.target.value; if (!l) return;
  state.tools.forEach(t => { if (t.versions.some(v => v.label === l)) t.active = l; });
  save(); render(); say('Switched tools to version ' + l);
};

async function launch(t) {
  say('Opening ' + t.name + '...');
  const err = await window.api.launch(getVer(t).path, t.args);
  if (err === 'COPIED') return say('Browsers cannot start programs. Path of ' + t.name + ' copied: paste it into Start or Win+R.');
  if (err === 'COPY_FAILED') return say('Browsers cannot start programs. Path: ' + getVer(t).path);
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
    path.oninput = () => { v.path = path.value; };
    const br = document.createElement('button'); br.type = 'button'; br.className = 'btn browse'; br.textContent = 'Browse';
    br.onclick = async () => { const p = await window.api.browse(); if (p) { v.path = p; path.value = p; } };
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
  $('editBtn').textContent = editMode ? 'Done' : 'Edit';
  $('hint').hidden = !editMode;
  render();
};
$('addBtn').onclick = () => openEditor(null);
$('themeBtn').onclick = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme; save();
};
$('search').oninput = render;

// Update notice: checks the published version.json on start, every 30 minutes, and when the window
// comes back into view. "Later" hides it until an even newer build is published.
let skipped = 0;
async function checkUpdate() {
  if (!window.api.checkUpdate) return;
  const u = await window.api.checkUpdate();
  if (u.current) $('stamp').textContent = 'Build ' + u.current;
  if (!u.current || !u.latest || u.latest <= u.current || u.latest <= skipped) return;
  $('updMsg').textContent = 'Update available: Build ' + u.latest + (u.notes ? ' - ' + u.notes : '') +
    (window.api.web ? '' : '. Download it, then run build.bat again.');
  $('updBtn').textContent = window.api.web ? 'Reload to update' : 'Download';
  $('updLater').onclick = () => { skipped = u.latest; $('update').hidden = true; };
  $('update').hidden = false;
}
$('updBtn').onclick = () => window.api.applyUpdate();
setInterval(checkUpdate, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
init().then(checkUpdate);
