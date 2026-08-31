/* House-hunt map (shared by every region — see index.html per folder).
   1. Password gate decrypts data.encrypted in the browser (AES-256-GCM / PBKDF2).
   2. Renders layered, toggleable markers on a Leaflet map.
   3. Click any two pins to route between them (distance + time) via OSRM.
   Region differences (per-device password memory key, etc.) come from the page's
   optional `window.MAP_CONFIG`; data.encrypted/data.json are loaded by RELATIVE
   path, so each region folder gets its own automatically. */

const MAP_CONFIG = window.MAP_CONFIG || {};
const STORAGE_KEY = MAP_CONFIG.storageKey || 'knox-map-key';
const DATA_URL = 'data.encrypted';
const PLAINTEXT_URL = 'data.json';

// On localhost we skip the password entirely and read the plaintext data.json
// (git-ignored, never deployed). The live site has no data.json, so it always
// falls through to the encrypted + password flow.
function isLocalHost() {
  return ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
}

/* ---------- crypto ---------- */
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptData(payload, password) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.data)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

/* ---------- gate flow ---------- */
let encryptedPayload = null;

async function loadPayload() {
  if (encryptedPayload) return encryptedPayload;
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${DATA_URL} (${res.status})`);
  encryptedPayload = await res.json();
  return encryptedPayload;
}

function revealMap(data) {
  const gate = document.getElementById('gate');
  if (gate) gate.remove();
  document.getElementById('route-panel').hidden = false;
  initMap(data);
}

async function tryUnlock(password, remember) {
  const payload = await loadPayload();
  const data = await decryptData(payload, password); // throws if wrong password
  if (remember) localStorage.setItem(STORAGE_KEY, password);
  revealMap(data);
}

// Local dev: load plaintext data.json and skip the gate. Returns false if there
// is no data.json (e.g. on the deployed site), so we can fall back to the gate.
async function tryLocalPlaintext() {
  const res = await fetch(PLAINTEXT_URL, { cache: 'no-store' });
  if (!res.ok) return false;
  revealMap(await res.json());
  return true;
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('gate-form');
  const err = document.getElementById('gate-err');

  // Localhost: skip the gate and use plaintext data.json if present.
  if (isLocalHost()) {
    tryLocalPlaintext().catch(() => false).then(loaded => {
      if (loaded) return;
      // No data.json locally — fall back to remembered password if any.
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) tryUnlock(saved, true).catch(() => localStorage.removeItem(STORAGE_KEY));
    });
    return;
  }

  // Deployed: auto-unlock if we remembered a password that still works.
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    tryUnlock(saved, true).catch(() => {
      localStorage.removeItem(STORAGE_KEY); // stale/wrong — fall back to prompt
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = document.getElementById('unlock');
    const pw = document.getElementById('pw').value;
    const remember = document.getElementById('remember').checked;
    if (!pw) { err.textContent = 'Enter the password.'; return; }
    btn.disabled = true; btn.textContent = 'Unlocking…';
    try {
      await tryUnlock(pw, remember);
    } catch (ex) {
      err.textContent = (ex && ex.name === 'OperationError')
        ? 'Wrong password. Try again.'
        : 'Could not unlock: ' + (ex.message || ex);
      btn.disabled = false; btn.textContent = 'Unlock';
    }
  });
});

/* ---------- map ---------- */
let map;
const routeState = { start: null, end: null, line: null };
let layerIndex = []; // [{ id, group }] for persisting which layers are shown
let allPoints = []; // [{ name, lat, lng, layer:{id,name,color,glyph} }] for nearest-places lists
let homes = [];      // [{ idx, point, marker }] candidate homes, for the compare panel
let brands = [];     // [{ id, name, color, glyph }] store brands = row order in the compare grid
let compareState = null; // { houses:number[], selecting:boolean } while the compare panel is open
let houseTimes = {}; // homeIdx -> { brandId: pick } | 'loading' (each home's nearest of every brand)

function makeIcon(layer, point) {
  if (point.iconUrl) {
    return L.icon({ iconUrl: point.iconUrl, iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -30] });
  }
  const glyph = layer.glyph || '';
  const html =
    `<div style="background:${layer.color};width:26px;height:26px;border-radius:50%;` +
    `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;` +
    `align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">${glyph}</div>`;
  return L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function popupHtml(point, isHome) {
  let rows = '';
  if (point.details) {
    for (const [k, v] of Object.entries(point.details)) {
      rows += `<tr><td class="k">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`;
    }
  }
  const cmp = isHome ? `<div><button class="cmp-btn" type="button">⇄ Compare homes</button></div>` : '';
  // Home development / listing website, opened in a new tab (noopener for safety).
  const link = point.url
    ? `<div class="pop-link"><a href="${escapeHtml(point.url)}" target="_blank" rel="noopener noreferrer">Website ↗</a></div>`
    : '';
  return `<div class="pname">${escapeHtml(point.name)}</div>` + link + cmp +
    (rows ? `<table>${rows}</table>` : '') +
    `<div class="near-list"><div class="near-loading">Finding nearest places…</div></div>`;
}

// Geo helpers for the nearest-places list.
function haversineMi(a, b) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const toR = d => d * Math.PI / 180, toD = r => r * 180 / Math.PI;
  const dLng = toR(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toR(b.lat));
  const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(dLng);
  return (toD(Math.atan2(y, x)) + 360) % 360;
}
function angleDiff(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

// One OSRM table request (source = src → every candidate) returns per-candidate
// driving time/distance/bearing. Candidates are all points NOT in srcLayerId and
// not at src's own location. Falls back to a straight-line estimate (~30 mph) if
// OSRM is slow/unavailable. Returns fresh copies so callers can compute per-source
// times independently (the compare panel does this for several homes at once).
async function computeCandTimes(src, srcLayerId) {
  const cands = allPoints
    .filter(p => p.layer.id !== srcLayerId &&
      !(Math.abs(p.lat - src.lat) < 1e-9 && Math.abs(p.lng - src.lng) < 1e-9))
    .map(p => ({ name: p.name, lat: p.lat, lng: p.lng, layer: p.layer }));
  if (!cands.length) return cands;

  let durs = null, dists = null;
  try {
    const coords = [src, ...cands].map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000); // don't stall if OSRM is slow/rate-limited
    const j = await (await fetch(url, { signal: ctrl.signal })).json();
    clearTimeout(timer);
    if (j.code === 'Ok' && j.durations && j.durations[0]) { durs = j.durations[0]; dists = j.distances && j.distances[0]; }
  } catch (e) { /* fall back to straight-line estimate below */ }

  cands.forEach((p, i) => {
    if (durs && durs[i + 1] != null) {
      p._min = durs[i + 1] / 60;
      p._mi = dists && dists[i + 1] != null ? dists[i + 1] / 1609.34 : haversineMi(src, p);
      p._est = false;
    } else {
      p._mi = haversineMi(src, p); p._min = p._mi * 2; p._est = true;
    }
    p._bear = bearing(src, p);
  });
  return cands;
}

// Each home's nearest store of EVERY brand (one per brand) → { brandId: pick }.
// Used to fill a column of the compare grid.
async function nearestByBrand(src) {
  const cands = await computeCandTimes(src, 'homes');
  const out = {};
  cands.forEach(p => { const cur = out[p.layer.id]; if (!cur || p._min < cur._min) out[p.layer.id] = p; });
  return out;
}

// Fills a pin's popup with the nearest place of each other type (driving time
// from OSRM's table service — one request for all), plus a 2nd of a type when
// it's both close and in a clearly different direction. Tapping a row plots it.
async function populateNearest(src, srcLayer, popup) {
  const el = popup.getElement();
  const listEl = el && el.querySelector('.near-list');
  if (!listEl) return;

  const cands = await computeCandTimes(src, srcLayer.id);
  if (!cands.length) { listEl.innerHTML = '<div class="near-empty">Nothing else to compare.</div>'; return; }

  const byBrand = {};
  cands.forEach(p => (byBrand[p.layer.id] ||= []).push(p));
  const picks = [];
  Object.values(byBrand).forEach(list => {
    list.sort((a, b) => a._min - b._min);
    picks.push(list[0]);
    if (list[1] && list[1]._min <= list[0]._min * 1.5 && angleDiff(list[0]._bear, list[1]._bear) > 50) picks.push(list[1]);
  });
  picks.sort((a, b) => a._min - b._min);

  const approx = picks.some(p => p._est);
  listEl.innerHTML =
    `<div class="near-hd">Nearest places${approx ? ' (approx)' : ''}</div>` +
    picks.map((p, i) =>
      `<button class="near-row" data-i="${i}">` +
      `<span class="legend-chip" style="background:${p.layer.color}">${escapeHtml(p.layer.glyph)}</span>` +
      `<span class="near-name">${escapeHtml(p.name)}</span>` +
      `<span class="near-time">${p._est ? '~' : ''}${Math.round(p._min)} min</span></button>`
    ).join('');

  listEl.querySelectorAll('.near-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = picks[+btn.dataset.i];
      setSlot('start', { name: src.name, lat: src.lat, lng: src.lng }, false);
      setSlot('end', { name: p.name, lat: p.lat, lng: p.lng }, false);
      computeRoute(true);
      map.closePopup();
      if (window.matchMedia('(max-width: 640px)').matches)
        document.getElementById('route-panel').classList.add('drawer-open');
    });
  });
}

/* ---------- house-to-house compare panel ----------
   Rows = brands, columns = candidate homes; each cell is that home's drive time
   to its OWN nearest store of that brand (aligned so you compare like with like).
   PHASE 1: compareState is in-memory only; the browser Back button is not yet
   wired to these steps (that is Phase 2). */
function homeLabel(idx) { const p = homes[idx].point; return p.label || p.name; }

function openCompare(homeIdx) {
  compareState = { houses: [homeIdx], selecting: true, sort: null }; // start by picking a 2nd home
  document.getElementById('compare-panel').hidden = false;
  renderCompare();
}
function closeCompare() {
  compareState = null;
  document.getElementById('compare-panel').hidden = true;
}
// Lazily fetch (and cache) a home's nearest-of-every-brand, re-rendering when ready.
function ensureHouseTimes(idx) {
  if (houseTimes[idx]) return; // resolved or already loading
  houseTimes[idx] = 'loading';
  nearestByBrand(homes[idx].point).then(res => { houseTimes[idx] = res; if (compareState) renderCompare(); });
}

function renderCompare() {
  if (!compareState) return;
  const grid = document.querySelector('#compare-panel .cmp-grid');
  const houses = compareState.houses;
  houses.forEach(ensureHouseTimes);

  const head = '<tr><th class="cmp-rail"></th>' +
    houses.map(idx => {
      const active = compareState.sort && compareState.sort.house === idx;
      const arrow = active ? (compareState.sort.dir === 1 ? ' ▲' : ' ▼') : '';
      return `<th class="cmp-head${active ? ' cmp-sorted' : ''}" data-house="${idx}" ` +
        `title="Sort by drive time from ${escapeHtml(homeLabel(idx))}">` +
        `${escapeHtml(homeLabel(idx))}<span class="cmp-arrow">${arrow}</span></th>`;
    }).join('') + '</tr>';

  // Row order: default = data order; if a house header was clicked, sort brands by
  // that house's drive time (missing/loading data sinks to the bottom).
  let orderedBrands = brands;
  const sort = compareState.sort, sortHt = sort && houseTimes[sort.house];
  if (sort && sortHt && sortHt !== 'loading') {
    orderedBrands = brands.slice().sort((a, b) => {
      const va = sortHt[a.id] ? sortHt[a.id]._min : Infinity;
      const vb = sortHt[b.id] ? sortHt[b.id]._min : Infinity;
      return (va - vb) * sort.dir;
    });
  }
  const body = orderedBrands.map(b => {
    const cells = houses.map(idx => {
      const ht = houseTimes[idx];
      if (!ht || ht === 'loading') return '<td class="cmp-cell"><span class="cmp-loading">…</span></td>';
      const pick = ht[b.id];
      if (!pick) return '<td class="cmp-cell">—</td>';
      return `<td class="cmp-cell"><button class="cmp-time" data-house="${idx}" data-brand="${escapeHtml(b.id)}" ` +
        `title="${escapeHtml(pick.name)}">${pick._est ? '~' : ''}${Math.round(pick._min)} min</button></td>`;
    }).join('');
    return `<tr><td class="cmp-rail"><span class="legend-chip" style="background:${b.color}">${escapeHtml(b.glyph)}</span></td>${cells}</tr>`;
  }).join('');
  const table = `<table class="cmp-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;

  // Trailing column: the Compare button, or (while selecting) a picker of the
  // homes not yet added. Compare sits further right as more homes are added.
  const remaining = homes.map(h => h.idx).filter(idx => !houses.includes(idx));
  let add = '';
  if (compareState.selecting) {
    add = `<div class="cmp-add"><div class="cmp-picker-hd">Add a home</div>` +
      (remaining.length
        ? remaining.map(idx => `<button class="cmp-pick" data-idx="${idx}">${escapeHtml(homeLabel(idx))}</button>`).join('')
        : '<div class="cmp-none">No more homes</div>') + `</div>`;
  } else if (remaining.length) {
    add = `<div class="cmp-add"><button class="cmp-add-btn" type="button">+ Compare</button></div>`;
  }
  grid.innerHTML = table + add;

  grid.querySelectorAll('.cmp-time').forEach(btn => btn.addEventListener('click', () => {
    const idx = +btn.dataset.house, pick = houseTimes[idx][btn.dataset.brand], home = homes[idx].point;
    setSlot('start', { name: home.name, lat: home.lat, lng: home.lng }, false);
    setSlot('end', { name: pick.name, lat: pick.lat, lng: pick.lng }, false);
    computeRoute(true);
    if (window.matchMedia('(max-width: 640px)').matches)
      document.getElementById('route-panel').classList.add('drawer-open');
  }));
  grid.querySelectorAll('.cmp-head[data-house]').forEach(th => th.addEventListener('click', () => {
    const idx = +th.dataset.house;
    if (compareState.sort && compareState.sort.house === idx) compareState.sort.dir *= -1; // toggle asc/desc
    else compareState.sort = { house: idx, dir: 1 };                                       // sort by this house, nearest first
    renderCompare();
  }));
  const addBtn = grid.querySelector('.cmp-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => { compareState.selecting = true; renderCompare(); });
  grid.querySelectorAll('.cmp-pick').forEach(btn => btn.addEventListener('click', () => {
    compareState.houses.push(+btn.dataset.idx); compareState.selecting = false; renderCompare();
  }));
}

function setSlot(which, point, autoCompute = true) {
  routeState[which] = point;
  const el = document.getElementById(which === 'start' ? 'slot-start' : 'slot-end');
  el.textContent = point ? point.name : (which === 'start' ? 'Click a pin → Start here' : 'Click a pin → End here');
  el.classList.toggle('empty', !point);
  if (map) updateHash();
  if (autoCompute && routeState.start && routeState.end) computeRoute();
}

function clearRoute() {
  if (routeState.line) { map.removeLayer(routeState.line); routeState.line = null; }
  document.getElementById('route-result').hidden = true;
}

async function computeRoute(fit = true) {
  clearRoute();
  const a = routeState.start, b = routeState.end;
  const timeEl = document.getElementById('route-time');
  const distEl = document.getElementById('route-dist');
  document.getElementById('route-result').hidden = false;
  timeEl.textContent = 'Routing…'; distEl.textContent = '';

  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes.length) throw new Error('No route found');
    const route = json.routes[0];
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // lng,lat -> lat,lng
    routeState.line = L.polyline(coords, { color: '#378ADD', weight: 5, opacity: 0.85 }).addTo(map);
    if (fit) map.fitBounds(routeState.line.getBounds(), { padding: [60, 60] });

    const mins = Math.round(route.duration / 60);
    const miles = (route.distance / 1609.34).toFixed(1);
    timeEl.textContent = `${mins} min drive`;
    distEl.textContent = `${miles} mi · ${escapeHtml(a.name)} → ${escapeHtml(b.name)}`;
  } catch (ex) {
    timeEl.textContent = 'Routing failed';
    distEl.textContent = ex.message || String(ex);
  }
}

// When several pins overlap they collapse into one box showing each brand's
// chip, spaced evenly. Zooming in splits the boxes until pins stand alone.
function clusterIcon(cluster) {
  const kids = cluster.getAllChildMarkers();
  const MAX = 6;
  let html = '<div class="cluster-box">';
  kids.slice(0, MAX).forEach(m => {
    html += `<span class="cluster-chip" style="background:${m.brandColor}">${escapeHtml(m.brandGlyph)}</span>`;
  });
  if (kids.length > MAX) html += `<span class="cluster-more">+${kids.length - MAX}</span>`;
  html += '</div>';
  return L.divIcon({ html, className: 'cluster-wrap', iconSize: null });
}

// Deep-linking: keep zoom + center in the URL hash (#zoom/lat/lng, OSM-style),
// plus an optional route (&r=slat,slng,elat,elng,startName,endName), so a reload
// or shared link reopens the same view AND the plotted route.
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  const parts = raw.split('&');
  const v = parts[0].match(/^(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (!v) return null;
  const out = { zoom: +v[1], lat: +v[2], lng: +v[3] };
  const hPart = parts.find(p => p.startsWith('h='));
  out.hidden = hPart ? hPart.slice(2).split(',').filter(Boolean) : [];
  const rPart = parts.find(p => p.startsWith('r='));
  if (rPart) {
    const f = rPart.slice(2).split(',');
    if (f.length >= 4 && f.slice(0, 4).every(n => n !== '' && !isNaN(+n))) {
      out.route = {
        start: { name: f[4] ? decodeURIComponent(f[4]) : 'Start', lat: +f[0], lng: +f[1] },
        end:   { name: f[5] ? decodeURIComponent(f[5]) : 'End',   lat: +f[2], lng: +f[3] }
      };
    }
  }
  return out;
}
function buildHash() {
  const c = map.getCenter();
  let h = `#${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`;
  const hidden = layerIndex.filter(x => !map.hasLayer(x.group)).map(x => x.id);
  if (hidden.length) h += `&h=${hidden.join(',')}`;
  const s = routeState.start, e = routeState.end;
  if (s && e) {
    h += `&r=${s.lat.toFixed(5)},${s.lng.toFixed(5)},${e.lat.toFixed(5)},${e.lng.toFixed(5)}` +
         `,${encodeURIComponent(s.name)},${encodeURIComponent(e.name)}`;
  }
  return h;
}

// Each settled change (pan/zoom, layer toggle, route) becomes ONE history
// entry, so Back steps through them one at a time. Rapid bursts — All/None,
// or a zoom that fires both zoomend and moveend — coalesce via the debounce.
// Suppressed (applyingState) while we apply a state from Back/Forward/paste so
// re-applying doesn't spawn new entries. `commitHash` sets the URL and records
// lastHash so we never push a duplicate.
let historyTimer = null;
let applyingState = false;
let lastHash = '';
function commitHash(h, push) {
  if (push) history.pushState(null, '', h);
  else history.replaceState(null, '', h);
  lastHash = h;
}
function updateHash() {
  if (applyingState) return;
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    const h = buildHash();
    if (h !== lastHash) commitHash(h, true);
  }, 250);
}

// Apply a parsed hash state to the already-running map. Used when the URL
// changes live — a pasted deep link, or Back/Forward — so it takes effect
// without a reload. History writes are suppressed during the apply.
function applyState(state) {
  if (!state || !map) return;
  applyingState = true;
  map.setView([state.lat, state.lng], state.zoom, { animate: false });

  // Layer visibility: drive the real checkboxes so the control stays in sync.
  const hidden = new Set(state.hidden || []);
  layerIndex.forEach(x => {
    if (!x.cb) return;
    const wantVisible = !hidden.has(x.id);
    if (x.cb.checked !== wantVisible) x.cb.click();
  });

  // Route: only touch it if it actually changed.
  const key = r => r ? `${r.start.lat},${r.start.lng},${r.end.lat},${r.end.lng}` : '';
  const cur = (routeState.start && routeState.end)
    ? key({ start: routeState.start, end: routeState.end }) : '';
  if (key(state.route) !== cur) {
    if (state.route) {
      setSlot('start', state.route.start, false);
      setSlot('end', state.route.end, false);
      computeRoute(false);
    } else {
      setSlot('start', null);
      setSlot('end', null);
      clearRoute();
    }
  }

  applyingState = false;
  lastHash = buildHash(); // this state is now current; don't re-push it
}

// Adds a slide-in handle tab to a panel (used on phones — see the mobile CSS).
// side 'left' = layers drawer, 'right' = directions drawer. The tab is a child
// so it slides with the panel and toggles the .drawer-open class.
function addDrawerTab(el, side) {
  if (!el || el.querySelector(':scope > .drawer-tab')) return;
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'drawer-tab drawer-tab-' + side;
  tab.setAttribute('aria-label', side === 'left' ? 'Show or hide layers' : 'Show or hide directions');
  el.appendChild(tab);
  L.DomEvent.disableClickPropagation(tab);
  L.DomEvent.on(tab, 'click', () => el.classList.toggle('drawer-open'));
}

// Adds an "All / None" row atop the layers control. Clicking drives the real
// checkboxes (via .click()) so Leaflet toggles each layer and stays in sync.
function addAllNoneToggle(ctrl) {
  const container = ctrl.getContainer();
  const list = container.querySelector('.leaflet-control-layers-overlays');
  const bar = L.DomUtil.create('div', 'layers-allnone');
  bar.innerHTML = '<button type="button" data-act="all">All</button>' +
                  '<span>/</span>' +
                  '<button type="button" data-act="none">None</button>';
  list.parentNode.insertBefore(bar, list); // sit just above the overlay list
  L.DomEvent.disableClickPropagation(bar);
  bar.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const want = act === 'all';
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (cb.checked !== want) cb.click();
    });
  });
}

function initMap(data) {
  map = L.map('map', { zoomSnap: 0.5, zoomDelta: 0.5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Restore the view from the URL if present, else use the data's default.
  const h = parseHash();
  if (h) map.setView([h.lat, h.lng], h.zoom);
  else map.setView(data.center || [35.9606, -83.9207], data.zoom || 12);
  map.on('moveend zoomend', updateHash);

  // One parent cluster so different brands combine into the same box.
  const parent = L.markerClusterGroup({
    maxClusterRadius: 80,          // merge pins whose icons visually overlap
    showCoverageOnHover: false,
    spiderfyDistanceMultiplier: 1.4,
    iconCreateFunction: clusterIcon
  }).addTo(map);

  const overlays = {};
  layerIndex = [];
  allPoints = [];
  homes = [];
  brands = [];
  (data.layers || []).forEach(layer => {
    // Stores cluster; homes do NOT. A clustered marker is drawn at its cluster's
    // centroid, which would drag a home's pin away from its real address — so
    // homes live in a plain layerGroup at their exact coordinates, always shown,
    // and sit above the store markers (zIndexOffset) so their label stays legible
    // even when a nearby store cluster is close by.
    const isHomes = layer.id === 'homes';
    const group = isHomes ? L.layerGroup() : L.featureGroup.subGroup(parent);
    layerIndex.push({ id: layer.id, group });
    const layerMeta = { id: layer.id, name: layer.name, color: layer.color, glyph: layer.glyph || '' };
    if (!isHomes) brands.push({ id: layer.id, name: layer.name, color: layer.color, glyph: layer.glyph || '' });
    (layer.points || []).forEach(point => {
      allPoints.push({ name: point.name, lat: point.lat, lng: point.lng, layer: layerMeta });
      const m = L.marker([point.lat, point.lng], { icon: makeIcon(layer, point), zIndexOffset: isHomes ? 1000 : 0 });
      m.brandColor = layer.color;
      m.brandGlyph = layer.glyph || '';
      const homeIdx = isHomes ? homes.length : -1;
      if (isHomes) homes.push({ idx: homeIdx, point, marker: m });
      if (point.label) {
        // Clicking the label opens the popup, same as clicking the pin. We wire the
        // click explicitly (interactive:true alone doesn't reliably forward it).
        m.bindTooltip(point.label, { permanent: true, direction: 'right', offset: [12, 0], className: 'home-label', interactive: true });
        m.on('tooltipopen', (e) => {
          const el = e.tooltip.getElement();
          if (el && !el._clickWired) {
            el._clickWired = true;
            L.DomEvent.on(el, 'click', (ev) => { L.DomEvent.stop(ev); m.openPopup(); });
          }
        });
      }
      m.bindPopup(popupHtml(point, isHomes));
      m.on('popupopen', (e) => {
        if (isHomes) {
          const btn = e.popup.getElement().querySelector('.cmp-btn');
          if (btn) btn.addEventListener('click', () => { map.closePopup(); openCompare(homeIdx); });
        }
        populateNearest(point, layer, e.popup);
      });
      m.addTo(group);
    });
    group.addTo(map);
    overlays[`<span class="legend-chip" style="background:${layer.color}">${escapeHtml(layer.glyph || '')}</span> ${escapeHtml(layer.name)}`] = group;
  });

  // Apply the URL's hidden-layer set before the control is built, so its
  // checkboxes render already-unchecked for hidden layers.
  const hiddenSet = new Set((h && h.hidden) || []);
  layerIndex.forEach(x => { if (hiddenSet.has(x.id)) map.removeLayer(x.group); });

  const layersCtrl = L.control.layers(null, overlays, { collapsed: false, position: 'topleft' }).addTo(map);
  addAllNoneToggle(layersCtrl);
  map.on('overlayadd overlayremove', updateHash); // persist toggles to the URL

  // Remember each layer's checkbox (same order as layerIndex) so we can re-sync
  // the control when a new URL is applied live.
  layersCtrl.getContainer()
    .querySelectorAll('.leaflet-control-layers-overlays input[type=checkbox]')
    .forEach((cb, i) => { if (layerIndex[i]) layerIndex[i].cb = cb; });

  // On phones both panels park off-screen; a handle tab slides each in/out.
  addDrawerTab(layersCtrl.getContainer(), 'left');
  addDrawerTab(document.getElementById('route-panel'), 'right');

  // Escape closes the compare panel if open, else an open pin popup (like its X).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (compareState) closeCompare();
    else map.closePopup();
  });
  const cmpPanel = document.getElementById('compare-panel');
  L.DomEvent.disableClickPropagation(cmpPanel); // don't let panel clicks/scrolls reach the map
  L.DomEvent.disableScrollPropagation(cmpPanel);
  document.getElementById('cmp-close').addEventListener('click', closeCompare);

  document.getElementById('btn-clear').addEventListener('click', () => {
    setSlot('start', null);
    setSlot('end', null);
    clearRoute();
    // On phones, slide the now-empty directions drawer back off-screen.
    if (window.matchMedia('(max-width: 640px)').matches)
      document.getElementById('route-panel').classList.remove('drawer-open');
  });

  // Live-apply the URL when it changes externally: paste fires hashchange;
  // Back/Forward fire popstate (and hashchange). applyState is idempotent, so
  // the double-fire on Back/Forward is harmless.
  window.addEventListener('hashchange', () => applyState(parseHash()));
  window.addEventListener('popstate', () => applyState(parseHash()));

  // Restore a deep-linked route, if the URL had one. Don't refit the view —
  // the deep-linked zoom/center wins.
  if (h && h.route) {
    setSlot('start', h.route.start, false);
    setSlot('end', h.route.end, false);
    computeRoute(false);
  }

  // Normalize the entry-point URL to the full state without adding a history
  // entry, and seed lastHash so the first real change pushes a fresh entry.
  commitHash(buildHash(), false);
}
