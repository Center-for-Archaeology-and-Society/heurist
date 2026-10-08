# Heurist client-module host layer

This directory contains parent-side adapters between core Heurist and the
independent Vite client modules. Code here may use HAPI4, HRecordSet, jQuery,
legacy document events and `window.hWin`. It must not be imported by the
independent applications.

The `mapViewer.js` and `dataViewer.js` adapters load the shared base classes and
their concrete module class automatically. Legacy callers therefore load only
the relevant viewer adapter. The resulting dependency order is:

1. `core/HeuristModuleViewer.js`
2. `core/HeuristModuleRecordset.js`
3. the concrete module class, for example `map/HeuristModuleMap.js`
4. its optional legacy jQuery adapter, for example `map/mapViewer.js`

Current structure:

- `core` — generic iframe lifecycle and record-result/selection integration;
- `map` — working host integration for `heurist-map`;
- `data` — working host adapter, jQuery wrapper and bundle-loading page for `heurist-data`;
- `graph` — working host adapter for the independent `heurist-graph` module;
- `timeline`, `chart` — reserved for future module adapters.

Shared code used *inside* Vite applications belongs in the separate future
`@heurist/client-core` package, not in this directory.

## Mobile app

The standalone mobile interface lives in `mobile/`. The main Heurist entry
page redirects mobile browsers to `hclient/modules/mobile/dist/#/login`,
preserving the selected database. Use `?mobile=1` to request the mobile
interface explicitly, or `?mobile=0` to use the desktop interface.

Build the browser bundle before deployment:

```sh
cd hclient/modules/mobile
npm ci
npm run build
```

The build includes the web manifest, service worker and icons. The manifest
resolves its start URL from the deployed bundle directory. In the Docker
development stack the repository is mounted live, so PHP changes and rebuilt
client assets are available without recreating the container.

The host HTTPS proxy must allow the mobile scanner to request camera access.
Inside the HTTPS virtual host, override a blanket `camera=()` policy for
the mobile bundle:

```apache
<LocationMatch "^/(?:h7-alpha|heurist)/hclient/modules/mobile/dist(?:/|$)">
    Header always set Permissions-Policy "geolocation=(), microphone=(), camera=(self)"
</LocationMatch>
```

Run `apache2ctl configtest` and reload the host Apache service after changing
this policy. The browser still asks the user for camera permission.

Mobile authentication reuses a valid cached mobile token for the selected database.
When it is missing or expired, the app posts `{action: "session", db, client: "mobile"}`
to `hserv/controller/auth.php` with same-origin cookies. The controller verifies
Heurist's existing database session and current account permissions before issuing
an API token. An explicit `db` route parameter takes precedence over the last-used
database. Without an active session, the normal login form remains available;
password login uses the same JWT controller. Mobile tokens use `$jwt_TTL_Mobile`
(24 hours by default), and token responses are never cached. Logging out clears
the mobile cache and prevents automatic session reuse for the current page lifetime.

The mobile theme follows the main Heurist interface: slate headers (`#364050`),
Explore blue (`#305586`) and pale blue panels (`#D4DBEA`), gray surfaces,
Helvetica/Arial typography, and compact borders. It reuses the desktop Heurist
logos, filter/network images, and jQuery UI icon font locally through Vite;
there is no external font request. See [icon attribution](mobile/assets/ICON-LICENSE.md).
Record cards and details load each database's record-type icon through the same
`fileGet.php` endpoint as desktop, falling back to a document icon on failure.
Mobile tap targets remain at least 44px and browser zoom is enabled. Rebuild with
`npm run build --prefix hclient/modules/mobile` to deploy theme or asset changes.
