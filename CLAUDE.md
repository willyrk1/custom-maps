# CLAUDE.md

Private, password-protected Leaflet maps for house-hunting. Static site,
deployable to GitHub Pages. Click any two pins → driving distance + time.

**Two regions share one codebase** (`app.js` + `map.css` + the build engine):
- **Knoxville** — repo root, live at https://willyrk1.github.io/custom-maps/
- **Atlanta (west/south metro, seeded at Villa Rica)** — the `atlanta/` subfolder,
  live at https://willyrk1.github.io/custom-maps/atlanta/

Each region is just an `index.html` + a `data.encrypted`; everything else is
shared. To add another region, copy the pattern below (a build config + a folder).

## How it fits together

- `map.css` — all the shared styles, linked by every region's `index.html`
  (root links `map.css`, `atlanta/` links `../map.css`). Edit styling here once.
- `app.js` — shared by every region. Decrypts `data.encrypted` in the browser
  (AES-256-GCM / PBKDF2 via Web Crypto), renders layered markers, click-to-route
  through OSRM, the Compare panel, deep-linking. Region-specific bits come from
  `window.MAP_CONFIG` set inline in each page (currently just `storageKey`, the
  per-device password-memory key — `knox-map-key` vs `atl-map-key` so the two
  maps don't collide in localStorage). `data.encrypted`/`data.json` load by
  **relative** path, so each folder automatically reads its own.
- `index.html` (root = Knoxville) / `atlanta/index.html` — the per-region page
  shell: password gate + map container + routing/compare panels, its own
  `<title>`/gate heading, its `MAP_CONFIG`, and `<script src="app.js?v=N">`
  (root) or `../app.js?v=N` (subfolders). Otherwise identical — keep them in sync.
- `build-lib.js` — the **shared build engine** (`buildRegion(cfg)`): geocodes
  homes (explicit `lat`/`lng` skips it), pulls brand locations from OpenStreetMap
  via Overpass (mirror fallback), dedupes, keeps the 2 nearest of each brand to
  each home, applies overrides/exclusions/manual stores, and writes that region's
  final `data.json`. Region-agnostic — no hand-edits after a run.
- `build-data.js` (Knoxville) / `build-atlanta.js` (Atlanta) — thin **region
  configs** that hand `buildRegion` their `HOMES`, `BRANDS`, `bbox`,
  `overpassNames`, `ADDRESS_OVERRIDES`, `STORE_EXCLUDE`, `MANUAL_STORES`,
  `EMERGENCY_ROOMS`, `DEFAULT_VIEW`, and `outfile` (`data.json` vs
  `atlanta/data.json`). `build-atlanta.js` `mkdir`s `atlanta/` first. Edit
  `HOMES` (each `{q, lat?, lng?, label, url?}`) / `BRANDS` (key, label,
  name-match regex, color, glyph) to add homes or brands. **Writes the FINAL
  `data.json` — no hand-edits needed after a rebuild** (all recurring fixes baked in):
  - Skips elements with a `highway`/`waterway`/`railway` tag so a road whose NAME
    contains a brand word (e.g. "Lowes Ferry Road", "Kohlston Road") isn't picked
    up as a fake store.
  - `ADDRESS_OVERRIDES` (a list of `{brand, lat, lng, addr}`, matched by brand +
    within 0.1mi so small OSM drift can't drop it and a different-brand neighbour
    can't steal it) supplies real street addresses for stores OSM has no `addr:*`
    tags for — look one up once, add a line, it survives every rebuild.
  - `EMERGENCY_ROOMS` — hand-curated hospitals-with-ERs (not name-matchable),
    emitted as their own `Emergency Room` layer (glyph `ER`, all shown).
  - `MANUAL_STORES` — stores OSM lacks (e.g. the S Mall Cracker Barrel), appended
    to their brand layer every build.
  - `STORE_EXCLUDE` — closed/relocated pins OSM still lists (matched by brand +
    0.1mi), dropped before selection.
  - `DEFAULT_VIEW` — the startup `center`/`zoom` (was hand-reset after each run).
- `data.example.json` — template for the map data (layers → points).
- `data.json` — **plaintext, git-ignored, never committed.** Local only. Points
  carry `name`, `lat`, `lng`, optional `details`, `iconUrl`, and (homes) `label`
  and optional `url` (dev/listing website, rendered in the popup as a new-tab link).
- `data.encrypted` — the only data file that ships. Ciphertext, safe to publish.

Live at https://willyrk1.github.io/custom-maps/ (public repo — safe because only
ciphertext ships; the password holder is the user, Claude never has it).

## Privacy model (important)

GitHub Pages serves fully public files, so security comes from **encryption, not
a JS password check**. The password decrypts the data in the browser; the repo
holds only ciphertext. A plain `if (password === ...)` gate would be trivially
bypassable and must never replace this.

- The password is never stored in the repo. Each region can use the same password
  or its own — they're independent ciphertext files.
- `localStorage` key (`knox-map-key` / `atl-map-key`, set via `MAP_CONFIG.storageKey`)
  remembers the password per-device per-region ("Remember on this device"); a
  stale/wrong saved key is cleared and re-prompts.

## Editing the data

```bash
# Knoxville (root):
node build-data.js                                                   # -> data.json
node encrypt-data.js "the-password"                                  # -> data.encrypted
# Atlanta (subfolder) — encrypt-data.js takes explicit in/out paths:
node build-atlanta.js                                                # -> atlanta/data.json
node encrypt-data.js "the-password" atlanta/data.json atlanta/data.encrypted
```
Then commit the `data.encrypted` (never the `data.json` — both are git-ignored at
every depth). **Claude does not have the password** — when the data changes, ask
the user to run `encrypt-data.js` themselves, then commit/push the resulting
`data.encrypted`.

## Running locally

The app `fetch`es `data.encrypted`, so it needs a real server (not `file://`):
```bash
npx serve .
```
A `.claude/launch.json` config named `map` also starts one for the preview tool.
Note: `serve` may pick its own port and ignore `-l` — check its log for the URL.

## Gotchas

- **Cache-busting `app.js`**: each `index.html` loads it as `app.js?v=N` (root)
  or `../app.js?v=N` (subfolders). **Bump `N` in *every* region's `index.html`
  whenever you change `app.js`** (they share one file), otherwise browsers (and
  the preview pane) keep running the previously-cached copy — you'll see new
  `data.encrypted` but stale code, which looks like clustering/labels "not
  working" until a hard refresh. GitHub Pages serves with `max-age=600`, so
  without the bump a stale copy can linger ~10 min after a deploy. (`map.css`
  is not cache-busted; if a CSS change must land immediately, add `?v=` to its
  `<link>` too.)
- **SRI hashes**: if you bump the Leaflet version (or the `markercluster` /
  `featuregroup.subgroup` plugin versions), recompute the `integrity="sha256-..."`
  values in *every* region's `index.html` or the browser blocks the script.
  Compute with `openssl dgst -sha256 -binary FILE | openssl base64 -A`.
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
- **Nearest-places popup**: clicking a pin lists the nearest place of every
  other type with driving times (`populateNearest` in `app.js`), plus a 2nd of a
  type when it's close and in a clearly different direction. Times come from one
  OSRM **table** request (`/table/v1/driving/...?sources=0`) with a 5s abort +
  straight-line fallback; tapping a row plots the route (clicked pin = start).
  GOTCHA: do NOT call `popup.update()` after injecting rows — Leaflet re-renders
  the popup from its stored string content and wipes them. We write into the
  `.near-list` node and skip `update()`.
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
  glyphs. `maxClusterRadius` is 80 so close-but-not-touching store pins merge
  instead of a lone pin sitting on top of a cluster box.
- **Home labels**: a home point's optional `label` renders as a permanent
  Leaflet tooltip (`.home-label`) beside the pin — the nicknames (Mill Ridge,
  Poplar Farms, Irwin Oaks). The tooltip is bound `interactive: true`, so
  clicking the label opens the same popup as clicking the pin. Only homes have
  labels; popups/directions still show the full address. Set labels in
  `build-data.js`'s `HOMES`. Homes aren't clustered (see below), so the label is
  always beside the pin at the home's real location.
- **Default startup view**: `data.json`'s `center`/`zoom` (used when the URL has
  no hash). The user's preferred default is `35.97426,-84.01657` @ z11.5, baked
  into `build-data.js`'s `DEFAULT_VIEW` (edit it there, not by hand in data.json).
- **Fractional zoom**: the map is created with `zoomSnap: 0.5, zoomDelta: 0.5`
  (in `initMap`), so zoom moves in half-steps (11, 11.5, 12 …) — z11 was too far
  out and z12 too close on the user's laptop. `parseHash`/`buildHash` already
  handle decimal zooms, so deep links round-trip fine.
- **All / None**: `addAllNoneToggle` adds a row to the layers control that
  drives the real checkboxes via `.click()`, so Leaflet stays in sync.
- **Clustering**: overlapping pins collapse into a box of brand chips
  (`clusterIcon` in `app.js`) and split apart on zoom. All brands share one
  `markerClusterGroup`; each brand is a `featureGroup.subGroup` of it so layer
  toggles still work. Tune `maxClusterRadius` to change how eagerly pins merge.
- **Homes are NOT clustered (they must stay on their real address)**: a clustered
  marker is drawn at its cluster's *centroid*, which drags a home's pin away from
  its true coordinates (e.g. Poplar Farms drifting out of Solway). So homes live
  in a plain `L.layerGroup()` (not a `subGroup` of the cluster), always shown at
  their exact `lat`/`lng`, with `zIndexOffset: 1000` so the pin + label sit above
  any nearby store cluster box and stay legible. Consequence: when a home is close
  to stores (Mill Ridge ~0.8mi, Irwin Oaks ~0.3mi from a Walgreens), at z11.5 its
  pin visually overlaps the store box — that's accepted, because the alternative
  (clustering the home) misplaces it, which is worse on a house-hunting map. Do
  NOT re-add homes to the cluster to "fix" that overlap. (Also tried and rejected:
  patching markercluster to floor the zoom instead of round — it corrupts the
  merge/split animation and makes overlaps worse.)
- **OSRM** public server is free but rate-limited/best-effort. To harden, switch
  `computeRoute()` in `app.js` to the Mapbox Directions API with a token.
- Times are typical estimates — OSRM here is not traffic-aware.
