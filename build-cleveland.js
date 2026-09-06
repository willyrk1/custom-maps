// Cleveland, TN region config. Emits cleveland/data.json via the shared engine
// in build-lib.js.
//   node build-cleveland.js
const fs = require('fs');
const { buildRegion } = require('./build-lib');

const UA = { 'User-Agent': 'cle-house-map/1.0 (wknight94@gmail.com)' };

const HOMES = [
  { q: '209 Talons Ridge Rd NW, Cleveland, TN 37312', lat: 35.280230075322, lng: -84.824493505227, label: '209 Talons Ridge' },
  { q: '220 Hollow Rd NE, Cleveland, TN 37323', lat: 35.145194305262, lng: -84.795724630198, label: '220 Hollow Rd' },
  { q: '162 Lower Woods Trl NE, Cleveland, TN 37323', lat: 35.168127112132, lng: -84.812899508091, label: '162 Lower Woods' }
];

// Hospitals with a 24/7 ER in/around Cleveland (coords via US Census geocoder).
const EMERGENCY_ROOMS = [
  { name: 'Tennova Healthcare — Cleveland',        address: '2305 Chambliss Ave NW, Cleveland',  lat: 35.176091698982, lng: -84.868977957757 },
  { name: 'Starr Regional Medical Center — Athens', address: '1114 W Madison Ave, Athens',        lat: 35.440601810783, lng: -84.608251702217 },
  { name: 'Erlanger East Hospital',                 address: '1751 Gunbarrel Rd, Chattanooga',    lat: 35.022572764668, lng: -85.159769107247 }
];
const ER_LAYER = { key: 'er', label: 'Emergency Room', color: '#D32F2F', glyph: 'ER' };

// Stores OSM lacks (confirmed via web + geocoded), appended every build.
const MANUAL_STORES = [
  // OSM's only nearby Cracker Barrels are in Athens & Ooltewah; the Cleveland one
  // isn't mapped. Address confirmed via Yelp/Yellow Pages.
  { brand: 'crackerbarrel', name: 'Cracker Barrel — 1650 Clingan Ridge Dr NW', address: '1650 Clingan Ridge Dr NW, Cleveland, TN 37312', lat: 35.191922251446, lng: -84.883526305753 }
];

const DEFAULT_VIEW = { center: [35.19, -84.84], zoom: 11.5 };

const BRANDS = [
  // Groceries (Food City is the dominant East-TN chain)
  { key: 'foodcity',      label: 'Food City',       match: /food\s*city/i,         color: '#E4002B', glyph: 'FC' },
  { key: 'walmart',       label: 'Walmart',         match: /walmart/i,             color: '#0071CE', glyph: 'Wm' },
  { key: 'publix',        label: 'Publix',          match: /publix/i,              color: '#008542', glyph: 'Px' },
  { key: 'aldi',          label: 'Aldi',            match: /\baldi\b/i,            color: '#1E4B9B', glyph: 'Al' },
  // Restaurants
  { key: 'crackerbarrel', label: 'Cracker Barrel',  match: /cracker\s*barrel/i,    color: '#6B4226', glyph: 'CB' },
  { key: 'olivegarden',   label: 'Olive Garden',    match: /olive\s*garden/i,      color: '#3B6D11', glyph: 'OG' },
  { key: 'texasroadhouse',label: 'Texas Roadhouse', match: /texas\s*roadhouse/i,   color: '#B71234', glyph: 'TR' },
  { key: 'chickfila',     label: 'Chick-fil-A',     match: /chick-?fil-?a/i,       color: '#E51636', glyph: 'CfA'},
  { key: 'zaxbys',        label: "Zaxby's",         match: /zaxby/i,               color: '#1a1a1a', glyph: 'Zx' },
  // Essentials
  { key: 'target',        label: 'Target',          match: /target/i,              color: '#CC0000', glyph: 'Tg' },
  { key: 'cvs',           label: 'CVS',             match: /\bcvs\b/i,            color: '#CC0000', glyph: 'CVS'},
  { key: 'walgreens',     label: 'Walgreens',       match: /walgreens/i,           color: '#E31837', glyph: 'Wg' },
  { key: 'homedepot',     label: 'Home Depot',      match: /home\s*depot/i,        color: '#F96302', glyph: 'HD' },
  { key: 'lowes',         label: "Lowe's",          match: /lowe'?s/i,            color: '#004990', glyph: 'Lw' }
];

fs.mkdirSync('cleveland', { recursive: true });

buildRegion({
  UA, state: 'TN', stateFull: 'Tennessee', outfile: 'cleveland/data.json',
  bbox: '35.05,-85.00,35.42,-84.65', // Cleveland TN + margin (Athens N / toward Chattanooga SW)
  overpassNames: 'Food City|Walmart|Publix|Aldi|Target|Cracker Barrel|Olive Garden|Texas Roadhouse|Chick-?fil-?A|Zaxby|CVS|Walgreens|Home ?Depot|Lowe',
  HOMES, BRANDS, EMERGENCY_ROOMS, ER_LAYER, MANUAL_STORES, DEFAULT_VIEW
}).catch(e => { console.error('ERROR', e); process.exit(1); });
