import type { Aircraft } from '@flight/shared';
import type { FeedProvider } from './types.js';
import { aircraftKind, airportCity, parseCallsign, typeName } from '../../utils/lookups.js';

type DemoTrack = {
  hex: string;
  callsign: string;
  type: string;
  /** Orbit around the home point: radius and speed decide the motion. */
  orbitNm: number;
  phaseDeg: number;
  clockwise: boolean;
  altitudeFt: number | null;
  speedKt: number;
  verticalRateFpm: number;
  squawk: string;
  route?: [origin: string, destination: string];
  military?: boolean;
  category?: string;
};

// prettier-ignore
const TRACKS: DemoTrack[] = [
  { hex: 'c0ffee', callsign: 'ACA123', type: 'A321', orbitNm: 22, phaseDeg: 30, clockwise: true, altitudeFt: 35000, speedKt: 452, verticalRateFpm: 0, squawk: '2341', route: ['YYZ', 'YVR'] },
  { hex: 'c0a001', callsign: 'WJA456', type: 'B38M', orbitNm: 14, phaseDeg: 200, clockwise: false, altitudeFt: 11000, speedKt: 280, verticalRateFpm: -1500, squawk: '4412', route: ['YYC', 'YVR'] },
  { hex: 'c0a002', callsign: 'JZA789', type: 'DH8D', orbitNm: 8, phaseDeg: 110, clockwise: true, altitudeFt: 6500, speedKt: 230, verticalRateFpm: 1200, squawk: '5523', route: ['YVR', 'YLW'] },
  { hex: 'c0a003', callsign: 'CGKLM', type: 'C172', orbitNm: 4, phaseDeg: 300, clockwise: false, altitudeFt: 1800, speedKt: 95, verticalRateFpm: 0, squawk: '1200' },
  { hex: 'a1b2c3', callsign: 'ASA12', type: 'B739', orbitNm: 45, phaseDeg: 260, clockwise: true, altitudeFt: 38000, speedKt: 480, verticalRateFpm: 0, squawk: '3317', route: ['SEA', 'ANC'] },
  { hex: 'c0a004', callsign: 'PCO301', type: 'BE20', orbitNm: 18, phaseDeg: 340, clockwise: false, altitudeFt: 9000, speedKt: 240, verticalRateFpm: 800, squawk: '6041', route: ['YVR', 'YCD'] },
  { hex: 'a4c1e2', callsign: 'LXJ396', type: 'CL35', orbitNm: 26, phaseDeg: 150, clockwise: false, altitudeFt: 24000, speedKt: 410, verticalRateFpm: -1800, squawk: '3651' },
  { hex: 'c0a005', callsign: 'CGHLI', type: 'AS50', orbitNm: 6, phaseDeg: 20, clockwise: true, altitudeFt: 1200, speedKt: 110, verticalRateFpm: 0, squawk: '1200', category: 'A7' },
  { hex: 'c0a006', callsign: 'ACA1102', type: 'A320', orbitNm: 140, phaseDeg: 70, clockwise: false, altitudeFt: 37000, speedKt: 470, verticalRateFpm: 0, squawk: '2214', route: ['YYC', 'YVR'] },
  { hex: 'c2b0f1', callsign: 'CFC4011', type: 'C130', orbitNm: 12, phaseDeg: 60, clockwise: true, altitudeFt: 16000, speedKt: 260, verticalRateFpm: 0, squawk: '4000', military: true },
];

/** Fake traffic orbiting the home point, for local development without network access. */
export function createDemoProvider(now: () => number = Date.now): FeedProvider {
  return {
    name: 'demo',
    label: 'the demo feed',
    async fetchAircraft(center) {
      const t = now() / 1000;
      const kmPerDegLat = 111.32;
      const cosLat = Math.cos((center.lat * Math.PI) / 180);

      return TRACKS.map((track): Aircraft => {
        const angularSpeedDegPerSec = (track.speedKt / 3600 / (2 * Math.PI * track.orbitNm)) * 360;
        const sign = track.clockwise ? 1 : -1;
        const bearing = (track.phaseDeg + sign * angularSpeedDegPerSec * t) % 360;
        const rad = (bearing * Math.PI) / 180;
        const northNm = track.orbitNm * Math.cos(rad);
        const eastNm = track.orbitNm * Math.sin(rad);
        const nmToKm = 1.852;

        return {
          hex: track.hex,
          callsign: track.callsign,
          lat: center.lat + (northNm * nmToKm) / kmPerDegLat,
          lon: center.lon + (eastNm * nmToKm) / (kmPerDegLat * cosLat),
          altitudeFt: track.altitudeFt,
          onGround: false,
          groundSpeedKt: track.speedKt,
          trackDeg: (((bearing + sign * 90) % 360) + 360) % 360,
          verticalRateFpm: track.verticalRateFpm,
          squawk: track.squawk,
          type: track.type,
          typeName: typeName(track.type, null),
          registration: null,
          ...parseCallsign(track.callsign),
          military: track.military ?? false,
          kind: aircraftKind(track.callsign, track.category),
          route: track.route
            ? {
                origin: track.route[0],
                destination: track.route[1],
                originCity: airportCity(track.route[0]),
                destinationCity: airportCity(track.route[1]),
              }
            : null,
          seenAt: new Date(now()).toISOString(),
        };
      });
    },
  };
}
