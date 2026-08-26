import asyncio
import re
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

# Route (origin/destination) lookups: ADS-B itself carries no flight-plan data,
# so this hits a separate free community database (the same one tar1090 uses)
# that infers a route from the callsign. Results are cached per callsign since
# a flight's route doesn't change while it's in the air.
ROUTE_API_URL = "https://api.adsb.lol/api/0/routeset"
ROUTE_CACHE_TTL_SECONDS = 6 * 3600

# ICAO airline codes as flown in ADS-B callsigns (e.g. "ACA191"), not IATA
# ticketing codes (e.g. "AC191") -- covers common carriers over the BC coast.
ICAO_AIRLINES = {
    "ACA": "Air Canada", "ROU": "Air Canada Rouge", "WJA": "WestJet",
    "WSW": "WestJet Encore", "JZA": "Jazz", "QXE": "Horizon Air",
    "ASA": "Alaska Airlines", "SKW": "SkyWest", "UAL": "United Airlines",
    "DAL": "Delta Air Lines", "AAL": "American Airlines", "SWA": "Southwest Airlines",
    "FDX": "FedEx Express", "UPS": "UPS Airlines", "CJT": "Cargojet Airways",
    "PCO": "Pacific Coastal Airlines", "GLR": "Air Canada Express", "CMA": "Central Mountain Air",
    "FLE": "Flair Airlines", "CFG": "Condor", "ANA": "All Nippon Airways",
    "CPA": "Cathay Pacific", "KAL": "Korean Air", "EVA": "EVA Air", "QFA": "Qantas",
    "BAW": "British Airways", "DLH": "Lufthansa", "AFR": "Air France", "KLM": "KLM",
}

# Fallback ICAO type-designator -> name, used only when the API doesn't
# already supply a "desc" (long type name) for that aircraft.
ICAO_TYPE_NAMES = {
    "A20N": "Airbus A320neo", "A21N": "Airbus A321neo", "A319": "Airbus A319",
    "A320": "Airbus A320", "A321": "Airbus A321", "A332": "Airbus A330-200",
    "A333": "Airbus A330-300", "A359": "Airbus A350-900", "A388": "Airbus A380",
    "B737": "Boeing 737", "B738": "Boeing 737-800", "B39M": "Boeing 737 MAX 9",
    "B38M": "Boeing 737 MAX 8", "B752": "Boeing 757-200", "B763": "Boeing 767-300",
    "B772": "Boeing 777-200", "B77W": "Boeing 777-300ER", "B788": "Boeing 787-8",
    "B789": "Boeing 787-9", "B78X": "Boeing 787-10", "E170": "Embraer E170",
    "E75L": "Embraer E175", "E190": "Embraer E190", "CRJ2": "Bombardier CRJ200",
    "CRJ9": "Bombardier CRJ900", "CRJX": "Bombardier CRJ1000",
    "DH8A": "De Havilland Dash 8-100", "DH8D": "De Havilland Dash 8-400",
    "C172": "Cessna 172", "C182": "Cessna 182", "PA28": "Piper PA-28",
    "BE20": "Beechcraft King Air 200",
}

CALLSIGN_RE = re.compile(r"^([A-Z]{2,3})(\d{1,4}[A-Z]?)$")

flight_cache = {"data": [], "last_updated": 0.0}
route_cache: dict[str, dict] = {}  # callsign -> {"origin", "destination", "expires"}


def parse_airline(callsign: str) -> tuple[str | None, str | None]:
    match = CALLSIGN_RE.match(callsign)
    if not match:
        return None, None
    prefix, flight_number = match.groups()
    return ICAO_AIRLINES.get(prefix), flight_number


def normalize_aircraft(ac: dict) -> dict:
    alt_baro = ac.get("alt_baro")
    altitude = 0 if alt_baro in (None, "ground") else int(alt_baro)

    speed = ac.get("gs")
    heading = ac.get("track")
    callsign = (ac.get("flight") or "UNKNOWN").strip() or "UNKNOWN"
    airline, flight_number = parse_airline(callsign)

    type_code = ac.get("t")
    type_name = ac.get("desc") or ICAO_TYPE_NAMES.get(type_code) or type_code

    db_flags = ac.get("dbFlags") or 0

    return {
        "callsign": callsign,
        "airline": airline,
        "flight_number": flight_number,
        "altitude": altitude,
        "speed": int(speed) if speed is not None else 0,
        "heading": int(heading) if heading is not None else 0,
        "vertical_rate": ac.get("baro_rate") or ac.get("geom_rate") or 0,
        "lat": ac.get("lat"),
        "lon": ac.get("lon"),
        "type_code": type_code,
        "type_name": type_name,
        "registration": ac.get("r"),
        "military": bool(db_flags & 1),
        "route": None,  # filled in by fetch_routes()
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


async def fetch_routes(client: httpx.AsyncClient, flights: list[dict]) -> None:
    """Fill in flight["route"] for airline flights, using a cached, batched
    lookup so a callsign already seen this session doesn't get re-queried."""
    now = time.time()
    needed = {
        f["callsign"]
        for f in flights
        if f["airline"] and f["lat"] is not None and f["lon"] is not None
        and f["callsign"] not in route_cache
    }

    if needed:
        planes = [
            {"callsign": f["callsign"], "lat": f["lat"], "lng": f["lon"]}
            for f in flights
            if f["callsign"] in needed
        ]
        try:
            response = await client.post(ROUTE_API_URL, json={"planes": planes}, timeout=8.0)
            response.raise_for_status()
            for route in response.json():
                callsign = route.get("callsign")
                airports = route.get("_airports") or []
                if callsign and route.get("plausible") and len(airports) >= 2:
                    route_cache[callsign] = {
                        "origin": airports[0].get("iata") or airports[0].get("icao"),
                        "destination": airports[-1].get("iata") or airports[-1].get("icao"),
                        "expires": now + ROUTE_CACHE_TTL_SECONDS,
                    }
                elif callsign:
                    route_cache[callsign] = {"origin": None, "destination": None, "expires": now + ROUTE_CACHE_TTL_SECONDS}
        except Exception as e:
            print(f"Error fetching routes: {e}")

    for f in flights:
        cached = route_cache.get(f["callsign"])
        if cached and cached["expires"] > now and cached["origin"]:
            f["route"] = {"origin": cached["origin"], "destination": cached["destination"]}


async def refresh_loop():
    fetch = FETCHERS[DATA_SOURCE]
    async with httpx.AsyncClient() as client:
        while True:
            new_data = await fetch(client)
            if new_data is not None:
                await fetch_routes(client, new_data)
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


@app.get("/api/config")
async def get_config():
    return {"center_lat": CENTER_LAT, "center_lon": CENTER_LON, "radius_nm": RADIUS_NM}


# Serve the frontend from the 'static' folder
app.mount("/", StaticFiles(directory="static", html=True), name="static")
