// A small cat that wanders along the top of the status bar every couple of minutes, sometimes stopping to
// groom itself (first visit right after the opening animation). Click it and it leaps away from the pointer;
// the 4th click sends it running off. Only its drawn shape is clickable, so it never blocks the tiles. It
// stays away while the window is hidden, and the "Cat" button in the status bar turns it off (state.cat in
// app.js). It shows even when Windows animation effects are off, since many work PCs have them off.
// Run alcCat() in the developer tools to call it now.
(() => {
  const EVERY = 2 * 60 * 1000;      // how often it visits
  const CROSS = 30 * 1000;          // time to walk from one side to the other (not counting grooming)
  const GROOM_CHANCE = 0.75;        // how often it stops to clean itself on a visit
  const GROOM_TIME = [3500, 6500];  // how long it grooms (random in this range, milliseconds)

  // Drawn facing right; .flip mirrors it. Legs, head and tail are separate groups so CSS can move them.
  const SVG = `<svg viewBox="0 0 120 84" aria-hidden="true">
  <g class="cat-tail"><path class="cat-line" d="M33 58C18 57 11 42 19 28" stroke-width="10"/><path d="M33 58C18 57 11 42 19 28" stroke="#f0a35e" stroke-width="5.5" fill="none" stroke-linecap="round"/></g>
  <rect class="cat-leg far a" x="35" y="60" width="9" height="20" rx="4.5"/>
  <rect class="cat-leg far b" x="71" y="60" width="9" height="20" rx="4.5"/>
  <g class="cat-body">
    <ellipse cx="56" cy="60" rx="27" ry="14" fill="#fbf4ea"/>
    <path d="M36 50c6-6 18-7 25-3c-3 6-14 9-25 7z" fill="#f0a35e"/>
    <ellipse class="cat-line" cx="56" cy="60" rx="27" ry="14" fill="none"/>
  </g>
  <rect class="cat-leg near b" x="42" y="60" width="9" height="20" rx="4.5"/>
  <g class="cat-head">
    <path class="cat-line" d="M69 31 72 7 87 21z" fill="#f0a35e"/>
    <path class="cat-line" d="M89 20 103 7 105 32z" fill="#fbf4ea"/>
    <path d="M73 26 74 14 82 21z M93 20 100 13 101 27z" fill="#f6a6b2"/>
    <circle class="cat-line" cx="87" cy="40" r="21" fill="#fbf4ea"/>
    <path d="M70 31c4-9 11-12 16-12c-2 6-8 10-16 12z" fill="#f0a35e"/>
    <g class="cat-eyes">
      <ellipse cx="80" cy="41" rx="4.3" ry="5.8" fill="#2b1f1a"/><ellipse cx="96" cy="41" rx="4.3" ry="5.8" fill="#2b1f1a"/>
      <circle cx="81.5" cy="38.6" r="1.7" fill="#fff"/><circle cx="97.5" cy="38.6" r="1.7" fill="#fff"/>
      <circle cx="79" cy="43.6" r=".8" fill="#fff"/><circle cx="95" cy="43.6" r=".8" fill="#fff"/>
    </g>
    <path class="cat-shut" d="M75.5 43q4.5-4.5 9 0M91.5 43q4.5-4.5 9 0" fill="none" stroke="#2b1f1a" stroke-width="2" stroke-linecap="round"/>
    <path class="cat-eek" d="M76 37.5 83 41 76 44.5M100 37.5 93 41 100 44.5" fill="none" stroke="#2b1f1a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="75" cy="49.5" rx="3.6" ry="2" fill="#f48ca0" opacity=".55"/><ellipse cx="101" cy="49.5" rx="3.6" ry="2" fill="#f48ca0" opacity=".55"/>
    <path d="M86.6 46.4h3.2l-1.6 1.7z" fill="#e7798e"/>
    <path d="M85.2 49q1.6 2.2 3 0q1.6 2.2 3 0" fill="none" stroke="#2b1f1a" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M69 46.5 59 45M69 50 59 51.5M105 46.5 115 45M105 50 115 51.5" stroke="#2b1f1a" stroke-width="1" opacity=".55" stroke-linecap="round"/>
  </g>
  <rect class="cat-leg near a front" x="78" y="60" width="9" height="20" rx="4.5"/>   <!-- in front of the head so the raised paw shows while grooming -->
</svg>`;

  const cat = document.createElement('div');
  cat.id = 'cat';
  cat.innerHTML = SVG;
  document.body.appendChild(cat);
  let busy = false, onClick = null;

  // Clicking the cat (only its drawn shape, and only while it is on screen) makes it leap away from the
  // pointer. After CLICKS_TO_SCARE clicks it lands and runs off, and the visit timer starts over.
  const CLICKS_TO_SCARE = 4, JUMP_TIME = 480, JUMP_HEIGHT = 46, JUMP_DIST = [85, 120], RUN_SPEEDUP = 4;
  cat.addEventListener('pointerdown', e => { if (onClick && e.button === 0) { e.preventDefault(); onClick(e.clientX); } });

  // opts (for testing): { cross: ms, groomAt: 0..1 of the way across, groomFor: ms, force: true, fromLeft: bool }
  function visit(opts = {}) {
    if (busy || (!opts.force && (document.hidden || (typeof state !== 'undefined' && state.cat === false)))) return;
    busy = true;
    const footer = document.querySelector('footer');
    cat.style.bottom = (footer ? innerHeight - footer.getBoundingClientRect().top - 1 : 0) + 'px';   // feet on the status bar's top edge
    const w = cat.offsetWidth, speed = (innerWidth + w) / (opts.cross || CROSS);
    const fromLeft = opts.fromLeft != null ? opts.fromLeft : Math.random() < 0.5;
    const dir = fromLeft ? 1 : -1;   // the way it is walking: 1 = to the right
    const grooms = opts.groomAt != null || Math.random() < GROOM_CHANCE;
    const groomAt = (innerWidth + w) * (opts.groomAt != null ? opts.groomAt : 0.25 + Math.random() * 0.5);
    const groomFor = opts.groomFor || GROOM_TIME[0] + Math.random() * (GROOM_TIME[1] - GROOM_TIME[0]);
    let x = fromLeft ? -w : innerWidth, y = 0, travelled = 0, last = performance.now();
    let mode = 'walk', groomUntil = 0, groomed = !grooms, clicks = 0, jump = null, runDir = dir;
    const pose = (m, face) => {
      mode = m;
      cat.className = cat.className.replace(/\b(walk|groom|jump|run)\b/g, '').trim();
      cat.classList.add('show', m);
      cat.classList.toggle('flip', face < 0);
    };
    pose('walk', dir);
    onClick = clientX => {
      clicks++;
      const away = clientX < x + w / 2 ? 1 : -1;   // leap away from the side that was clicked
      const dist = JUMP_DIST[0] + Math.random() * (JUMP_DIST[1] - JUMP_DIST[0]);
      jump = { x0: x, x1: x + away * dist, y0: y, t0: performance.now(), dir: away };
      groomUntil = 0; groomed = true;   // no more grooming once it has been startled
      if (clicks >= CLICKS_TO_SCARE) { runDir = away; onClick = null; }   // last straw: it runs off after landing
      pose('jump', away);
    };
    const frame = now => {
      const dt = Math.min(now - last, 100); last = now;   // a hidden window pauses frames; don't jump ahead after
      if (mode === 'jump') {
        const p = Math.min(1, (now - jump.t0) / JUMP_TIME);
        x = jump.x0 + (jump.x1 - jump.x0) * (1 - (1 - p) * (1 - p));   // fast take-off, soft landing
        y = jump.y0 * (1 - p) - JUMP_HEIGHT * Math.sin(Math.PI * p);
        if (p >= 1) { y = 0; if (onClick) pose('walk', dir); else pose('run', runDir); }
      } else if (mode === 'groom') {
        if (now >= groomUntil) pose('walk', dir);
      } else if (mode === 'run') {
        x += runDir * speed * RUN_SPEEDUP * dt;
      } else {
        x += dir * speed * dt; travelled += speed * dt;
        if (!groomed && travelled >= groomAt) { groomed = true; groomUntil = now + groomFor; pose('groom', dir); }
      }
      cat.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      const d = mode === 'run' ? runDir : dir;
      if (mode === 'jump' || (d > 0 ? x < innerWidth : x > -w)) return requestAnimationFrame(frame);
      // gone off the edge
      cat.className = cat.className.replace(/\b(show|walk|groom|jump|run)\b/g, '').trim();
      onClick = null; busy = false;
      if (mode === 'run') schedule();   // chased off: the usual wait starts again from now
    };
    requestAnimationFrame(frame);
  }
  // First walk as soon as the opening animation is gone, then every EVERY
  let timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { visit(); schedule(); }, EVERY); }
  const first = () => document.getElementById('splash') ? setTimeout(first, 250) : (visit(), schedule());
  first();
  window.alcCat = visit;
})();
