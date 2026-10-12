// Browser / installed-app (PWA) version of the bridge that preload.js gives the desktop app.
// In the desktop app window.api already exists, so none of this runs there.
if (!window.api) {
  const KEY = 'alc-launcher-config';
  const isUrl = p => /^[a-z][a-z0-9+.-]+:/i.test(p) && !/^[a-z]:[\\/]/i.test(p);   // https:, ssh:, ms-word: ... but not C:\
  const pickFile = accept => new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return res(null);
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = () => res(null);
      r.readAsDataURL(f);
    };
    inp.click();
  });
  const getVersion = q => fetch('version.json' + q, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const running = getVersion('');   // the build this page was loaded with
  window.api = {
    web: true,
    checkUpdate: async () => {
      const [cur, latest] = await Promise.all([running, getVersion('?fresh=' + Date.now())]);
      return { current: cur && cur.build, latest: latest && latest.build, notes: latest && latest.notes };
    },
    applyUpdate: async () => location.reload(),
    load: async () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    save: async d => { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; } },
    exists: async p => !!p,   // a browser cannot look at the disk, so any path that is filled in counts
    browse: async () => null,
    pickImage: () => pickFile('image/*'),
    icon: async () => null,
    configPath: async () => 'browser storage',
    // Browsers are not allowed to start programs on the PC. Web links open; local paths are copied instead.
    launch: async p => {
      if (isUrl(p)) { window.open(p, '_blank', 'noopener'); return ''; }
      try { await navigator.clipboard.writeText(p); return 'COPIED'; } catch { return 'COPY_FAILED'; }
    }
  };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // "Install" button for browsers that support it (Chrome, Edge, Android). iPhone/iPad: Share > Add to Home Screen.
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e;
    const b = document.getElementById('installBtn'); if (b) b.hidden = false;
  });
  window.addEventListener('appinstalled', () => { const b = document.getElementById('installBtn'); if (b) b.hidden = true; });
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('web');
    const b = document.getElementById('installBtn'); if (!b) return;
    b.onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.hidden = true; };
  });
}
