// Combined build for the house-hunt map. Runs every region config through the
// shared engine (build-lib.js), then MERGES their layers BY BRAND into a single
// root data.json — one "Walmart" layer spanning all areas, one "Emergency Room"
// layer, one "Airport" layer (ATL + CHA), etc. The homes of every region live in
// the single "Candidate homes" layer.
//
//   node build-combined.js        # -> data.json (root)  [4 Overpass queries]
//   node encrypt-data.js "<pw>" data.json data.encrypted
//
// Each region still has its own build-<region>.js (importable config; run alone
// it writes that region's own data.json for isolated debugging). The per-region
// bboxes/Overpass queries are untouched — combining happens after each build, so
// every store's precomputed "Nearest home" distance stays correct (regions are
// far enough apart that a store's nearest home is always its own region's).
const fs = require('fs');
const { buildRegion } = require('./build-lib');

// Region order = layer order in the merged output (Knoxville's brands lead;
// region-unique brands are appended as first seen). label + key drive the
// in-map "Jump to area" switcher; center/zoom come from each region's build.
const REGIONS = [
  { key: 'knoxville',    label: 'Knoxville, TN',       cfg: require('./build-data') },
  { key: 'atlanta',      label: 'Atlanta (W/S metro)', cfg: require('./build-atlanta') },
  { key: 'cleveland',    label: 'Cleveland, TN',       cfg: require('./build-cleveland') },
  { key: 'wesleychapel', label: 'Wesley Chapel, FL',   cfg: require('./build-wesleychapel') }
];

// Startup view when the URL has no hash: a southeast-US overview showing all
// four areas. Region redirect pages (atlanta/index.html, …) deep-link straight
// to their own area, and the switcher jumps between them.
const OVERVIEW = { center: [32.1, -83.4], zoom: 6 };

(async () => {
  const regions = [];
  const order = [];
  const merged = new Map(); // layer id -> { id, name, color, glyph, points:[] }

  for (const R of REGIONS) {
    console.error(`\n########## ${R.label} ##########`);
    const data = await buildRegion({ ...R.cfg, skipWrite: true });
    regions.push({ key: R.key, label: R.label, center: data.center, zoom: data.zoom });
    for (const layer of data.layers) {
      let m = merged.get(layer.id);
      if (!m) {
        // First region to define this brand sets its name/color/glyph.
        m = { id: layer.id, name: layer.name, color: layer.color, glyph: layer.glyph, points: [] };
        if (layer.markerOnly) m.markerOnly = true; // carry marker-only reference layers through
        merged.set(layer.id, m);
        order.push(layer.id);
      }
      // Tag each point with its area so app.js can scope Compare/nearest to one
      // region (never mixing homes/stores across far-apart areas).
      for (const pt of layer.points) m.points.push({ ...pt, region: R.key });
    }
  }

  const layers = order.map(id => merged.get(id));
  const data = { center: OVERVIEW.center, zoom: OVERVIEW.zoom, regions, layers };
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

  const homeCount = (merged.get('homes') || { points: [] }).points.length;
  console.error(`\n==========================================`);
  console.error(`Wrote combined data.json: ${layers.length} layers ` +
    `(incl. homes), ${homeCount} homes across ${regions.length} areas`);
  console.error('Layers: ' + layers.map(l => `${l.name}(${l.points.length})`).join(', '));
  console.error('Next: node encrypt-data.js "<password>" data.json data.encrypted   then commit it');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
