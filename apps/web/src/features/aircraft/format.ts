import { distanceNm, type Aircraft, type LatLon } from '@flight/shared';
import { isEmergency } from '../radar/tags';

const VS_THRESHOLD_FPM = 300;
const thousands = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const ident = (a: Aircraft): string =>
  a.callsign ?? a.registration ?? a.hex.replace('~', '').toUpperCase();

/** "13,300", or "GND" on the ground and "—" when unknown. */
export function altitudeText(a: Aircraft): string {
  if (a.onGround) return 'GND';
  return a.altitudeFt === null ? '—' : thousands.format(a.altitudeFt);
}

/** Origin and destination codes ("YYC→YVR"), else "MIL" or "VFR". */
export function routeCode(a: Aircraft, separator = '→'): string {
  if (a.route) return `${a.route.origin}${separator}${a.route.destination}`;
  return a.military ? 'MIL' : 'VFR';
}

/** "Calgary → Vancouver", falling back to codes, or a plain-language note when there's no route. */
export function routeCities(a: Aircraft): string {
  if (a.route) {
    const { origin, destination, originCity, destinationCity } = a.route;
    return `${originCity ?? origin} → ${destinationCity ?? destination}`;
  }
  return a.military ? 'Route not published' : 'Local VFR flight';
}

/** "Air Canada 1418", or whatever identifies the operator best. */
export function operatorLine(a: Aircraft): string {
  if (a.airline) return a.flightNumber ? `${a.airline} ${a.flightNumber}` : a.airline;
  if (a.military) return 'Military';
  return a.registration ?? a.typeName ?? '';
}

export function trendArrow(a: Aircraft): '↑' | '↓' | '' {
  const vs = a.verticalRateFpm ?? 0;
  return vs >= VS_THRESHOLD_FPM ? '↑' : vs <= -VS_THRESHOLD_FPM ? '↓' : '';
}

/** Vertical speed in fpm with a sign: "+1,200", "−800", "0". */
export function verticalSpeedText(a: Aircraft): string {
  if (a.verticalRateFpm === null) return '—';
  const vs = Math.round(a.verticalRateFpm / 100) * 100;
  if (vs === 0) return '0';
  return `${vs > 0 ? '+' : '−'}${thousands.format(Math.abs(vs))}`;
}

export const speedText = (a: Aircraft): string =>
  a.groundSpeedKt === null ? '—' : String(Math.round(a.groundSpeedKt));

/** Heading as three digits and a degree sign: "007°". */
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The nearest of the eight compass points: 290° is "W", 315° is "NW". */
export const compassPoint = (deg: number): string =>
  POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

/** "007° N". */
export const bearingText = (deg: number): string =>
  `${String(Math.round(deg) % 360).padStart(3, '0')}° ${compassPoint(deg)}`;

export const headingText = (a: Aircraft): string =>
  a.trackDeg === null ? '—' : bearingText(a.trackDeg);

/** "9.8 nm E of you". */
export function whereText(home: LatLon, a: Aircraft): string {
  const dist = distanceNm(home, a);
  const cosLat = Math.cos((home.lat * Math.PI) / 180);
  const bearing = (Math.atan2((a.lon - home.lon) * cosLat, a.lat - home.lat) * 180) / Math.PI;
  return `${dist.toFixed(1)} nm ${compassPoint(bearing)} of you`;
}

/** "Boeing 737 MAX 8 · C-FNWD · 9.8 nm E of you". */
export function detailFooter(home: LatLon, a: Aircraft): string {
  return [a.typeName ?? a.type, a.registration, whereText(home, a)].filter(Boolean).join(' · ');
}

const SQUAWK_MEANINGS: Record<string, string> = {
  '7500': 'hijack',
  '7600': 'radio failure',
  '7700': 'general emergency',
};

export const squawkMeaning = (squawk: string | null): string =>
  (squawk && SQUAWK_MEANINGS[squawk]) ?? 'emergency';

/** Emergencies first, then highest first; ground and unknown altitudes last. */
export function sortForList(aircraft: Aircraft[]): Aircraft[] {
  const height = (a: Aircraft) => (a.onGround ? -1 : (a.altitudeFt ?? -1));
  return [...aircraft].sort(
    (a, b) => Number(isEmergency(b)) - Number(isEmergency(a)) || height(b) - height(a),
  );
}

/** 24-hour "08:16", or with seconds "08:16:05". */
export function clockText(date: Date, seconds = false): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
  });
}
