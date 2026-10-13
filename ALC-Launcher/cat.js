// A small cat that wanders along the top of the status bar every couple of minutes, sometimes stopping to
// groom itself. Purely decorative: clicks go straight through it, it stays away while the window is hidden,
// and the "Cat" button in the status bar turns it off (state.cat in app.js). It shows even when Windows
// animation effects are off, since many work PCs have them off. Run alcCat() in the developer tools to call it now.
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
  let busy = false;

  // opts (for testing): { cross: ms, groomAt: 0..1 of the way across, groomFor: ms, force: true }
  function visit(opts = {}) {
    if (busy || (!opts.force && (document.hidden || (typeof state !== 'undefined' && state.cat === false)))) return;
    busy = true;
    const footer = document.querySelector('footer');
    cat.style.bottom = (footer ? innerHeight - footer.getBoundingClientRect().top - 1 : 0) + 'px';   // feet on the status bar's top edge
    const w = cat.offsetWidth, dist = innerWidth + w, speed = dist / (opts.cross || CROSS);
    const fromLeft = Math.random() < 0.5;
    const grooms = opts.groomAt != null || Math.random() < GROOM_CHANCE;
    const groomAt = dist * (opts.groomAt != null ? opts.groomAt : 0.25 + Math.random() * 0.5);
    const groomFor = opts.groomFor || GROOM_TIME[0] + Math.random() * (GROOM_TIME[1] - GROOM_TIME[0]);
    let walked = 0, last = performance.now(), groomUntil = 0, groomed = !grooms;
    cat.classList.toggle('flip', !fromLeft);
    cat.className = cat.className.replace(/\b(walk|groom)\b/g, '').trim();
    cat.classList.add('show', 'walk');
    const frame = now => {
      const dt = Math.min(now - last, 100); last = now;   // a hidden window pauses frames; don't jump ahead after
      if (groomUntil) {
        if (now >= groomUntil) { groomUntil = 0; cat.classList.replace('groom', 'walk'); }
      } else {
        walked += speed * dt;
        if (!groomed && walked >= groomAt) { groomed = true; groomUntil = now + groomFor; cat.classList.replace('walk', 'groom'); }
      }
      cat.style.transform = 'translateX(' + (fromLeft ? walked - w : innerWidth - walked) + 'px)';
      if (walked < dist) return requestAnimationFrame(frame);
      cat.classList.remove('show', 'walk', 'groom');
      busy = false;
    };
    requestAnimationFrame(frame);
  }
  setInterval(visit, EVERY);
  window.alcCat = visit;
})();
