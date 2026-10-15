# Project spec

## What it is
A desk display for an old Samsung tablet that shows nearby aircraft as a live, ATC-style radar scope: dark screen, range rings, glowing blips with history trails and data tags. Inspired by TheFlightWall, but a radar picture instead of a flight-info board. Built for Jeff, one screen, always on.

## Type
- [ ] API only  - [ ] Frontend only  - [x] Full-stack (monorepo)  - [ ] Next.js (needs SEO/public pages)

`apps/api` (thin Hono proxy), `apps/web` (Vite + React, one fullscreen page), `packages/shared` (Zod schema for an aircraft and the API response).

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
5. **Adjustable range.** Tapping the range readout cycles the scope range: 10 / 20 / 30 / 60 nm (default 30). Rings rescale to suit (e.g. every 5 nm at 10–20 nm, every 10 nm at 30 nm, every 20 nm at 60 nm). The choice is saved in `localStorage`, so it survives reloads. The API always fetches out to the largest range and the client filters, so changing range is instant and costs no extra upstream calls.
6. **Tablet-friendly.** Works as a home-screen/fullscreen web app on the tablet: no scrolling, no UI chrome, screen kept awake (Wake Lock API where supported), handles landscape and portrait. A small corner readout shows aircraft count, range and "last updated" / stale state.

## Out of scope for v1
- Database, persistence, history beyond the in-memory trail.
- Auth or user accounts (the display is read-only; the API only exposes public ADS-B data).
- A full settings screen. Home location and fetch radius are env vars; the only in-app control is the range toggle.
- Tap-to-select aircraft details, airport/airspace/runway overlays, map tiles, sound.
- Multiple locations or multiple users.

## Data
No database for v1. Shared shape (`packages/shared`), roughly:

- `Aircraft`: `hex` (ICAO 24-bit id), `callsign?`, `lat`, `lon`, `altitudeFt?` (null on ground), `groundSpeedKt?`, `trackDeg?`, `verticalRateFpm?`, `squawk?`, `type?`, `seenAt` (ISO time of the position)
- `AircraftResponse`: `{ center: { lat, lon }, radiusNm, fetchedAt, stale: boolean, aircraft: Aircraft[] }`, wrapped in the usual `{ success, data }` envelope.

Trails live only in the browser, keyed by `hex`.

## Auth
None.

## Config (API env vars, Zod-validated at startup)
- `PORT` (Railway sets it)
- `HOME_LAT`, `HOME_LON` (kept out of the repo)
- `FETCH_RADIUS_NM` (default 60, the largest in-app range)
- `FEED_PROVIDER` (default `adsblol`), `FEED_URL`, `FEED_API_KEY` (only if a provider needs one)
- `CACHE_TTL_MS` (default 5000)

## Decisions
- **Location:** Maple Ridge, BC. Exact lat/lon goes in `HOME_LAT`/`HOME_LON`, not the repo. Pitt Meadows airport (CYPK) is a few km west, so expect lots of low, slow GA traffic close in; YVR is roughly 25 nm west, so its arrivals and departures show at the 30 nm default.
- **Range:** default 30 nm, user-adjustable in the app (see feature 5).
- **Data source:** [adsb.lol](https://api.adsb.lol) to start. It's free, needs no key, has a "within N nm of a point" endpoint, and returns the readsb/tar1090 aircraft format. That's the same format a home RTL-SDR receiver running readsb produces, so the API keeps the feed behind a small provider interface (`fetchAircraft(center, radiusNm)`) and switching to Jeff's own receiver later is a new provider plus an env var change, not a rewrite.
- **Tablet:** Samsung Galaxy Tab A 10.1 (2019, SM-T510/T515). It shipped on Android 9 and can be updated to Android 11, which still gets current Chrome. It's a low-end chip with 2–3 GB RAM, so:
  - Update it to Android 11 and current Chrome before testing. Build target ES2020.
  - Keep drawing cheap: one canvas, redraw at most ~30 fps, no per-frame allocations or canvas `shadowBlur` for the glow (pre-render the glow sprite once instead), and cap trails at ~10 points.
  - Install it to the home screen (PWA manifest with `display: fullscreen`) so there's no browser UI.

## Notes
- **Where the stack defaults don't fit:** the web app is one canvas page with no forms, so React Router, React Hook Form and most shadcn/ui components aren't needed for v1. TanStack Query still handles polling and loading/error/stale states. Tailwind is only for the small overlay readout.
- The Hono RPC client (`hc`) is used for the one API call so the response type comes from the API.
- Hosting: API on Railway; the static web build can be served by the same Hono app (simplest, one service) or separately. Default: same service.
- Projection: plain equirectangular around the home point (scale longitude by cos(lat)) is accurate enough at these ranges.
- Respect the upstream feed's terms and rate limits; the cache is what keeps us inside them.
