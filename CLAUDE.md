# CLAUDE.md

Private, password-protected Leaflet map for house-hunting around Knoxville.
Static site, deployable to GitHub Pages. Click any two pins → driving distance + time.

## How it fits together

- `index.html` — password gate overlay + map container + routing panel. Loads
  Leaflet from unpkg (with SRI hashes) and `app.js`.
- `app.js` — decrypts `data.encrypted` in the browser (AES-256-GCM / PBKDF2 via
  Web Crypto), renders layered markers, and does click-to-route through OSRM's
  public server.
- `encrypt-data.js` — Node tool that encrypts `data.json` → `data.encrypted`.
- `data.example.json` — template for the map data (layers → points).
- `data.json` — **plaintext, git-ignored, never committed.** Local only.
- `data.encrypted` — the only data file that ships. Ciphertext, safe to publish.

## Privacy model (important)

GitHub Pages serves fully public files, so security comes from **encryption, not
a JS password check**. The password decrypts the data in the browser; the repo
holds only ciphertext. A plain `if (password === ...)` gate would be trivially
bypassable and must never replace this.

- The password is never stored in the repo.
- `localStorage` key `knox-map-key` remembers the password per-device
  ("Remember on this device"); a stale/wrong saved key is cleared and re-prompts.

## Editing the data

```bash
cp data.example.json data.json     # first time only
# edit data.json — add homes/restaurants/shops with lat/lng, details, iconUrl
node encrypt-data.js "the-password" # writes data.encrypted
```
Then commit `data.encrypted` (not `data.json`).

## Running locally

The app `fetch`es `data.encrypted`, so it needs a real server (not `file://`):
```bash
npx serve .
```
A `.claude/launch.json` config named `map` also starts one for the preview tool.
Note: `serve` may pick its own port and ignore `-l` — check its log for the URL.

## Gotchas

- **SRI hashes**: if you bump the Leaflet version (or the `markercluster` /
  `featuregroup.subgroup` plugin versions) in `index.html`, recompute the
  `integrity="sha256-..."` values or the browser blocks the script. Compute with
  `openssl dgst -sha256 -binary FILE | openssl base64 -A`.
- **Deep-linking**: the URL hash is `#zoom/lat/lng` plus optional params, order-
  independent: `&h=id1,id2` for hidden layers (absent = all shown) and
  `&r=slat,slng,elat,elng,startName,endName` for a plotted route (names are
  `encodeURIComponent`-encoded). `parseHash`/`updateHash` in `app.js` handle it;
  the map restores view + hidden layers + route on load and rewrites the hash on
  move/zoom, layer toggle (`overlayadd`/`overlayremove`), and route change. On
  restore the hashed view wins (route restore skips `fitBounds`); hidden layers
  are applied before the layers control is built so its checkboxes render right.
  `hashchange` + `popstate` listeners call `applyState`, so a pasted link or
  Back/Forward updates the live map without a reload. History model: each
  settled change (pan/zoom, layer toggle, route) is one `pushState` entry, so
  Back steps back exactly one navigation. A 250ms debounce (`updateHash`)
  coalesces rapid bursts — All/None, or a zoom firing both zoomend+moveend —
  into a single entry. While `applyState` runs it sets `applyingState` to
  suppress new entries, and records `lastHash` so it never re-pushes the state
  it just applied. `commitHash(h, false)` on load normalizes the entry-point URL
  without adding an entry.
- **Mobile drawers**: on `max-width:640px` the layers selector and the
  directions panel park off-screen (`transform: translateX`) with a `.drawer-tab`
  handle poking in; tapping toggles `.drawer-open` (→ `translateX(0)`).
  `addDrawerTab` in `app.js` injects the tabs. Desktop is untouched — the tab
  `display:flex` and all transforms live only inside the media query; outside it
  `.drawer-tab { display:none }` and panels have no transform. Note: CSS
  transitions don't animate in the non-displayed preview pane (no compositing),
  so verify drawer motion by toggling `.drawer-open` with transitions disabled,
  or on a real device.
- **Layers selector**: each overlay label carries a `.legend-chip` showing the
  brand glyph so you can tell which glyph is which. `clusterIcon` uses the same
  glyphs. `maxClusterRadius` is 80 (default) so close-but-not-touching pins merge
  instead of a lone pin sitting on top of a cluster box.
- **Default startup view**: `data.json`'s `center`/`zoom` (used when the URL has
  no hash). Note `build-data.js` recomputes these from the homes on rebuild, so
  re-set them afterward if you want a specific default.
- **All / None**: `addAllNoneToggle` adds a row to the layers control that
  drives the real checkboxes via `.click()`, so Leaflet stays in sync.
- **Clustering**: overlapping pins collapse into a box of brand chips
  (`clusterIcon` in `app.js`) and split apart on zoom. All brands share one
  `markerClusterGroup`; each brand is a `featureGroup.subGroup` of it so layer
  toggles still work. Homes are a plain `layerGroup` (never clustered). Tune
  `maxClusterRadius` to change how eagerly pins merge.
- **OSRM** public server is free but rate-limited/best-effort. To harden, switch
  `computeRoute()` in `app.js` to the Mapbox Directions API with a token.
- Times are typical estimates — OSRM here is not traffic-aware.
