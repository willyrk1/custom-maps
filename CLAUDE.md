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
- `build-data.js` — Node tool that regenerates `data.json`: geocodes the homes
  (Census geocoder resolves newer streets that Nominatim can't; homes with
  explicit `lat`/`lng` skip geocoding), pulls brand locations from OpenStreetMap
  via Overpass (with mirror-endpoint fallback), dedupes near-duplicate pins,
  keeps the 2 nearest of each brand to each home, and recomputes `center`/`zoom`.
  Edit its `HOMES` (each has `q`, optional `lat`/`lng`, and `label`) and `BRANDS`
  (key, label, name-match regex, color, glyph) arrays to add homes or brands.
  Skips elements with a `highway`/`waterway`/`railway` tag so a road whose NAME
  contains a brand word (e.g. "Lowes Ferry Road", "Kohlston Road") isn't picked
  up as a fake store. `ADDRESS_OVERRIDES` (keyed by `lat,lng`, matched within
  0.1mi so small OSM drift can't drop it) supplies real street addresses for
  stores OSM has no `addr:*` tags for — look one up once, add a line, and it
  survives every rebuild.
- `data.example.json` — template for the map data (layers → points).
- `data.json` — **plaintext, git-ignored, never committed.** Local only. Points
  carry `name`, `lat`, `lng`, optional `details`, `iconUrl`, and (homes) `label`.
- `data.encrypted` — the only data file that ships. Ciphertext, safe to publish.

Live at https://willyrk1.github.io/custom-maps/ (public repo — safe because only
ciphertext ships; the password holder is the user, Claude never has it).

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
node build-data.js                  # regenerate data.json from HOMES/BRANDS (or edit by hand)
# re-set center/zoom afterward if you want a specific default (build-data recomputes it)
node encrypt-data.js "the-password" # writes data.encrypted
```
Then commit `data.encrypted` (not `data.json`). **Claude does not have the
password** — when the data changes, ask the user to run `encrypt-data.js`
themselves, then commit/push the resulting `data.encrypted`.

## Running locally

The app `fetch`es `data.encrypted`, so it needs a real server (not `file://`):
```bash
npx serve .
```
A `.claude/launch.json` config named `map` also starts one for the preview tool.
Note: `serve` may pick its own port and ignore `-l` — check its log for the URL.

## Gotchas

- **Cache-busting `app.js`**: `index.html` loads it as `app.js?v=N`. **Bump `N`
  whenever you change `app.js`**, otherwise browsers (and the preview pane) keep
  running the previously-cached copy — you'll see new `data.encrypted` but stale
  code, which looks like clustering/labels "not working" until a hard refresh.
  GitHub Pages serves with `max-age=600`, so without the bump a stale copy can
  linger ~10 min after a deploy.
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
  no hash). The user's preferred default is `35.97426,-84.01657` @ z11.5. Note
  `build-data.js` recomputes these from the homes on rebuild, so re-set them
  afterward.
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
