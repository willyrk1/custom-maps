// Shared build engine for the house-hunt maps. A region supplies its config
// (homes, brands, bbox, overrides, …) and this geocodes the homes, pulls chain
// locations from OpenStreetMap via Overpass, dedupes, keeps the nearest of each
// brand to each home, and writes the FINAL data.json for that region — no
// hand-edits needed after a run. See build-data.js (Knoxville) and
// build-atlanta.js (south-metro Atlanta) for the per-region configs.
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function haversineMi(a, b) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// OSM often maps one store as both a node and a building — collapse points
// closer than THRESH_MI, keeping whichever carries a street address.
const DEDUPE_THRESH_MI = 0.15;
function dedupeNearby(points) {
  const kept = [];
  for (const p of points) {
    const dup = kept.find(k => haversineMi(k, p) < DEDUPE_THRESH_MI);
    if (!dup) { kept.push(p); continue; }
    const pAddr = p.tags && p.tags['addr:housenumber'];
    const dAddr = dup.tags && dup.tags['addr:housenumber'];
    if (pAddr && !dAddr) Object.assign(dup, p); // prefer the addressed entry
  }
  return kept;
}

async function geocodeOnce(q, UA) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: UA });
  const j = await r.json();
  return j.length ? { lat: +j[0].lat, lng: +j[0].lon, display: j[0].display_name } : null;
}

async function geocode(q, cfg) {
  // Try the full address, then progressively looser variants.
  const variants = [
    q + ', USA',
    q.replace(/,\s*[A-Z]{2}\b/, ', ' + (cfg.stateFull || '')) + ', USA',
    q.replace(/\bLn\b/, 'Lane') + ', USA',
    q.replace(/^\d+\s+/, '') + ', USA'        // drop house number -> street centroid
  ];
  for (const v of variants) {
    const hit = await geocodeOnce(v, cfg.UA);
    await sleep(1100);
    if (hit) return { ...hit, usedVariant: v };
  }
  return null;
}

async function overpass(cfg) {
  const q = `[out:json][timeout:180];
    ( nwr["name"~"${cfg.overpassNames}",i](${cfg.bbox}); );
    out center tags;`;
  // The main server is often busy/rate-limited; fall through to mirrors.
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter'
  ];
  for (const ep of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: { ...cfg.UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        const text = await r.text();
        if (!r.ok || text.trim().startsWith('<')) { console.error(`  overpass ${ep} try ${attempt}: HTTP ${r.status} (busy), retrying`); await sleep(4000); continue; }
        const els = (JSON.parse(text).elements) || [];
        // A server-side timeout on a big bbox comes back as HTTP 200 with an
        // empty element list. Our queries always expect matches, so treat 0 as a
        // soft failure and try another endpoint rather than writing a storeless
        // map — see the "returned 0 raw elements" gotcha in CLAUDE.md.
        if (els.length === 0) { console.error(`  overpass ${ep} try ${attempt}: 0 elements (likely a server timeout on a large bbox), retrying`); await sleep(4000); continue; }
        return els;
      } catch (e) { console.error(`  overpass ${ep} try ${attempt}: ${e.message}`); await sleep(3000); }
    }
  }
  throw new Error('Overpass returned no elements from any endpoint — the bbox may be too large/dense (server timeout). Shrink cfg.bbox or retry shortly; NOT writing a storeless data.json.');
}

async function buildRegion(cfg) {
  const { BRANDS, EMERGENCY_ROOMS = [], ER_LAYER, MANUAL_STORES = [],
          ADDRESS_OVERRIDES = [], STORE_EXCLUDE = [], EXTRA_LAYERS = [],
          DEFAULT_VIEW, outfile = 'data.json', state = '' } = cfg;

  const isExcluded = (brandKey, lat, lng) =>
    STORE_EXCLUDE.some(e => e.brand === brandKey && haversineMi(e, { lat, lng }) < 0.1);
  const findOverride = (brandKey, lat, lng) =>
    ADDRESS_OVERRIDES.find(o => o.brand === brandKey && haversineMi(o, { lat, lng }) < 0.1) || null;

  const homes = [];
  for (const h of cfg.HOMES) {
    if (h.lat != null && h.lng != null) { homes.push({ ...h, usedVariant: 'explicit coords', display: 'provided' }); continue; }
    const g = await geocode(h.q, cfg);
    if (!g) { console.error(`  !! could not geocode: ${h.q}`); continue; }
    homes.push({ ...h, ...g });
  }
  if (!homes.length) throw new Error('No homes geocoded');
  console.error('HOMES:');
  homes.forEach(h => console.error(`  ${h.q} -> ${h.lat},${h.lng}\n      via "${h.usedVariant}"\n      [${h.display}]`));

  const els = await overpass(cfg);
  console.error(`\nOverpass returned ${els.length} raw elements`);

  // Bucket by brand, dedupe by ~coordinate, keep the nearest to each home.
  const byBrand = {};
  const seen = new Set();
  for (const e of els) {
    const name = (e.tags && (e.tags.name || e.tags.brand)) || '';
    const brand = BRANDS.find(b => b.match.test(name));
    if (!brand) continue;
    // Skip roads/waterways/rail whose NAME merely contains a brand word — e.g.
    // "Lowes Ferry Road", "Kohlston Road" — they aren't stores.
    if (e.tags.highway || e.tags.waterway || e.tags.railway) continue;
    const lat = e.lat ?? (e.center && e.center.lat);
    const lng = e.lon ?? (e.center && e.center.lon);
    if (lat == null) continue;
    if (isExcluded(brand.key, lat, lng)) continue; // closed/relocated pin OSM still lists
    const dedup = brand.key + ':' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (seen.has(dedup)) continue; seen.add(dedup);
    const dist = Math.min(...homes.map(h => haversineMi(h, { lat, lng })));
    (byBrand[brand.key] ||= []).push({ name, lat, lng, dist, tags: e.tags });
  }

  const layers = [{
    id: 'homes', name: 'Candidate homes', color: '#1D9E75', glyph: 'H',
    points: homes.map(h => ({ name: state ? h.q.replace(', ' + state, '') : h.q, label: h.label,
      lat: h.lat, lng: h.lng, url: h.url, details: { Status: 'Candidate' } }))
  }];

  console.error('\nBRAND COUNTS (nearest to EACH home kept):');
  for (const b of BRANDS) {
    const all = dedupeNearby(byBrand[b.key] || []);
    // Keep the 2 closest to each home, union-deduped, so every area is covered.
    const chosen = new Map();
    for (const home of homes) {
      all.map(p => ({ p, d: haversineMi(home, p) }))
         .sort((x, y) => x.d - y.d)
         .slice(0, 2)
         .forEach(({ p }) => chosen.set(p.lat.toFixed(4) + ',' + p.lng.toFixed(4), p));
    }
    const list = [...chosen.values()].sort((x, y) => x.dist - y.dist);
    console.error(`  ${b.label}: ${all.length} found -> ${list.length} kept`);
    if (!list.length) continue;
    layers.push({
      id: b.key, name: b.label, color: b.color, glyph: b.glyph,
      points: list.map(p => {
        const t = p.tags || {};
        const ov = findOverride(b.key, p.lat, p.lng);
        const addr = (ov && ov.addr) || [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
        // The pin's display suffix — an override's optional `label` (e.g. a mall
        // name) beats the raw street address; otherwise fall back to the address.
        const suffix = (ov && ov.label) || addr;
        const details = {};
        if (addr) details.Address = addr;
        details['Nearest home'] = p.dist.toFixed(1) + ' mi';
        return { name: b.label + (suffix ? ' — ' + suffix : ''), lat: p.lat, lng: p.lng, details };
      })
    });
  }

  // Emergency rooms: hand-curated list, all shown (there are only a handful and
  // they matter), each with its nearest-home straight-line distance.
  if (ER_LAYER && EMERGENCY_ROOMS.length) {
    layers.push({
      id: ER_LAYER.key, name: ER_LAYER.label, color: ER_LAYER.color, glyph: ER_LAYER.glyph,
      points: EMERGENCY_ROOMS.map(e => ({
        name: e.name, lat: e.lat, lng: e.lng,
        details: { Address: e.address, 'Nearest home': Math.min(...homes.map(h => haversineMi(h, e))).toFixed(1) + ' mi' }
      }))
    });
    console.error(`  ${ER_LAYER.label}: ${EMERGENCY_ROOMS.length} shown`);
  }

  // Extra hand-curated destination layers (e.g. an airport) — non-brand points
  // emitted as their own layer, all shown, each with its nearest-home distance.
  for (const L of EXTRA_LAYERS) {
    layers.push({
      id: L.key, name: L.label, color: L.color, glyph: L.glyph,
      points: L.points.map(pt => {
        const details = {};
        if (pt.address) details.Address = pt.address;
        details['Nearest home'] = Math.min(...homes.map(h => haversineMi(h, pt))).toFixed(1) + ' mi';
        return { name: pt.name, lat: pt.lat, lng: pt.lng, details };
      })
    });
    console.error(`  ${L.label}: ${L.points.length} shown`);
  }

  // Append manual stores OSM lacks to their brand layer.
  for (const m of MANUAL_STORES) {
    const layer = layers.find(l => l.id === m.brand);
    if (!layer) continue;
    const dist = Math.min(...homes.map(h => haversineMi(h, m)));
    layer.points.push({ name: m.name, lat: m.lat, lng: m.lng,
      details: { Address: m.address, 'Nearest home': dist.toFixed(1) + ' mi' } });
  }

  const data = { center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom, layers };
  fs.writeFileSync(outfile, JSON.stringify(data, null, 2));
  console.error('\nWrote ' + outfile + ' with ' + (layers.length-1) + ' brand layers + homes');
  console.error('Next: node encrypt-data.js "<password>" ' + outfile + ' ' + outfile.replace(/data\.json$/, 'data.encrypted') + '  then commit it');
}

module.exports = { buildRegion, haversineMi };
