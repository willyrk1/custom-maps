// Wesley Chapel, FL region config (north Tampa). Emits wesleychapel/data.json
// via the shared engine in build-lib.js.
//   node build-wesleychapel.js
const fs = require('fs');
const { buildRegion } = require('./build-lib');

const UA = { 'User-Agent': 'wc-house-map/1.0 (wknight94@gmail.com)' };

const HOMES = [
  { q: '6376 Atlantic Beach Ave, Wesley Chapel, FL 33545', lat: 28.250295011059, lng: -82.358274248976, label: '6376 Atlantic Beach' },
  { q: '5150 Villagebrook Dr, Wesley Chapel, FL 33543', lat: 28.232147582569, lng: -82.365100140754, label: '5150 Villagebrook' },
  { q: 'Woodcreek by D.R. Horton, Wesley Chapel, FL', lat: 28.18818316806442, lng: -82.27897021196196, label: 'Woodcreek by D.R. Horton' },
  { q: 'Stonebridge North by Highland Homes, Wesley Chapel, FL', lat: 28.259108316649748, lng: -82.23109203011126, label: 'Stonebridge North by Highland Homes' },
  { q: 'Bellamy Crossings by Lennar, Wesley Chapel, FL', lat: 28.329380705371086, lng: -82.35797559847985, label: 'Bellamy Crossings by Lennar' },
  { q: 'Hilltop Vistas by Meritage, Wesley Chapel, FL', lat: 28.3395811844316, lng: -82.23717241830711, label: 'Hilltop Vistas by Meritage' }
];

// Hospitals with a 24/7 ER in/around Wesley Chapel (coords via Census/Nominatim).
const EMERGENCY_ROOMS = [
  { name: 'AdventHealth Wesley Chapel',   address: '2600 Bruce B Downs Blvd, Wesley Chapel', lat: 28.193748535458, lng: -82.353378020307 },
  { name: 'BayCare Hospital Wesley Chapel', address: '4501 Bruce B Downs Blvd, Wesley Chapel', lat: 28.2232325, lng: -82.3565145 },
  { name: 'AdventHealth Zephyrhills',     address: '7050 Gall Blvd, Zephyrhills',            lat: 28.2613801, lng: -82.1860421 }
];
const ER_LAYER = { key: 'er', label: 'Emergency Room', color: '#D32F2F', glyph: 'ER' };

const DEFAULT_VIEW = { center: [28.26, -82.30], zoom: 11 };

const BRANDS = [
  // Groceries (Publix is the dominant Florida chain)
  { key: 'publix',        label: 'Publix',          match: /publix/i,              color: '#008542', glyph: 'Px' },
  { key: 'walmart',       label: 'Walmart',         match: /walmart/i,             color: '#0071CE', glyph: 'Wm' },
  { key: 'aldi',          label: 'Aldi',            match: /\baldi\b/i,            color: '#1E4B9B', glyph: 'Al' },
  { key: 'winndixie',     label: 'Winn-Dixie',      match: /winn.?dixie/i,         color: '#E01A22', glyph: 'WD' },
  { key: 'sprouts',       label: 'Sprouts',         match: /sprouts/i,             color: '#4A7729', glyph: 'Sp' },
  // Restaurants
  { key: 'crackerbarrel', label: 'Cracker Barrel',  match: /cracker\s*barrel/i,    color: '#6B4226', glyph: 'CB' },
  { key: 'olivegarden',   label: 'Olive Garden',    match: /olive\s*garden/i,      color: '#3B6D11', glyph: 'OG' },
  { key: 'texasroadhouse',label: 'Texas Roadhouse', match: /texas\s*roadhouse/i,   color: '#B71234', glyph: 'TR' },
  { key: 'chickfila',     label: 'Chick-fil-A',     match: /chick-?fil-?a/i,       color: '#E51636', glyph: 'CfA'},
  { key: 'longhorn',      label: 'LongHorn',        match: /longhorn/i,            color: '#7A1F2B', glyph: 'LH' },
  // Essentials
  { key: 'target',        label: 'Target',          match: /target/i,              color: '#CC0000', glyph: 'Tg' },
  { key: 'cvs',           label: 'CVS',             match: /\bcvs\b/i,            color: '#CC0000', glyph: 'CVS'},
  { key: 'walgreens',     label: 'Walgreens',       match: /walgreens/i,           color: '#E31837', glyph: 'Wg' },
  { key: 'homedepot',     label: 'Home Depot',      match: /home\s*depot/i,        color: '#F96302', glyph: 'HD' },
  { key: 'lowes',         label: "Lowe's",          match: /lowe'?s/i,            color: '#004990', glyph: 'Lw' }
];

fs.mkdirSync('wesleychapel', { recursive: true });

buildRegion({
  UA, state: 'FL', stateFull: 'Florida', outfile: 'wesleychapel/data.json',
  bbox: '28.08,-82.50,28.38,-82.13', // Wesley Chapel + Wiregrass/outlets; S to New Tampa, W to Lutz, N+E to the newer homes & Zephyrhills retail; off dense central Tampa
  overpassNames: 'Publix|Walmart|Aldi|Winn.?Dixie|Sprouts|Target|Cracker Barrel|Olive Garden|Texas Roadhouse|Chick-?fil-?A|LongHorn|CVS|Walgreens|Home ?Depot|Lowe',
  HOMES, BRANDS, EMERGENCY_ROOMS, ER_LAYER, DEFAULT_VIEW
}).catch(e => { console.error('ERROR', e); process.exit(1); });
