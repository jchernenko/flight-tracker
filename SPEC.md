# Project spec

## What it is
A desk display for an old Samsung tablet that shows nearby aircraft as a live, ATC-style radar scope: dark screen, range rings, glowing blips with history trails and data tags. Inspired by TheFlightWall: the radar scope is the main view, with a flight-info board as a second view. Built for Jeff, one screen, always on. The code lives in [jchernenko/flight-tracker](https://github.com/jchernenko/flight-tracker), as a port of Jeff's earlier Python version onto this template's stack.

## Type
- [ ] API only  - [ ] Frontend only  - [x] Full-stack (monorepo)  - [ ] Next.js (needs SEO/public pages)

`apps/api` (thin Hono proxy), `apps/web` (Vite + React, one fullscreen page with two views), `packages/shared` (Zod schema for an aircraft and the API response).

## v1 features
1. **Radar scope.** Fullscreen Canvas 2D, centered on a fixed home location. Range rings with distance labels, compass ticks/bearings, optional slow sweep line. Dark green/amber phosphor look, readable from a couple of metres away.
2. **Blips, trails and data tags.** One blip per aircraft, positioned by lat/lon relative to home. A fading trail of the last ~10 positions. A data tag beside each blip, ATC style:
   ```
   ACA123
   350 ↑ 452
   ```
   (callsign; flight level, climb/descent arrow, ground speed). Tags avoid overlapping where practical.
3. **Live updates.** The web app polls the API every ~5 s and animates blips between updates (dead-reckon from heading and speed so motion looks smooth, not jumpy).
4. **API proxy with cache.** `GET /api/aircraft` returns aircraft inside the configured radius, normalized to the shared schema. The API calls the upstream feed at most once per cache window (~5 s) no matter how many clients are open, and keeps serving the last good response (flagged stale) if upstream fails.
5. **Adjustable range.** Tapping the range readout cycles the scope range: 10 / 20 / 30 / 60 nm (default 30). The map view also goes out to 120 and 250 nm, drawing its aircraft on one canvas so a few hundred stay smooth on the tablet. Rings rescale to suit (e.g. every 5 nm at 10–20 nm, every 10 nm at 30 nm, every 20 nm at 60 nm). The choice is saved in `localStorage`, so it survives reloads. The API always fetches out to the largest range and the client filters, so changing range is instant and costs no extra upstream calls.
6. **Board view.** A second fullscreen view, TheFlightWall style: one row per nearby aircraft, sorted by distance, showing callsign, airline name, aircraft type name, route (origin → destination), altitude, speed and distance. A single tap toggles between scope and board, and the choice is remembered like the range.
7. **Route, airline and type names.** The API enriches each aircraft with `airlineName`, `typeName` and `route` (origin/destination airport codes) when it can. Route lookups go to an external callsign-to-route service, cached per callsign for hours (routes don't change mid-flight) so lookups stay well under that service's limits. Names come from bundled lookup tables. Any field that can't be resolved is simply left out; a failed lookup never blocks or fails `/api/aircraft`. On the scope, the data tag gains a third line with the destination when it's known. Airport positions for the stale-route check come from the route service or a bundled OurAirports table (public domain).
9. **Follow mode (phone).** A "Use my location" button on the Radar and Map views centres the display on the phone's GPS position and turns it heading-up from the compass (true north, using the World Magnetic Model for declination), so what's ahead of you is up the screen. Opt-in per visit (iOS only grants motion access from a tap); off by default, so the desk display is unchanged. If location is blocked it stays on home; with no compass it stays north-up. Below 768 px wide the side panel moves under the scope. The API takes optional `?lat=&lon=`: phones within 2 nm of home share the home picture, others get a picture per 0.05° grid cell (at most 6 cached at once), and the web app keeps using the home picture while it still covers the chosen range around the phone, so following near home costs no extra upstream calls.
8. **Tablet-friendly.** Works as a home-screen/fullscreen web app on the tablet: no scrolling, no UI chrome, screen kept awake (Wake Lock API where supported), handles landscape and portrait. A small corner readout shows aircraft count, range and "last updated" / stale state.

## Out of scope for v1
- Database, persistence, history beyond the in-memory trail.
- Auth or user accounts (the display is read-only; the API only exposes public ADS-B data).
- A full settings screen. Home location and fetch radius are env vars; the only in-app control is the range toggle.
- Tap-to-select aircraft details (the board covers this),  airport/airspace/runway overlays, map tiles, sound.
- Multiple users or saved locations (follow mode only uses the phone's live position).

## Data
No database for v1. Shared shape (`packages/shared`), roughly:

- `Aircraft`: `hex` (ICAO 24-bit id), `callsign?`, `lat`, `lon`, `altitudeFt?` (null on ground), `groundSpeedKt?`, `trackDeg?`, `verticalRateFpm?`, `squawk?`, `type?`, `seenAt` (ISO time of the position), plus enrichment: `airlineName?`, `typeName?`, `route?: { origin, destination }`
- `AircraftResponse`: `{ center: { lat, lon }, radiusNm, fetchedAt, stale: boolean, aircraft: Aircraft[] }`, wrapped in the usual `{ success, data }` envelope.

Trails live only in the browser, keyed by `hex`. Route lookups are cached in API memory, keyed by callsign; losing that cache on restart is fine.

## Auth
None.

## Config (API env vars, Zod-validated at startup)
- `PORT` (Railway sets it)
- `HOME_LAT`, `HOME_LON` (kept out of the repo)
- `FETCH_RADIUS_NM` (default 250, the map's widest range; the radar and board stop at 60)
- `FEED_PROVIDER`: `adsblol` (default), `airplaneslive`, or `readsb` (Jeff's own receiver)
- `FEED_URL` (required for `readsb`, e.g. the receiver's `aircraft.json`), `FEED_API_KEY` (only if a provider needs one)
- `ROUTE_LOOKUP` (default on; off disables route lookups entirely)
- `CACHE_TTL_MS` (default 5000)

## Decisions
- **Location:** Maple Ridge, BC. Exact lat/lon goes in `HOME_LAT`/`HOME_LON`, not the repo. Pitt Meadows airport (CYPK) is a few km west, so expect lots of low, slow GA traffic close in; YVR is roughly 25 nm west, so its arrivals and departures show at the 30 nm default.
- **Range:** default 30 nm, user-adjustable in the app (see feature 5).
- **Data source:** [adsb.lol](https://api.adsb.lol) by default, with [airplanes.live](https://airplanes.live) as a drop-in alternative (Jeff's Python version used it, and it returns the same format). It's free, needs no key, has a "within N nm of a point" endpoint, and returns the readsb/tar1090 aircraft format. That's the same format a home RTL-SDR receiver running readsb produces, so the API keeps the feed behind a small provider interface (`fetchAircraft(center, radiusNm)`) and switching to Jeff's own receiver later is a new provider plus an env var change, not a rewrite.
- **Board view and routes:** added because Jeff's existing app already had them; they're part of v1, not extras.
- **Tablet:** Samsung Galaxy Tab A 10.1 (2019, SM-T510/T515). It shipped on Android 9 and can be updated to Android 11, which still gets current Chrome. It's a low-end chip with 2–3 GB RAM, so:
  - Update it to Android 11 and current Chrome before testing. Build target ES2020.
  - Keep drawing cheap: one canvas, redraw at most ~30 fps, no per-frame allocations or canvas `shadowBlur` for the glow (pre-render the glow sprite once instead), and cap trails at ~10 points.
  - Install it to the home screen (PWA manifest with `display: fullscreen`) so there's no browser UI.

## Notes
- **Where the stack defaults don't fit:** the web app is one page with two views and no forms, so React Router (a tap toggles the view, no URLs needed), React Hook Form and most shadcn/ui components aren't needed for v1. TanStack Query still handles polling and loading/error/stale states. Tailwind is only for the small overlay readout.
- The Hono RPC client (`hc`) is used for the one API call so the response type comes from the API.
- Hosting: API on Railway; the static web build can be served by the same Hono app (simplest, one service) or separately. Default: same service.
- Projection: plain equirectangular around the home point (scale longitude by cos(lat)) is accurate enough at these ranges.
- Respect the upstream feed's terms and rate limits; the cache is what keeps us inside them.
