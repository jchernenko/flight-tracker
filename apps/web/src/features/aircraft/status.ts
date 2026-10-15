import type { AircraftSnapshot } from './useAircraft';
import { clockText } from './format';

/** Past this with no new picture, the display treats what it has as stale. */
export const STALE_AFTER_MS = 30_000;

export type StatusKind = 'acquiring' | 'live' | 'stale' | 'offline';
/** `time` is when the feed last answered, "HH:MM:SS", when there's a picture. */
export type Status = { kind: StatusKind; time: string | null };

export function statusFor(
  data: AircraftSnapshot | undefined,
  isPending: boolean,
  isError: boolean,
  nowMs: number = performance.now(),
): Status {
  if (!data) return { kind: isPending ? 'acquiring' : 'offline', time: null };
  const time = clockText(new Date(data.fetchedAt), true);
  const old = nowMs - data.receivedAt > STALE_AFTER_MS;
  return { kind: isError || data.stale || old ? 'stale' : 'live', time };
}
