// ICAO airline codes as flown in ADS-B callsigns (e.g. "ACA191"), not IATA
// ticketing codes (e.g. "AC191"). Covers common carriers over the BC coast.
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

export function typeName(typeCode: string | null, desc: string | null): string | null {
  return desc ?? (typeCode ? (ICAO_TYPE_NAMES[typeCode] ?? typeCode) : null);
}
