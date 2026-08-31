// South/west-metro Atlanta region config (seeded around Villa Rica). Emits
// atlanta/data.json via the shared engine in build-lib.js.
//   node build-atlanta.js
const fs = require('fs');
const { buildRegion } = require('./build-lib');

const UA = { 'User-Agent': 'atl-house-map/1.0 (wknight94@gmail.com)' };

const HOMES = [
  { q: '512 Clinton Dr, Temple, GA 30179', lat: 33.719576890564, lng: -85.002430541926, label: '512 Clinton Dr' }
];

// Hospitals with a 24/7 ER around Villa Rica / west metro (coords via US Census geocoder).
const EMERGENCY_ROOMS = [
  { name: 'Tanner Medical Center — Villa Rica',   address: '601 Dallas Hwy, Villa Rica',          lat: 33.74582145356,  lng: -84.917382158299 },
  { name: 'Tanner Medical Center — Carrollton',   address: '705 Dixie St, Carrollton',            lat: 33.570479639253, lng: -85.072524750163 },
  { name: 'Wellstar Douglas Hospital',            address: '8954 Hospital Dr, Douglasville',      lat: 33.739471533667, lng: -84.732942720523 },
  { name: 'Wellstar Paulding Medical Center',     address: '2518 Jimmy Lee Smith Pkwy, Hiram',    lat: 33.902373236585, lng: -84.78510534499  }
];
const ER_LAYER = { key: 'er', label: 'Emergency Room', color: '#D32F2F', glyph: 'ER' };

const DEFAULT_VIEW = { center: [33.72, -84.92], zoom: 11 };

const BRANDS = [
  // Groceries popular in the west/south metro
  { key: 'publix',        label: 'Publix',          match: /publix/i,              color: '#008542', glyph: 'Px' },
  { key: 'kroger',        label: 'Kroger',          match: /kroger/i,              color: '#004990', glyph: 'Kr' },
  { key: 'walmart',       label: 'Walmart',         match: /walmart/i,             color: '#0071CE', glyph: 'Wm' },
  { key: 'ingles',        label: 'Ingles',          match: /ingles/i,              color: '#C8102E', glyph: 'In' },
  { key: 'aldi',          label: 'Aldi',            match: /\baldi\b/i,            color: '#1E4B9B', glyph: 'Al' },
  { key: 'foodlion',      label: 'Food Lion',       match: /food\s*lion/i,         color: '#E4572E', glyph: 'FL' },
  // Restaurants
  { key: 'chickfila',     label: 'Chick-fil-A',     match: /chick-?fil-?a/i,       color: '#E51636', glyph: 'CfA'},
  { key: 'crackerbarrel', label: 'Cracker Barrel',  match: /cracker\s*barrel/i,    color: '#6B4226', glyph: 'CB' },
  { key: 'olivegarden',   label: 'Olive Garden',    match: /olive\s*garden/i,      color: '#3B6D11', glyph: 'OG' },
  { key: 'texasroadhouse',label: 'Texas Roadhouse', match: /texas\s*roadhouse/i,   color: '#B71234', glyph: 'TR' },
  { key: 'longhorn',      label: 'LongHorn',        match: /longhorn/i,            color: '#7A1F2B', glyph: 'LH' },
  { key: 'zaxbys',        label: "Zaxby's",         match: /zaxby/i,               color: '#1a1a1a', glyph: 'Zx' },
  // Essentials (mirrors the Knoxville map)
  { key: 'target',        label: 'Target',          match: /target/i,              color: '#E4002B', glyph: 'Tg' },
  { key: 'cvs',           label: 'CVS',             match: /\bcvs\b/i,            color: '#CC0000', glyph: 'CVS'},
  { key: 'walgreens',     label: 'Walgreens',       match: /walgreens/i,           color: '#E31837', glyph: 'Wg' },
  { key: 'homedepot',     label: 'Home Depot',      match: /home\s*depot/i,        color: '#F96302', glyph: 'HD' },
  { key: 'lowes',         label: "Lowe's",          match: /lowe'?s/i,            color: '#004990', glyph: 'Lw' }
];

fs.mkdirSync('atlanta', { recursive: true });

buildRegion({
  UA, state: 'GA', stateFull: 'Georgia', outfile: 'atlanta/data.json',
  bbox: '33.45,-85.20,33.98,-84.55', // Villa Rica / Carrollton / Douglasville / Dallas–Hiram
  overpassNames: 'Publix|Kroger|Walmart|Ingles|Aldi|Food ?Lion|Chick-?fil-?A|Cracker Barrel|Olive Garden|Texas Roadhouse|LongHorn|Zaxby|Target|CVS|Walgreens|Home ?Depot|Lowe',
  HOMES, BRANDS, EMERGENCY_ROOMS, ER_LAYER, DEFAULT_VIEW
}).catch(e => { console.error('ERROR', e); process.exit(1); });
