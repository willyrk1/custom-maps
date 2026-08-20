// Geocode the two homes (Nominatim) + pull real chain locations (Overpass/OSM)
// around Knoxville, then emit a data.json for the map.
const fs = require('fs');
const UA = { 'User-Agent': 'knox-house-map/1.0 (wknight94@gmail.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Provide lat/lng to skip geocoding (Nominatim can't resolve newer streets).
const HOMES = [
  { q: '7933 Maynardville Pike, Knoxville, TN', lat: 36.11011048775813, lng: -83.91113711451447, label: 'Mill Branch Ridge' },
  { q: '8474 Poplar Farms Ln, Knoxville, TN', lat: 35.986032178540675, lng: -84.15754570461614, label: 'Poplar Farms' },
  { q: '6948 McGuffey Run Ln, Corryton, TN', lat: 36.12216285628701, lng: -83.849234713683, label: 'Irwin Oaks' },
  { q: '205 Roseberry St, Oak Ridge, TN', lat: 35.91154810585934, lng: -84.4252186828093, label: 'The Preserve' },
  { q: '4515 W Emory Rd, Powell, TN', lat: 36.01315337024987, lng: -84.06558638169386, label: 'Belltown' }
];

// Emergency rooms are hospitals with a 24/7 ER — not a name-matchable "brand", so
// they're a hand-curated list (verified via OSM emergency=yes + web) rather than
// pulled from Overpass by name. build-data emits them as their own layer.
const EMERGENCY_ROOMS = [
  { name: 'Tennova North Knoxville Medical Center', address: '7565 Dannaher Dr, Powell', lat: 36.056198, lng: -83.998259 },
  { name: 'University of Tennessee Medical Center',  address: '1924 Alcoa Hwy',            lat: 35.9399,   lng: -83.9435 },
  { name: 'Fort Sanders Regional Medical Center',    address: '1901 Clinch Ave',           lat: 35.9575,   lng: -83.9373 },
  { name: "East Tennessee Children's Hospital",      address: '2018 W Clinch Ave',         lat: 35.9558,   lng: -83.9386 },
  { name: 'Parkwest Medical Center',                 address: '9352 Park West Blvd',       lat: 35.9178,   lng: -84.1026 },
  { name: 'Turkey Creek Medical Center (Tennova)',   address: '10820 Parkside Dr',         lat: 35.8988,   lng: -84.1443 },
  { name: 'Methodist Medical Center of Oak Ridge',   address: '990 Oak Ridge Turnpike',    lat: 36.0241,   lng: -84.2462 },
  { name: 'Fort Loudoun Medical Center',             address: '550 Fort Loudoun Medical Center Dr', lat: 35.8251, lng: -84.2699 }
];
const ER_LAYER = { key: 'er', label: 'Emergency Room', color: '#D32F2F', glyph: 'ER' };

// Stores OSM doesn't have but the user wants shown — appended to their brand layer
// on every build (so no more hand-editing data.json after a rebuild).
const MANUAL_STORES = [
  { brand: 'crackerbarrel', name: 'Cracker Barrel — 2920 S Mall Road', address: '2920 S Mall Road', lat: 36.029170072893, lng: -83.87301371725 }
];
// The startup view build-data would otherwise recompute from the homes each run.
const DEFAULT_VIEW = { center: [35.97426, -84.01657], zoom: 11.5 };

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
  { key: 'target',        label: 'Target',          match: /target/i,              color: '#E4002B', glyph: 'Tg' },
  { key: 'publix',        label: 'Publix',          match: /publix/i,              color: '#008542', glyph: 'Px' },
  { key: 'homedepot',     label: 'Home Depot',      match: /home\s*depot/i,        color: '#F96302', glyph: 'HD' },
  { key: 'lowes',         label: "Lowe's",          match: /lowe'?s/i,             color: '#004990', glyph: 'Lw' },
  { key: 'texasroadhouse',label: 'Texas Roadhouse', match: /texas\s*roadhouse/i,   color: '#B71234', glyph: 'TR' },
  { key: 'glorydays',     label: 'Glory Days',      match: /glory\s*days/i,        color: '#1D3F6E', glyph: 'GD' }
];

// Real street addresses for stores OpenStreetMap has no addr:* tags for (looked
// up by hand). Applied during build so they survive regeneration — add a line
// after looking one up. Matched by BRAND + distance (within 0.1mi) so a small OSM
// coordinate drift can't drop it AND a neighbour of a different brand can't pick
// up the wrong address (e.g. the CVS and Kroger both on Middlebrook Pike).
const ADDRESS_OVERRIDES = [
  { brand: 'cvs',            lat: 35.9421, lng: -84.0924, addr: '9137 Middlebrook Pike' },
  { brand: 'cvs',            lat: 36.0849, lng: -83.9253, addr: '4500 E Emory Rd' },          // Halls Crossroads
  { brand: 'cvs',            lat: 36.0283, lng: -83.9275, addr: '4864 N Broadway St' },       // Fountain City
  { brand: 'walgreens',      lat: 36.1204, lng: -83.8542, addr: '7425 Tazewell Pike' },       // Corryton
  { brand: 'walgreens',      lat: 35.9417, lng: -84.0954, addr: '9200 Middlebrook Pike' },
  { brand: 'walgreens',      lat: 36.0730, lng: -83.9269, addr: '6920 Maynardville Pike' },   // Halls
  { brand: 'walgreens',      lat: 36.0168, lng: -84.0475, addr: '7320 Clinton Hwy' },         // Powell
  { brand: 'kohls',          lat: 35.8771, lng: -84.1655, addr: '11530 Kingston Pike' },       // Farragut
  { brand: 'crackerbarrel',  lat: 36.0012, lng: -83.7786, addr: '1510 Cracker Barrel Lane' }, // Strawberry Plains
  { brand: 'texasroadhouse', lat: 35.9036, lng: -84.1512, addr: '11001 Turkey Dr' },          // Turkey Creek
  { brand: 'texasroadhouse', lat: 35.9277, lng: -84.0352, addr: '120 Morrell Rd' },           // West Knox
  { brand: 'texasroadhouse', lat: 36.0297, lng: -83.8658, addr: '3071 Kinzel Way' }           // East
];
function overrideAddr(brandKey, lat, lng) {
  const hit = ADDRESS_OVERRIDES.find(o => o.brand === brandKey && haversineMi(o, { lat, lng }) < 0.1);
  return hit ? hit.addr : null;
}

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
  const bbox = '35.80,-84.50,36.20,-83.55'; // Knoxville metro (Oak Ridge -> Corryton)
  const re = 'Walmart|Kroger|Cracker Barrel|Olive Garden|CVS|Walgreens|Home ?Goods|Home ?Sense|Home ?Depot|Lowe|Kohl|Texas Roadhouse|Glory Days|Target|Publix';
  const q = `[out:json][timeout:90];
    ( nwr["name"~"${re}",i](${bbox}); );
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
        const r = await fetch(ep, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        const text = await r.text();
        if (!r.ok || text.trim().startsWith('<')) { console.error(`  overpass ${ep} try ${attempt}: HTTP ${r.status} (busy), retrying`); await sleep(4000); continue; }
        return (JSON.parse(text).elements) || [];
      } catch (e) { console.error(`  overpass ${ep} try ${attempt}: ${e.message}`); await sleep(3000); }
    }
  }
  throw new Error('All Overpass endpoints unavailable — try again shortly');
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
    // Skip roads/waterways/rail whose NAME merely contains a brand word — e.g.
    // "Lowes Ferry Road", "Kohlston Road", "Kohlmier Drive" — they aren't stores.
    if (e.tags.highway || e.tags.waterway || e.tags.railway) continue;
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
    points: homes.map(h => ({ name: h.q.replace(', TN',''), label: h.label, lat: h.lat, lng: h.lng,
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
        const addr = overrideAddr(b.key, p.lat, p.lng) || [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
        const details = {};
        if (addr) details.Address = addr;
        details['Nearest home'] = p.dist.toFixed(1) + ' mi';
        return { name: b.label + (addr ? ' — ' + addr : ''), lat: p.lat, lng: p.lng, details };
      })
    });
  }

  // Emergency rooms: hand-curated list, all shown (there are only a handful and
  // they matter), each with its nearest-home straight-line distance.
  layers.push({
    id: ER_LAYER.key, name: ER_LAYER.label, color: ER_LAYER.color, glyph: ER_LAYER.glyph,
    points: EMERGENCY_ROOMS.map(e => ({
      name: e.name, lat: e.lat, lng: e.lng,
      details: { Address: e.address, 'Nearest home': Math.min(...homes.map(h => haversineMi(h, e))).toFixed(1) + ' mi' }
    }))
  });
  console.error(`  Emergency Room: ${EMERGENCY_ROOMS.length} shown`);

  // Append manual stores OSM lacks (e.g. the S Mall Cracker Barrel) to their layer.
  for (const m of MANUAL_STORES) {
    const layer = layers.find(l => l.id === m.brand);
    if (!layer) continue;
    const dist = Math.min(...homes.map(h => haversineMi(h, m)));
    layer.points.push({ name: m.name, lat: m.lat, lng: m.lng,
      details: { Address: m.address, 'Nearest home': dist.toFixed(1) + ' mi' } });
  }

  const data = { center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom, layers };
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.error('\nWrote data.json with ' + (layers.length-1) + ' brand layers + homes');
  console.error('Next: node encrypt-data.js "<password>"  then commit data.encrypted');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
