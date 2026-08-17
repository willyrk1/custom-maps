// Geocode the two homes (Nominatim) + pull real chain locations (Overpass/OSM)
// around Knoxville, then emit a data.json for the map.
const fs = require('fs');
const UA = { 'User-Agent': 'knox-house-map/1.0 (wknight94@gmail.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Provide lat/lng to skip geocoding (Nominatim can't resolve newer streets).
const HOMES = [
  { q: '7933 Maynardville Pike, Knoxville, TN' },
  { q: '8474 Poplar Farms Ln, Knoxville, TN', lat: 35.986032178540675, lng: -84.15754570461614 },
  { q: '6948 McGuffey Run Ln, Corryton, TN', lat: 36.12216285628701, lng: -83.849234713683 }
];

const BRANDS = [
  { key: 'walmart',       label: 'Walmart',         match: /walmart/i,             color: '#0071CE', glyph: 'Wm' },
  { key: 'kroger',        label: 'Kroger',          match: /kroger/i,              color: '#004990', glyph: 'Kr' },
  { key: 'crackerbarrel', label: 'Cracker Barrel',  match: /cracker\s*barrel/i,    color: '#6B4226', glyph: 'CB' },
  { key: 'olivegarden',   label: 'Olive Garden',    match: /olive\s*garden/i,      color: '#3B6D11', glyph: 'OG' },
  { key: 'cvs',           label: 'CVS',             match: /\bcvs\b/i,             color: '#CC0000', glyph: 'CVS'},
  { key: 'walgreens',     label: 'Walgreens',       match: /walgreens/i,           color: '#E31837', glyph: 'Wg' },
  { key: 'homegoods',     label: 'HomeGoods',       match: /home\s*goods/i,        color: '#00A0A6', glyph: 'HG' },
  { key: 'homesense',     label: 'HomeSense',       match: /home\s*sense/i,        color: '#E4572E', glyph: 'HS' },
  { key: 'kohls',         label: "Kohl's",          match: /kohl/i,                color: '#1a1a1a', glyph: 'Ko' },
  { key: 'texasroadhouse',label: 'Texas Roadhouse', match: /texas\s*roadhouse/i,   color: '#B71234', glyph: 'TR' },
  { key: 'glorydays',     label: 'Glory Days',      match: /glory\s*days/i,        color: '#1D3F6E', glyph: 'GD' }
];

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

async function geocodeOnce(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: UA });
  const j = await r.json();
  return j.length ? { lat: +j[0].lat, lng: +j[0].lon, display: j[0].display_name } : null;
}

async function geocode(q) {
  // Try the full address, then progressively looser variants.
  const variants = [
    q + ', USA',
    q.replace(/,\s*TN/, ', Tennessee') + ', USA',
    q + ' 37918, USA',                       // Halls/north-Knoxville ZIP
    q.replace(/\bLn\b/, 'Lane') + ', USA',
    q.replace(/^\d+\s+/, '') + ', USA'        // drop house number -> street centroid
  ];
  for (const v of variants) {
    const hit = await geocodeOnce(v);
    await sleep(1100);
    if (hit) return { ...hit, usedVariant: v };
  }
  return null;
}

async function overpass() {
  const bbox = '35.80,-84.30,36.20,-83.55'; // Knoxville metro (Halls -> Turkey Creek)
  const re = 'Walmart|Kroger|Cracker Barrel|Olive Garden|CVS|Walgreens|Home ?Goods|Home ?Sense|Kohl|Texas Roadhouse|Glory Days';
  const q = `[out:json][timeout:90];
    ( nwr["name"~"${re}",i](${bbox}); );
    out center tags;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q)
  });
  return (await r.json()).elements || [];
}

(async () => {
  const homes = [];
  for (const h of HOMES) {
    if (h.lat != null && h.lng != null) { homes.push({ ...h, usedVariant: 'explicit coords', display: 'provided' }); continue; }
    const g = await geocode(h.q);
    if (!g) { console.error(`  !! could not geocode: ${h.q}`); continue; }
    homes.push({ ...h, ...g });
  }
  if (!homes.length) throw new Error('No homes geocoded');
  console.error('HOMES:');
  homes.forEach(h => console.error(`  ${h.q} -> ${h.lat},${h.lng}\n      via "${h.usedVariant}"\n      [${h.display}]`));

  const els = await overpass();
  console.error(`\nOverpass returned ${els.length} raw elements`);

  // Bucket by brand, dedupe by ~coordinate, keep the 3 nearest to either home.
  const byBrand = {};
  const seen = new Set();
  for (const e of els) {
    const name = (e.tags && (e.tags.name || e.tags.brand)) || '';
    const brand = BRANDS.find(b => b.match.test(name));
    if (!brand) continue;
    const lat = e.lat ?? (e.center && e.center.lat);
    const lng = e.lon ?? (e.center && e.center.lon);
    if (lat == null) continue;
    const dedup = brand.key + ':' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (seen.has(dedup)) continue; seen.add(dedup);
    const dist = Math.min(...homes.map(h => haversineMi(h, { lat, lng })));
    (byBrand[brand.key] ||= []).push({ name, lat, lng, dist, tags: e.tags });
  }

  const layers = [{
    id: 'homes', name: 'Candidate homes', color: '#1D9E75', glyph: 'H',
    points: homes.map(h => ({ name: h.q.replace(', TN',''), lat: h.lat, lng: h.lng,
      details: { Status: 'Candidate' } }))
  }];

  console.error('\nBRAND COUNTS (nearest to EACH home kept):');
  for (const b of BRANDS) {
    const all = dedupeNearby(byBrand[b.key] || []);
    // Keep the 2 closest to each home, union-deduped, so both areas are covered.
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
        const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
        const details = {};
        if (addr) details.Address = addr;
        details['Nearest home'] = p.dist.toFixed(1) + ' mi';
        return { name: b.label + (addr ? ' — ' + addr : ''), lat: p.lat, lng: p.lng, details };
      })
    });
  }

  // Center between the homes; zoom out if they're far apart.
  const cLat = homes.reduce((s, h) => s + h.lat, 0) / homes.length;
  const cLng = homes.reduce((s, h) => s + h.lng, 0) / homes.length;
  let spread = 0;
  for (const a of homes) for (const b of homes) spread = Math.max(spread, haversineMi(a, b));
  const data = { center: [cLat, cLng], zoom: spread > 10 ? 10 : 11, layers };
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.error('\nWrote data.json with ' + (layers.length-1) + ' brand layers + homes');
  console.error('Next: node encrypt-data.js "<password>"  then commit data.encrypted');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
