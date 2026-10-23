import { readFileSync } from 'node:fs';
import type { AircraftKind, LatLon } from '@flight/shared';

// IATA and ICAO airport code -> [lat, lon], from OurAirports (see scripts/build-airports.mjs).
const AIRPORT_POSITIONS: Record<string, [number, number]> = JSON.parse(
  readFileSync(new URL('../data/airports.json', import.meta.url), 'utf8'),
);

/** Position of an airport by IATA ("YVR") or ICAO ("CYVR") code, for route lines. */
export function airportPos(code: string): LatLon | null {
  const pos = AIRPORT_POSITIONS[code];
  return pos ? { lat: pos[0], lon: pos[1] } : null;
}

// ICAO codes of scheduled and cargo airlines as flown in ADS-B callsigns
// (e.g. "ACA191"), not IATA ticketing codes (e.g. "AC191"). Covers carriers
// seen over the BC coast. Any other operator code counts as a charter.
// prettier-ignore
const ICAO_AIRLINES: Record<string, string> = {
  ACA: 'Air Canada', ROU: 'Air Canada Rouge', WJA: 'WestJet', WSW: 'WestJet Encore',
  JZA: 'Jazz', QXE: 'Horizon Air', ASA: 'Alaska Airlines', SKW: 'SkyWest',
  UAL: 'United Airlines', DAL: 'Delta Air Lines', AAL: 'American Airlines',
  SWA: 'Southwest Airlines', FDX: 'FedEx Express', UPS: 'UPS Airlines', CJT: 'Cargojet Airways',
  PCO: 'Pacific Coastal Airlines', GLR: 'Air Canada Express', CMA: 'Central Mountain Air',
  FLE: 'Flair Airlines', CFG: 'Condor', ANA: 'All Nippon Airways', CPA: 'Cathay Pacific',
  KAL: 'Korean Air', EVA: 'EVA Air', QFA: 'Qantas', BAW: 'British Airways', DLH: 'Lufthansa',
  AFR: 'Air France', KLM: 'KLM',
  WEN: 'WestJet Encore', TSC: 'Air Transat', POE: 'Porter Airlines', HES: 'Harbour Air',
  JBU: 'JetBlue', NKS: 'Spirit Airlines', FFT: 'Frontier Airlines', AAY: 'Allegiant Air',
  SCX: 'Sun Country', HAL: 'Hawaiian Airlines', ENY: 'Envoy Air', RPA: 'Republic Airways',
  GTI: 'Atlas Air', ABX: 'ABX Air', ATN: 'Air Transport International', CKS: 'Kalitta Air',
  PAC: 'Polar Air Cargo', JAL: 'Japan Airlines', AAR: 'Asiana Airlines', CAL: 'China Airlines',
  CES: 'China Eastern', CSN: 'China Southern', CCA: 'Air China',
  PAL: 'Philippine Airlines', SIA: 'Singapore Airlines', ANZ: 'Air New Zealand', FJI: 'Fiji Airways',
  VIR: 'Virgin Atlantic', ICE: 'Icelandair', EDW: 'Edelweiss', SWR: 'Swiss', THY: 'Turkish Airlines',
  UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad', AMX: 'Aeroméxico', VIV: 'Viva Aerobus',
  VOI: 'Volaris', CMP: 'Copa Airlines', AVA: 'Avianca', HKE: 'HK Express',
};

// Fallback ICAO type designator -> name, used only when the feed doesn't
// already supply a long type name ("desc") for that aircraft.
// prettier-ignore
const ICAO_TYPE_NAMES: Record<string, string> = {
  A20N: 'Airbus A320neo', A21N: 'Airbus A321neo', A319: 'Airbus A319', A320: 'Airbus A320',
  A321: 'Airbus A321', A332: 'Airbus A330-200', A333: 'Airbus A330-300', A359: 'Airbus A350-900',
  A388: 'Airbus A380', B737: 'Boeing 737', B738: 'Boeing 737-800', B39M: 'Boeing 737 MAX 9',
  B38M: 'Boeing 737 MAX 8', B752: 'Boeing 757-200', B763: 'Boeing 767-300',
  B772: 'Boeing 777-200', B77W: 'Boeing 777-300ER', B788: 'Boeing 787-8', B789: 'Boeing 787-9',
  B78X: 'Boeing 787-10', E170: 'Embraer E170', E75L: 'Embraer E175', E190: 'Embraer E190',
  CRJ2: 'Bombardier CRJ200', CRJ9: 'Bombardier CRJ900', CRJX: 'Bombardier CRJ1000',
  DH8A: 'De Havilland Dash 8-100', DH8D: 'De Havilland Dash 8-400', C172: 'Cessna 172',
  C182: 'Cessna 182', PA28: 'Piper PA-28', BE20: 'Beechcraft King Air 200',
};

const CALLSIGN_RE = /^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/;
const AIRLINE_CALLSIGN_RE = /^[A-Z]{3}\d{1,4}[A-Z]?$/;

export function parseCallsign(callsign: string | null): {
  airline: string | null;
  flightNumber: string | null;
} {
  const match = callsign ? CALLSIGN_RE.exec(callsign) : null;
  if (!match) return { airline: null, flightNumber: null };
  const [, prefix = '', flightNumber = null] = match;
  return { airline: ICAO_AIRLINES[prefix] ?? null, flightNumber };
}

/** True for callsigns shaped like an airline flight ("ACA191"), not a registration. */
export function isAirlineCallsign(callsign: string | null): callsign is string {
  return callsign !== null && AIRLINE_CALLSIGN_RE.test(callsign);
}

/** Airline, charter or private, from the callsign; helicopters from the feed's category ("A7"). */
export function aircraftKind(callsign: string | null, category?: string | null): AircraftKind {
  if (category === 'A7') return 'helicopter';
  if (!isAirlineCallsign(callsign)) return 'private';
  return callsign.slice(0, 3) in ICAO_AIRLINES ? 'airline' : 'charter';
}

export function typeName(typeCode: string | null, desc: string | null): string | null {
  return desc ?? (typeCode ? (ICAO_TYPE_NAMES[typeCode] ?? typeCode) : null);
}

// IATA airport code -> city, for the display's "Calgary → Vancouver" lines.
// Weighted to routes over the BC coast; adsbdb's municipality fills gaps.
// prettier-ignore
const AIRPORT_CITIES: Record<string, string> = {
  YVR: 'Vancouver', YXX: 'Abbotsford', YYJ: 'Victoria', YCD: 'Nanaimo', YQQ: 'Comox',
  YLW: 'Kelowna', YKA: 'Kamloops', YYF: 'Penticton', YXC: 'Cranbrook', YCG: 'Castlegar',
  YXS: 'Prince George', YPR: 'Prince Rupert', YXT: 'Terrace', YZP: 'Sandspit',
  YWL: 'Williams Lake', YXJ: 'Fort St. John', YDQ: 'Dawson Creek', YZT: 'Port Hardy',
  YBL: 'Campbell River', YAZ: 'Tofino', YXY: 'Whitehorse', YZF: 'Yellowknife',
  YYC: 'Calgary', YEG: 'Edmonton', YQU: 'Grande Prairie', YMM: 'Fort McMurray',
  YQL: 'Lethbridge', YXH: 'Medicine Hat', YXE: 'Saskatoon', YQR: 'Regina',
  YWG: 'Winnipeg', YQT: 'Thunder Bay', YYZ: 'Toronto', YTZ: 'Toronto', YOW: 'Ottawa',
  YUL: 'Montréal', YQB: 'Québec City', YHZ: 'Halifax', YYT: "St. John's", YXU: 'London',
  YHM: 'Hamilton', YQM: 'Moncton', YFC: 'Fredericton',
  BLI: 'Bellingham', SEA: 'Seattle', BFI: 'Seattle', PAE: 'Everett', GEG: 'Spokane',
  PDX: 'Portland', BOI: 'Boise', SLC: 'Salt Lake City', SFO: 'San Francisco',
  OAK: 'Oakland', SJC: 'San Jose', SMF: 'Sacramento', LAX: 'Los Angeles',
  BUR: 'Burbank', LGB: 'Long Beach', SNA: 'Santa Ana', SAN: 'San Diego',
  PSP: 'Palm Springs', LAS: 'Las Vegas', PHX: 'Phoenix', DEN: 'Denver', DFW: 'Dallas',
  IAH: 'Houston', ORD: 'Chicago', MSP: 'Minneapolis', ATL: 'Atlanta', JFK: 'New York',
  LGA: 'New York', EWR: 'Newark', BOS: 'Boston', IAD: 'Washington', MCO: 'Orlando',
  MIA: 'Miami', ANC: 'Anchorage', FAI: 'Fairbanks', JNU: 'Juneau', KTN: 'Ketchikan',
  HNL: 'Honolulu', OGG: 'Kahului', KOA: 'Kona', LIH: 'Lihue',
  MEX: 'Mexico City', CUN: 'Cancún', PVR: 'Puerto Vallarta', SJD: 'Los Cabos',
  GDL: 'Guadalajara', LHR: 'London', LGW: 'London', DUB: 'Dublin', KEF: 'Reykjavík',
  AMS: 'Amsterdam', CDG: 'Paris', FRA: 'Frankfurt', MUC: 'Munich', ZRH: 'Zurich',
  NRT: 'Tokyo', HND: 'Tokyo', KIX: 'Osaka', ICN: 'Seoul', TPE: 'Taipei',
  HKG: 'Hong Kong', PEK: 'Beijing', PVG: 'Shanghai', CAN: 'Guangzhou', MNL: 'Manila',
  SIN: 'Singapore', SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane', AKL: 'Auckland',
  DXB: 'Dubai', DOH: 'Doha', DEL: 'Delhi',
};

/**
 * City for an airport code. Takes IATA ("YYC") or a Canadian/US ICAO code
 * ("CYYC", "KSEA"), whose last three letters are usually the IATA code.
 */
export function airportCity(code: string): string | null {
  const upper = code.toUpperCase();
  const iata = upper.length === 4 && /^[CK]/.test(upper) ? upper.slice(1) : upper;
  return AIRPORT_CITIES[iata] ?? null;
}
