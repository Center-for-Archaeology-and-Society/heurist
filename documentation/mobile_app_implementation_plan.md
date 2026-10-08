# Heurist Mobile — Implementation Plan

*Drafted October 2026. Status: proposal.*

## 1. Goal

A mobile application for Heurist that lets a signed-in user, on a small screen:

1. **Look up records** — search, browse, and read record details.
2. **Edit records** — create and modify records (including quick field edits).
3. **Create and use filters** — run saved searches, build simple queries, save them.
4. **View items on maps** — map view of geolocated records with the ability to open a record from a marker.
5. **View networks** — graph view of a record's relationships.
6. **Barcode lookup** — scan a barcode (ISBN/EAN/QR/Code128) with the device camera to (a) find the matching record in the database, or (b) fetch catalogue metadata from an external lookup service and prefill a new record.

The interface is deliberately **minimal**: only the functionality above. No schema editing, no user/group administration, no import/export, no CMS editing, no reports. This is a *field companion* app for consulting, light editing, and collection item scanning, not the full desktop workspace.

## 2. Form factor: responsive web module (PWA), not native

**Decision: build it as a mobile-first single-page web app inside the existing codebase**, registered as a new Vite module alongside `hclient/modules/{map,graph,...}`, installable as a PWA (Add-to-Home-Screen, offline shell).

Rationale:

- Heurist is session/cookie + JWT over plain JSON; a web app reuses auth and CORS-free same-origin serving with **zero server changes for MVP**.
- The existing modular pattern (`hclient/modules/*` → iframe/bundle host, e.g. `heurist-map`) is already framework-free, API-driven, and bundled with Vite; a `heurist-mobile` module follows house style.
- A native wrapper (Capacitor) can be added later against the identical API — keep that as an optional phase 4, not a dependency.

**Tech stack:** Vue 3 + Vite (small, no jQuery dependency), Leaflet 1.9.4 (already the house map library), no UI framework — hand-rolled minimal CSS design system (~10 components) to keep the bundle small and the look native. PWA via `vite-plugin-pwa`.

## 3. Server APIs to reuse (no/low server work)

Verified against the codebase:

| Feature | Endpoint | Notes |
|---|---|---|
| Login | `POST /api/{db}/login` or `POST hserv/controller/auth.php` | Prefer **JWT Bearer** (`auth.php` → `{access_token}`); API accepts `Authorization: Bearer` |
| DB structure | `GET /api/{db}/def/snapshot` | Rectypes, fields, terms, constraints — fetch once, cache locally |
| Search | `GET/POST /api/{db}/records` | `query`, `fields`, `detail`, `limit`, `offset`, `sort`; reference client: `hclient/core/hRecordSearchOpenApi.js` |
| Record detail | `GET /api/{db}/records/{id}` | |
| Facets (optional) | `record_search.php?a=getfacets` | Session-based; only if faceted filtering is in scope |
| Save/edit | `record_edit.php` (`a=add|save|delete`) or entity SCRUD | Session or Bearer; **gap: no modern REST write route** — see §6 |
| Saved filters | Read: `GET /api/{db}/sys/filter`; Write: `usr_info.php?a=svs_save|svs_delete` | **Gap: no modern REST write endpoint** — see §6 |
| Map | `GET/POST /api/{db}/map` | Streamed GeoJSON; file datasources via `/api/{db}/map/data/{id}` |
| Network | `POST /api/{db}/graph` | Renderer-neutral `{nodes, edges, truncated}`; honor `maxNodes/maxDepth` caps |
| Barcode → external metadata | `hserv/controller/LookupController.php` | Server-side proxy to third-party services (BnF library w/ ISBN via MARC, GeoName, TLCMap, Nomisma, Wikidata, ISNI, …; service configs in `hserv/controller/LookupConfigs.json`). **Gap: legacy session-based, direct entry point** — see §6.5 |
| Barcode → local record | `GET /api/{db}/records` with field query | Search the DB's configured "code" field (e.g. accession/ID number) for the decoded value; per-DB mapping stored in app settings |

## 4. Application structure

```
hclient/modules/mobile/
  index.html            # SPA entry (also PWA start_url)
  main.js               # Vue app bootstrap
  router.js             # hash router (6 routes + login)
  api/
    client.js           # fetch wrapper: JWT storage, refresh, error envelope
    records.js          # /records endpoints
    filters.js          # /sys/filter read + svs_save write
    map.js              # /map GeoJSON
    graph.js            # /graph
    lookup.js           # external lookup services (barcode → metadata)
  store/
    auth.js
    definitions.js      # cached def/snapshot
    recent.js           # recent records/searches (localStorage)
  views/
    LoginView.vue
    SearchView.vue      # query bar + scan button + saved-filter chips + result list
    RecordView.vue      # detail; edit mode; delete
    RecordEditView.vue  # form generated from def/snapshot field types
    FiltersView.vue     # saved filters; simple query builder; save/delete
    MapView.vue         # Leaflet; query-scoped; marker → RecordView
    NetworkView.vue     # force graph; node tap → RecordView
    ScanView.vue        # camera barcode scanner; result → local match or prefill
  components/           # ~10 small components (RecordCard, FieldInput, etc.)
  sw.js / manifest.json # PWA offline shell
```

## 5. Screens & behaviour (small-screen UX)

Every screen is one column, thumb-reachable actions, 44px touch targets, bottom tab bar with 4 tabs: **Search · Map · Filters · More** (More → logout, about). Record and Network views push as stacked pages. A **Scan** action (camera icon in the Search bar) opens the barcode scanner from anywhere.

1. **Login** — database + username + password → JWT. Remembers last DB (`localStorage`).
2. **Search** — single search bar; below it: chips of the user's saved filters (`/sys/filter`, `filterType`); results as a virtualised card list (title from rectype titlemask, thumbnail, pointer chips). Pull-to-refresh. Infinite scroll (`limit/offset`). Tap → Record.
3. **Record** — sections rendered from `def/snapshot` field groups; pointer fields tappable → linked record; map/media/file fields rendered inline (media via `fileDownload.php`). Actions: **Edit**, **Delete** (confirm), **Show network** (→ Network scoped to this record), **Locate** (→ Map scoped to this record, if geo fields exist).
4. **Edit** — auto-generated form from field type definitions (text, number, date, term dropdown, pointer → inline search-select, file upload). Save via record edit endpoint; optimistic disable + error toast on failure. Field-level validation mirrored from server constraints in the snapshot.
5. **Filters** — list saved searches (own + group, from `/sys/filter`); tap to run → Search. **Create**: pick rectype → add simple criteria (field op value for text/number/date/term) → live "preview count" → save (`svs_save`) with a name. No tree editing in MVP.
6. **Map** — Leaflet with a single query-scoped GeoJSON layer (`/api/{db}/map`), cluster markers (markercluster already used by `viewers/map`), tap marker → record bottom-sheet → full record. Boundary-change refetch (debounced). Basemap: OSM tiles.
7. **Network** — for one record or the current query: `POST /graph` with a default 1-hop link spec; force-directed SVG/Canvas layout, pinch zoom, tap node → record. Show truncation notice when `truncated: true`.
8. **Scan (barcode lookup)** — camera view with scanning reticle; decodes ISBN/EAN/QR/Code128 continuously (no shutter button needed). On decode:
   - **Local match:** query `/api/{db}/records` on the DB's configured code field (per-rectype mapping, admin-configurable in app settings, defaulting to any numeric/title-match heuristics). One hit → open Record; multiple hits → pick list; zero hits → "not in database" with actions *Create record* (prefilled where mappable) or *Lookup external service*.
   - **External lookup:** send the code to the relevant `LookupController` service (e.g. ISBN → BnF MARC record) and show the returned metadata as a prefill card → *Create record* (phase 3 write path) or copy fields.
   - Scanning works in poor light via torch toggle; recent scans kept in `recent.js` for offline re-check.

   **Scanner tech:** native [`BarcodeDetector`](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) API where available (Chrome/Android), falling back to `@zxing/library` (~50 KB) for iOS/Safari — lazy-loaded so the scanner bundle isn't paid for on cold start. Requires HTTPS (PWA camera permission).

**Cross-cutting:** offline shell only (cached app, cached last search results read-only); every mutation requires online. Full offline editing is explicitly out of scope for MVP.

## 6. Server-side gaps to close (small, listed work items)

1. **Modern record write route** — either expose `record_edit.php` actions under `/api/{db}/records` (POST add / PUT save / DELETE) in `api.php`, or document session-cookie usage for the mobile module. *Prefer the former* so the app is token-only.
2. **Saved-filter write endpoint** — add `POST/PUT/DELETE /api/{db}/sys/filter` wrapping `dbsSavedSearches.php` (`svsSave`, `svsDelete`); the read side already exists in `SystemQueryService`.
3. **JWT TTL** — default 600s is too short for a field app; add a refresh/renew endpoint or allow a longer mobile-client TTL via config.
4. **Media URLs in record detail** — ensure `/api/{db}/records/{id}` resolves file/media field values to absolute servable URLs (verify; if not, add a `resolveMedia` detail flag).
5. **Lookup under the modern API** — `LookupController.php` is a legacy direct-entry, session-based endpoint. Expose it as `GET/POST /api/{db}/lookup/{service}` in `api.php` reusing its existing service configs (`LookupConfigs.json`) and accepting Bearer auth, so the scanner works with the same token flow as everything else. Optionally add an ISBN/EAN normalisation helper (strip hyphens, ISBN-10↔13) server-side.

Items 1–3 and 5 are ~small controller/service additions in `hserv/controller/api.php` + `srv/` following the existing `ApiResponse`/`ServiceFactory` patterns in `srv/Runtime/`.

## 7. Phases

| Phase | Deliverable | Approx. scope |
|---|---|---|
| **0. Foundations** | Server gaps §6.1–6.3, §6.5 (lookup API); `hclient/modules/mobile` scaffold; auth + def/snapshot caching | smallest |
| **1. Read path** | Login, Search, Record detail, saved-filter chips | core value, no writes |
| **2. Map, Network & Scan** | MapView and NetworkView against existing `/map` and `/graph`; barcode scanning with local-record matching and external lookup (read-only) | read-only |
| **3. Write path** | Record create/edit/delete; filter creation/save; record creation prefilled from scan/lookup results | after server write endpoints |
| **4. PWA + polish** | Service worker, manifest, add-to-home-screen, offline shell, theming to match host DB | optional |
| **5. Native wrapper (optional)** | Capacitor shell for app stores, camera/GPS capture of new records (replaces web camera for scanning in stores) | future |

## 8. Risks / open questions

- **Rectype-specific edit forms:** desktop editing uses complex layout logic (`usr_NavigationTree` edit layouts); the mobile form generator will cover the common field types first and fall back to "open in desktop site" links for exotic fields (media annotations, repeatable complex groups).
- **Query language surface:** the `q` JSON query contract is powerful but undocumented for end users; the mobile filter builder only exposes a safe subset (see §5.5).
- **Bundle bloat:** avoid importing jQuery/jQuery-UI (legacy hclient) into the module; Leaflet is the only heavy dependency.
- **Permissions:** respect record-level access and `publiconly` constraints server-side; the app must not assume the API enforces nothing extra — MVP reuses existing enforcement unchanged.
- **Barcode field mapping:** Heurist has no universal "barcode" concept — each database stores codes in different fields. The app needs a per-database mapping (rectype → code field) configurable in settings, with a sensible discovery heuristic on first run (search field names/codes for likely candidates like *accession*, *cat* number, *ISBN*).
- **Scanner on iOS Safari:** `BarcodeDetector` is unsupported; the `@zxing/library` fallback works but is slower — acceptable for MVP, and the optional Capacitor wrapper (phase 5) gives native scanning later.
- **External lookup services:** `LookupController` services vary in availability/reachability (some need network egress from the server); scanner flow must degrade gracefully — local matching should always work even if external lookups fail.
