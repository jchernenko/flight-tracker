import { z } from 'zod';

export const routeSchema = z.object({
  origin: z.string(),
  destination: z.string(),
});

export const aircraftSchema = z.object({
  /** ICAO 24-bit address, lowercase hex. A leading `~` marks a non-ICAO (TIS-B) id. */
  hex: z.string(),
  callsign: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  /** Barometric altitude. Null when on the ground or unknown. */
  altitudeFt: z.number().nullable(),
  onGround: z.boolean(),
  groundSpeedKt: z.number().nullable(),
  trackDeg: z.number().nullable(),
  verticalRateFpm: z.number().nullable(),
  squawk: z.string().nullable(),
  /** ICAO type designator, e.g. "B738". */
  type: z.string().nullable(),
  typeName: z.string().nullable(),
  registration: z.string().nullable(),
  airline: z.string().nullable(),
  flightNumber: z.string().nullable(),
  military: z.boolean(),
  route: routeSchema.nullable(),
  /** ISO time the position was last updated. */
  seenAt: z.string(),
});

export const aircraftResponseSchema = z.object({
  center: z.object({ lat: z.number(), lon: z.number() }),
  radiusNm: z.number(),
  /** When the API fetched this picture from the feed. */
  fetchedAt: z.string(),
  /** When the API sent this response. The picture may have sat in its cache since `fetchedAt`. */
  servedAt: z.string(),
  stale: z.boolean(),
  aircraft: z.array(aircraftSchema),
});

export type Route = z.infer<typeof routeSchema>;
export type Aircraft = z.infer<typeof aircraftSchema>;
export type AircraftResponse = z.infer<typeof aircraftResponseSchema>;
