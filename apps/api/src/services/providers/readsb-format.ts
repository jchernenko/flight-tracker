import { z } from 'zod';
import type { Aircraft } from '@flight/shared';
import { parseCallsign, typeName } from '../../utils/lookups.js';

// The readsb / tar1090 aircraft JSON format, shared by adsb.lol, airplanes.live
// and a home receiver's aircraft.json. Only the fields we use are listed.
const rawAircraftSchema = z.object({
  hex: z.string(),
  flight: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  alt_baro: z.union([z.number(), z.literal('ground')]).optional(),
  gs: z.number().optional(),
  track: z.number().optional(),
  true_heading: z.number().optional(),
  baro_rate: z.number().optional(),
  geom_rate: z.number().optional(),
  squawk: z.string().optional(),
  t: z.string().optional(),
  desc: z.string().optional(),
  r: z.string().optional(),
  dbFlags: z.number().optional(),
  seen_pos: z.number().optional(),
  seen: z.number().optional(),
});

export const readsbPayloadSchema = z.object({
  /** Feed clock. adsb.lol / airplanes.live send ms; readsb's aircraft.json sends seconds. */
  now: z.number().optional(),
  ac: z.array(z.unknown()).optional(),
  aircraft: z.array(z.unknown()).optional(),
});

export type ReadsbPayload = z.infer<typeof readsbPayloadSchema>;

function feedNowMs(now: number | undefined, fallbackMs: number): number {
  if (now === undefined) return fallbackMs;
  return now > 1e12 ? now : now * 1000;
}

/** Normalizes a readsb-format payload. Entries without a position, or malformed ones, are dropped. */
export function normalizeReadsb(payload: ReadsbPayload, fallbackNowMs = Date.now()): Aircraft[] {
  const nowMs = feedNowMs(payload.now, fallbackNowMs);
  const result: Aircraft[] = [];

  for (const entry of payload.ac ?? payload.aircraft ?? []) {
    const parsed = rawAircraftSchema.safeParse(entry);
    if (!parsed.success) continue;
    const ac = parsed.data;
    if (ac.lat === undefined || ac.lon === undefined) continue;

    const callsign = ac.flight?.trim() || null;
    const onGround = ac.alt_baro === 'ground';
    const ageSeconds = ac.seen_pos ?? ac.seen ?? 0;

    result.push({
      hex: ac.hex.toLowerCase(),
      callsign,
      lat: ac.lat,
      lon: ac.lon,
      altitudeFt: typeof ac.alt_baro === 'number' ? ac.alt_baro : null,
      onGround,
      groundSpeedKt: ac.gs ?? null,
      trackDeg: ac.track ?? ac.true_heading ?? null,
      verticalRateFpm: ac.baro_rate ?? ac.geom_rate ?? null,
      squawk: ac.squawk ?? null,
      type: ac.t ?? null,
      typeName: typeName(ac.t ?? null, ac.desc ?? null),
      registration: ac.r ?? null,
      ...parseCallsign(callsign),
      military: ((ac.dbFlags ?? 0) & 1) === 1,
      route: null,
      seenAt: new Date(nowMs - ageSeconds * 1000).toISOString(),
    });
  }
  return result;
}
