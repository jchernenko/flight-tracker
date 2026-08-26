import asyncio
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# --- Location: ~50km (27nm) radius around Maple Ridge, BC ---
CENTER_LAT = 49.22
CENTER_LON = -122.60
RADIUS_NM = 27

# --- Data source ---
# "airplanes_live" today. Once the RTL-SDR receiver is running readsb locally,
# flip this to "local_readsb" -- both sources share the same aircraft schema
# (readsb's own JSON format), so normalize_aircraft() below needs no changes.
DATA_SOURCE = "airplanes_live"

AIRPLANES_LIVE_URL = f"https://api.airplanes.live/v2/point/{CENTER_LAT}/{CENTER_LON}/{RADIUS_NM}"
LOCAL_READSB_URL = "http://localhost:8080/data/aircraft.json"

# airplanes.live's own policy caps requests at 1/sec; refreshing a shared
# cache every 10s from a single background task stays far under that no
# matter how many browser tabs are polling /api/flights.
REFRESH_INTERVAL_SECONDS = 10

flight_cache = {"data": [], "last_updated": 0.0}


def normalize_aircraft(ac: dict) -> dict:
    alt_baro = ac.get("alt_baro")
    altitude = 0 if alt_baro in (None, "ground") else int(alt_baro)

    speed = ac.get("gs")
    heading = ac.get("track")

    return {
        "callsign": (ac.get("flight") or "UNKNOWN").strip() or "UNKNOWN",
        "altitude": altitude,
        "speed": int(speed) if speed is not None else 0,
        "heading": int(heading) if heading is not None else 0,
    }


async def fetch_airplanes_live(client: httpx.AsyncClient) -> list[dict] | None:
    try:
        response = await client.get(
            AIRPLANES_LIVE_URL,
            headers={"User-Agent": "flight-wall-prototype/1.0"},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        return [normalize_aircraft(ac) for ac in data.get("ac") or []]
    except Exception as e:
        print(f"Error fetching flight data: {e}")
        return None


async def fetch_local_readsb(client: httpx.AsyncClient) -> list[dict] | None:
    try:
        response = await client.get(LOCAL_READSB_URL, timeout=5.0)
        response.raise_for_status()
        data = response.json()
        return [normalize_aircraft(ac) for ac in data.get("aircraft") or []]
    except Exception as e:
        print(f"Error fetching flight data: {e}")
        return None


FETCHERS = {
    "airplanes_live": fetch_airplanes_live,
    "local_readsb": fetch_local_readsb,
}


async def refresh_loop():
    fetch = FETCHERS[DATA_SOURCE]
    async with httpx.AsyncClient() as client:
        while True:
            new_data = await fetch(client)
            if new_data is not None:
                flight_cache["data"] = new_data
                flight_cache["last_updated"] = time.time()
            await asyncio.sleep(REFRESH_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(refresh_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)


@app.get("/api/flights")
async def get_flights():
    return {"flights": flight_cache["data"], "timestamp": flight_cache["last_updated"]}


# Serve the frontend from the 'static' folder
app.mount("/", StaticFiles(directory="static", html=True), name="static")
