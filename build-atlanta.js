// South/west-metro Atlanta region config (seeded around Villa Rica). Emits
// atlanta/data.json via the shared engine in build-lib.js.
//   node build-atlanta.js
const fs = require('fs');
const { buildRegion } = require('./build-lib');

const UA = { 'User-Agent': 'atl-house-map/1.0 (wknight94@gmail.com)' };

const HOMES = [
  { q: '512 Clinton Dr, Temple, GA 30179', lat: 33.719576890564, lng: -85.002430541926, label: '512 Clinton Dr' },
  { q: '254 Webster Lake Dr, Temple, GA 30179', lat: 33.746210548897, lng: -85.047962008862, label: '254 Webster Lake' },
  { q: '507 Rippling Ct, Temple, GA 30179', lat: 33.737457568996, lng: -85.015087718326, label: '507 Rippling Ct' },
  { q: '338 Springwater Way, Bremen, GA 30110', lat: 33.710239616452, lng: -85.114553532835, label: '338 Springwater Way' },
  { q: '141 Lindsey Dr, Bremen, GA 30110', lat: 33.741940544742, lng: -85.150202093993, label: '141 Lindsey Dr' },
  { q: '398 Woodrow Kay Rd, Rockmart, GA 30153', lat: 33.902882111136, lng: -85.023031174046, label: '398 Woodrow Kay' },
  { q: '592 Kyles Cir, Hiram, GA 30141', lat: 33.848212264482, lng: -84.791915801513, label: '592 Kyles Cir' },
  { q: '170 Shenandoah Dr, Hiram, GA 30141', lat: 33.837169711971, lng: -84.775087086433, label: '170 Shenandoah Dr' },
  { q: '6096 Willowpond Ct, Douglasville, GA 30135', lat: 33.638994537536, lng: -84.845970777044, label: '6096 Willowpond' },
  { q: '179 Cainbridge Park Dr, Newnan, GA 30263', lat: 33.495935930241, lng: -84.784137684503, label: '179 Cainbridge Park' },
  { q: '70 Wilkes Ct, Newnan, GA 30263', lat: 33.452923018566, lng: -84.829437589681, label: '70 Wilkes Ct' },
  { q: '3 Willow Trce SW, Cartersville, GA 30120', lat: 34.172547254101, lng: -84.858839203642, label: '3 Willow Trce' },
  { q: 'Langston Reserve by Ashton Woods, GA', lat: 34.13745573525989, lng: -84.82971472792491, label: 'Langston Reserve' },
  { q: '24 Woodhaven Ct SW, Cartersville, GA 30120', lat: 34.157251982182, lng: -84.899514719383, label: '24 Woodhaven Ct' },
  { q: '326 Tuggle Ct, Woodstock, GA 30188', lat: 34.114498269841, lng: -84.518723520469, label: '326 Tuggle Ct' },
  { q: '105 Peregrine Way NW, Kennesaw, GA 30144', lat: 34.07314301632, lng: -84.551996181954, label: '105 Peregrine Way' },
  { q: '4341 Laurian Dr NW, Kennesaw, GA 30144', lat: 34.054893778495, lng: -84.563271759739, label: '4341 Laurian Dr' }
];

// Hospitals with a 24/7 ER around Villa Rica / west metro (coords via US Census geocoder).
const EMERGENCY_ROOMS = [
  { name: 'Tanner Medical Center — Villa Rica',   address: '601 Dallas Hwy, Villa Rica',          lat: 33.74582145356,  lng: -84.917382158299 },
  { name: 'Tanner Medical Center — Carrollton',   address: '705 Dixie St, Carrollton',            lat: 33.570479639253, lng: -85.072524750163 },
  { name: 'Wellstar Douglas Hospital',            address: '8954 Hospital Dr, Douglasville',      lat: 33.739471533667, lng: -84.732942720523 },
  { name: 'Wellstar Paulding Medical Center',     address: '2518 Jimmy Lee Smith Pkwy, Hiram',    lat: 33.902373236585, lng: -84.78510534499  },
  { name: 'Piedmont Cartersville Medical Center',  address: '960 Joe Frank Harris Pkwy SE, Cartersville', lat: 34.199741146039, lng: -84.795208315739 }
];
const ER_LAYER = { key: 'er', label: 'Emergency Room', color: '#D32F2F', glyph: 'ER' };

// Extra curated destination layers (non-brand). The airport is here so every
// home shows its drive time/distance to ATL.
const EXTRA_LAYERS = [
  { key: 'airport', label: 'Airport', color: '#5B2C83', glyph: 'ATL', points: [
    { name: 'Hartsfield-Jackson Atlanta Intl (ATL)', address: '6000 N Terminal Pkwy, Atlanta, GA 30320', lat: 33.642321379947, lng: -84.442539931849 }
  ]}
];

const DEFAULT_VIEW = { center: [33.80, -84.80], zoom: 9.5 };

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

// Real street addresses (and an optional friendlier `label`) for stores OSM has
// no addr:* tags for. Matched by brand + within 0.1mi. `label` becomes the pin's
// display suffix ("Olive Garden — Arbor Place Mall, Douglasville"); `addr` fills
// the popup Address row.
const ADDRESS_OVERRIDES = [
  { brand: 'olivegarden', lat: 33.7289173, lng: -84.7499828, addr: '6710 Douglas Blvd, Douglasville, GA 30135', label: 'Arbor Place Mall, Douglasville' }
];

// Stores OSM doesn't have yet — appended to their brand layer every build.
const MANUAL_STORES = [
  // Newly built (2025); OSM still shows a vacant lot. Coords + address confirmed
  // via Google Maps + olivegarden.com (Austell/Heritage Hills #6513). Sits next
  // to the LongHorn that OSM does have.
  { brand: 'olivegarden', name: 'Olive Garden — Heritage Hills, Austell', address: '1350 East West Connector, Austell, GA 30106', lat: 33.8558165, lng: -84.5964714 },
  // OSM lacks it; address geocodes cleanly + web-confirmed open (Yelp/Tripadvisor).
  { brand: 'olivegarden', name: 'Olive Garden — 420 E Church St, Cartersville', address: '420 E Church St, Cartersville, GA 30121', lat: 34.169343707618, lng: -84.787163889838 }
];

fs.mkdirSync('atlanta', { recursive: true });

buildRegion({
  UA, state: 'GA', stateFull: 'Georgia', outfile: 'atlanta/data.json',
  bbox: '33.30,-85.40,34.32,-84.47', // Newnan (S) / Cartersville (N) / Cedartown–Rockmart (W) / Carrollton / Douglasville / Dallas–Hiram–Acworth / Kennesaw–Woodstock (E). East edge kept off dense Sandy Springs/Roswell so the Overpass query doesn't time out.
  overpassNames: 'Publix|Kroger|Walmart|Ingles|Aldi|Food ?Lion|Chick-?fil-?A|Cracker Barrel|Olive Garden|Texas Roadhouse|LongHorn|Zaxby|Target|CVS|Walgreens|Home ?Depot|Lowe',
  HOMES, BRANDS, EMERGENCY_ROOMS, ER_LAYER, ADDRESS_OVERRIDES, MANUAL_STORES, EXTRA_LAYERS, DEFAULT_VIEW
}).catch(e => { console.error('ERROR', e); process.exit(1); });
