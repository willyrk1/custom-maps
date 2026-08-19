# Compare feature — Phase 2 plan (deferred)

**Status (2026-08-19):** Phase 1 (the Compare UI + interactions, in-memory) is
**shipped and live**. Phase 2 (browser Back button + full URL deep-linking) is
**on hold** at the user's request — this file preserves the design so we can pick
it up later without re-planning.

**Phase-2 addendum not in the original plan below:** Phase 1 also gained a
**sort** — clicking a candidate-home column header sorts the brand rows by that
home's drive times (`compareState.sort = { house, dir }`, arrow ▲/▼ on the active
column). Phase 2 must include `sort` in the hash/back handling too (e.g. a `cso`
param), alongside `c`/`cs`/`cx`.

What already exists in `app.js` after Phase 1: `homes`, `brands`, `compareState`,
`houseTimes`, and helpers `computeCandTimes` / `nearestByBrand` / `openCompare` /
`closeCompare` / `ensureHouseTimes` / `renderCompare`. The panel is
`#compare-panel` in `index.html`. Phase 2's `applyState` calls `renderCompare()`.
Remember the cache-bust: bump `app.js?v=` in `index.html` (see CLAUDE.md).

---

## Plan: House-to-house "Compare" in the candidate-home popup

## Context
Today, clicking a candidate home opens a popup listing the nearest place of each
brand with drive times (`populateNearest` in `app.js`), and tapping a row plots
directions from that home. For house-hunting the user wants to compare candidate
homes **side by side**: a "Compare" button that adds other homes as columns, so
you can see each home's drive time to its *own* nearest Walgreens / Kroger / etc.
on aligned rows, tap any time to route from that home, and step backward through
the whole flow with the browser Back button (with full deep-linking, matching the
existing hash/history model). Confirmed UX choices: each grid cell shows **time
only** (store name on hover/tap); the grid **scrolls sideways** for 3+ homes.

## Approach: two phases
- **Phase 1 (DONE): UI + interactions, in-memory state only.** Everything visible
  and clickable — Compare button, expanding grid, home picker, aligned time cells,
  routing from a cell, close via X/Esc. Compare state lives in a module variable;
  the URL/browser-Back is **not** wired to the compare flow yet.
- **Phase 2 (DEFERRED): deep-linking + Back/Forward step semantics** — hash
  params, `applyState` reconstruction, and "close → Back reopens the comparison,"
  exactly as the transition table below. Phase 1's render functions are what
  Phase 2's `applyState` calls, so rework is minimal (each in-memory transition
  just additionally calls `updateHash`).
- **No framework.** Static no-build site; the hard part is Leaflet + browser
  history, which a UI framework wouldn't simplify. Stays vanilla JS.

## UI vehicle: a dedicated comparison PANEL (not a Leaflet popup)
The Compare feature renders into its own DOM panel (`#compare-panel`), modeled on
the existing `#route-panel` directions box, **not** into the map pin popup. Pin
popups stay for the plain single-pin nearest list. Its show/hide is pure app
state — which makes Phase-2 deep-linking sturdy (no Leaflet popup-lifecycle
coupling).

## Deep-linking & Back semantics — PHASE 2 (the delicate part)
Extend the existing `parseHash`/`buildHash`/`applyState`/`updateHash` model
(each settled step = one debounced `pushState`; `applyingState` guards re-entry).
New hash params appended after the existing `#z/lat/lng[&h=][&r=]`:
- `c=i1.i2.…` — home indices in the comparison (order preserved). Present while
  the panel is open **or** retained-while-closed.
- `cs=1` — the picker (selecting next home) is showing.
- `cx=1` — panel closed but comparison retained (from X/Esc, or after plotting
  directions). Back from a `cx` state returns to the same `c` **without** `cx`.
- `cso=<houseIdx>.<dir>` — active sort column + direction (added in Phase 1; see
  addendum).

Transitions (each pushes one entry via `updateHash`). The initial single-home
popup stays a transient Leaflet popup and is **not** a compare step; the panel
flow begins at Compare:
| Action | Hash | Back goes to |
|---|---|---|
| Click home i | (transient popup, no compare hash) | — |
| Click Compare | `c=i&cs=1` (panel: col i + picker) | panel hidden (map) |
| Pick home j | `c=i.j` (grid 2-up) | `c=i&cs=1` picker |
| Click Compare again | `c=i.j&cs=1` (picker for 3rd) | `c=i.j` grid |
| Pick home k | `c=i.j.k` | `c=i.j&cs=1` |
| Tap a time cell | `c=i.j.k&r=…&cx=1` (route drawn, panel hidden) | `c=i.j.k` grid |
| Close (× / Esc) | `c=i.j.k&cx=1` (panel hidden) | `c=i.j.k` grid |

Panel-based reconstruction (no Leaflet popup lifecycle to fight):
`buildHash`: append `c`/`cs`/`cx`/`cso` from `compareState` + a `panelClosed` flag.
`parseHash`: parse them into `state.compare`.
`applyState`: reconcile the **panel** to the parsed state —
  - `c` & not `cx` → set `compareState={houses,selecting:cs,sort:…}`, show
    `#compare-panel`, render the grid (+ picker if `cs`).
  - `c` & `cx` → keep `compareState` in memory, hide the panel (existing `r=` logic
    still plots/clears the route for the directions step).
  - no `c` → clear `compareState`, hide the panel.
  All under `applyingState`, so re-render pushes no new entries.
- Each user transition (Compare, pick home, tap cell, sort, close) sets state +
  calls `updateHash`. Closing sets `panelClosed` and pushes `cx`; Escape/× route
  through the same close path.
- Reuse the existing `hashchange`/`popstate` → `applyState` wiring; no new
  listeners needed. Home indices keep deep links stable across reloads.

## Verification — Phase 2
1. Browser **Back** walks exactly one step each press: directions → 3-up grid →
   picker → 2-up grid → picker → single list → map. **Forward** replays.
2. Close via X and via Escape → Back reopens the full comparison.
3. Copy the URL mid-comparison (incl. an active sort), paste in a new tab → the
   same comparison + sort reconstructs.
