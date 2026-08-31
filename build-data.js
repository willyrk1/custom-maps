// Knoxville region config. Geocodes the homes + pulls real chain locations from
// OpenStreetMap (Overpass) around Knoxville, then emits the FINAL data.json via
// the shared engine in build-lib.js (no hand-edits needed after a run).
//   node build-data.js
const { buildRegion } = require('./build-lib');

const UA = { 'User-Agent': 'knox-house-map/1.0 (wknight94@gmail.com)' };

// Provide lat/lng to skip geocoding (Nominatim can't resolve newer streets).
const HOMES = [
  { q: '7933 Maynardville Pike, Knoxville, TN', lat: 36.11011048775813, lng: -83.91113711451447, label: 'Mill Branch Ridge', url: 'https://millbranchridge.cookbroshomes.com/' },
  { q: '8474 Poplar Farms Ln, Knoxville, TN', lat: 35.986032178540675, lng: -84.15754570461614, label: 'Poplar Farms', url: 'https://www.drhorton.com/tennessee/knoxville/knoxville/poplar-farms' },
  { q: '6948 McGuffey Run Ln, Corryton, TN', lat: 36.12216285628701, lng: -83.849234713683, label: 'Irwin Oaks', url: 'https://www.drhorton.com/tennessee/knoxville/corryton/irwin-oaks' },
  { q: '4515 W Emory Rd, Powell, TN', lat: 36.01315337024987, lng: -84.06558638169386, label: 'Belltown', url: 'https://belltowntn.com/' },
  { q: '7443 Sparkle Ln, Knoxville, TN', lat: 35.977096280648, lng: -84.066221536362, label: 'Sparkle Ln', url: 'https://www.realtor.com/realestateandhomes-detail/7443-Sparkle-Ln_Knoxville_TN_37931_M86148-75784' },
  { q: 'Hickory View, W Gallaher Ferry Rd, Knoxville, TN', lat: 35.9133396627519, lng: -84.22703527474157, label: 'Hickory View', url: 'https://www.ballhomes.com/Locations/Trend_Collection_at_Hickory_View#/' },
  { q: '7441 Peony Dr, Knoxville, TN', lat: 36.11150108466293, lng: -83.8773207718707, label: '7441 Peony', url: 'https://www.realtor.com/realestateandhomes-detail/7441-Peony-Dr_Knoxville_TN_37918_M70801-09368' },
  { q: '10315 Ivy Hollow Dr, Knoxville, TN 37931', lat: 35.964210545538, lng: -84.147343188838, label: '10315 Ivy Hollow', url: 'https://www.realtor.com/realestateandhomes-detail/10315-Ivy-Hollow-Dr_Knoxville_TN_37931_M82709-05021' },
  { q: '670 Whitesburg Dr, Knoxville, TN 37918', lat: 36.032276381095, lng: -83.978672646594, label: '670 Whitesburg', url: 'https://www.realtor.com/realestateandhomes-detail/670-Whitesburg-Dr_Knoxville_TN_37918_M74569-79816' },
  { q: '4330 Edenfield Dr, Knoxville, TN 37938', lat: 36.094992709164, lng: -83.934275887183, label: '4330 Edenfield', url: 'https://www.realtor.com/realestateandhomes-detail/4330-Edenfield-Dr_Knoxville_TN_37938_M76747-58223' },
  { q: '1084 Hillside Ln, Lenoir City, TN 37771', lat: 35.791312444794, lng: -84.286388944228, label: '1084 Hillside', url: 'https://www.realtor.com/realestateandhomes-detail/1084-Hillside-Ln_Lenoir-City_TN_37771_M78193-71327' },
  { q: '6861 Cardindale Dr, Knoxville, TN 37918', lat: 36.0375804644798, lng: -83.97459313021949, label: '6861 Cardindale', url: 'https://www.realtor.com/realestateandhomes-detail/6861-Cardindale-Dr_Knoxville_TN_37918_M83023-32715' }
];

// Emergency rooms are hospitals with a 24/7 ER — not a name-matchable "brand", so
// they're a hand-curated list (verified via OSM emergency=yes + web).
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

// Stores OSM doesn't have but the user wants shown — appended to their brand layer.
const MANUAL_STORES = [
  { brand: 'crackerbarrel', name: 'Cracker Barrel — 2920 S Mall Road', address: '2920 S Mall Road', lat: 36.029170072893, lng: -83.87301371725 }
];
// The startup view (used when the URL has no hash).
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

// Real street addresses for stores OSM has no addr:* tags for (looked up by hand).
// Matched by BRAND + distance (within 0.1mi) so a small OSM coordinate drift can't
// drop it AND a neighbour of a different brand can't pick up the wrong address.
const ADDRESS_OVERRIDES = [
  { brand: 'cvs',            lat: 35.9421, lng: -84.0924, addr: '9137 Middlebrook Pike' },
  { brand: 'cvs',            lat: 36.0849, lng: -83.9253, addr: '4500 E Emory Rd' },          // Halls Crossroads
  { brand: 'cvs',            lat: 36.0283, lng: -83.9275, addr: '4864 N Broadway St' },       // Fountain City
  { brand: 'walgreens',      lat: 36.1204, lng: -83.8542, addr: '7425 Tazewell Pike' },       // Corryton
  { brand: 'walgreens',      lat: 35.9417, lng: -84.0954, addr: '9200 Middlebrook Pike' },
  { brand: 'walgreens',      lat: 36.0730, lng: -83.9269, addr: '6920 Maynardville Pike' },   // Halls
  { brand: 'walgreens',      lat: 36.0168, lng: -84.0475, addr: '7320 Clinton Hwy' },         // Powell
  { brand: 'walgreens',      lat: 35.9730, lng: -83.9865, addr: '4423 Western Ave' },         // Western Ave (37921)
  { brand: 'walgreens',      lat: 35.8938, lng: -84.1742, addr: '601 N Campbell Station Rd' },// Farragut
  { brand: 'kohls',          lat: 35.8771, lng: -84.1655, addr: '11530 Kingston Pike' },       // Farragut
  { brand: 'crackerbarrel',  lat: 36.0012, lng: -83.7786, addr: '1510 Cracker Barrel Lane' }, // Strawberry Plains
  { brand: 'texasroadhouse', lat: 35.9036, lng: -84.1512, addr: '11001 Turkey Dr' },          // Turkey Creek
  { brand: 'texasroadhouse', lat: 35.9277, lng: -84.0352, addr: '120 Morrell Rd' },           // West Knox
  { brand: 'texasroadhouse', lat: 36.0297, lng: -83.8658, addr: '3071 Kinzel Way' }           // East
];
// OSM pins to drop — closed/relocated stores OSM still lists. Matched by brand +
// within 0.1mi, filtered out before selection.
const STORE_EXCLUDE = [
  { brand: 'cvs', lat: 35.9727, lng: -83.9830 }  // 4406 Western Ave — closed & replaced
];

buildRegion({
  UA, state: 'TN', stateFull: 'Tennessee', outfile: 'data.json',
  bbox: '35.80,-84.50,36.20,-83.55', // Knoxville metro (Oak Ridge -> Corryton)
  overpassNames: 'Walmart|Kroger|Cracker Barrel|Olive Garden|CVS|Walgreens|Home ?Goods|Home ?Sense|Home ?Depot|Lowe|Kohl|Texas Roadhouse|Glory Days|Target|Publix',
  HOMES, BRANDS, EMERGENCY_ROOMS, ER_LAYER, MANUAL_STORES, ADDRESS_OVERRIDES, STORE_EXCLUDE, DEFAULT_VIEW
}).catch(e => { console.error('ERROR', e); process.exit(1); });
