# Flight Tracker

A desk display that shows nearby aircraft as a live ATC-style radar scope, built for an old Samsung tablet. It also has a board view that lists each flight with its airline, route and aircraft type. See [SPEC.md](SPEC.md) for what it does and why.

This is a TypeScript monorepo built from [iocodigital/starter-template](https://github.com/iocodigital/starter-template). It replaces the earlier Python version (`main.py` + `static/index.html`), which is still on the `claude/flight-wall-prototype-xf7h3v` branch.

| Package           | What it is                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | Hono server. `GET /api/aircraft` proxies an ADS-B feed through a shared cache and adds routes from the adsb.lol route database. In production it also serves the built web app. |
| `apps/web`        | Vite + React. One fullscreen canvas scope and a board view, polling the API every 5 s.                                                                                          |
| `packages/shared` | Types, Zod schemas (`@flight/shared/schemas`), ranges and geo helpers.                                                                                                          |

## Run it locally

```sh
npm install
cp apps/api/.env.example apps/api/.env   # then set HOME_LAT / HOME_LON
npm run dev                              # API on :3000, web on :5173
```

To try it without network access, set `FEED_PROVIDER=demo` for fake traffic.

## Checks

```sh
npm run typecheck
npm test
```

## Feeds

Set `FEED_PROVIDER` in the API's env:

- `adsblol` (default): adsb.lol, free and needs no key.
- `airplaneslive`: airplanes.live, which uses the same format.
- `readsb`: your own RTL-SDR receiver. Set `FEED_URL` to its `aircraft.json`, e.g. `http://raspberrypi.local:8080/data/aircraft.json`.
- `demo`: fake aircraft orbiting home.

The API calls the feed at most once per `CACHE_TTL_MS` (default 5 s), however many screens are open. If the feed fails, it keeps serving the last picture marked stale.

## Deploy (Railway)

Use one service from the repo root:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Variables: `HOME_LAT`, `HOME_LON`, plus anything else from `apps/api/.env.example`.

## On the tablet

Open the Railway URL in Chrome, then choose **Add to Home screen**. It launches fullscreen and keeps the screen awake, because Wake Lock needs HTTPS and Railway provides it. Tap **RNG** to cycle 10/20/30/60 nm and **Board** to switch views. Both choices are remembered.
