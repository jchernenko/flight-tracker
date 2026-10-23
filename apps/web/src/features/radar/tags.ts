import { EMERGENCY_SQUAWKS, type Aircraft } from '@flight/shared';

export type TagLine = { text: string; kind: 'ident' | 'altitude' | 'note' };

const thousands = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Climbing or descending faster than this shows an arrow. */
const VS_THRESHOLD_FPM = 300;

/** ↑ climbing, ↓ descending, nothing when level. */
export function trendArrow(a: Aircraft): '↑' | '↓' | '' {
  const vs = a.verticalRateFpm ?? 0;
  return vs >= VS_THRESHOLD_FPM ? '↑' : vs <= -VS_THRESHOLD_FPM ? '↓' : '';
}

/**
 * Scope data tag: the callsign, then the altitude with a climb or descent
 * arrow ("13,300 ft ↑"). Emergencies
 * show the squawk instead of the altitude; military traffic gets a note.
 */
export function tagLines(a: Aircraft): TagLine[] {
  const ident = a.callsign ?? a.registration ?? a.hex.replace('~', '').toUpperCase();
  const altitude = a.onGround
    ? 'GND'
    : a.altitudeFt === null
      ? '—'
      : `${thousands.format(a.altitudeFt)} ft${trendArrow(a) && ` ${trendArrow(a)}`}`;
  const lines: TagLine[] = [
    { text: ident, kind: 'ident' },
    { text: isEmergency(a) ? `${a.squawk} · EMERGENCY` : altitude, kind: 'altitude' },
  ];
  if (a.military) lines.push({ text: 'MILITARY', kind: 'note' });
  return lines;
}

export function isEmergency(a: Aircraft): boolean {
  return a.squawk !== null && (EMERGENCY_SQUAWKS as readonly string[]).includes(a.squawk);
}

/** Charter, private and helicopter traffic: drawn hollow, with quieter tags. Military has its own symbol. */
export function isMinor(a: Aircraft): boolean {
  return !a.military && a.kind !== 'airline';
}

export type Rect = { x: number; y: number; w: number; h: number };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Places a w×h tag near a blip at (x, y), trying the four diagonal corners in
 * turn and taking the first that doesn't overlap a tag already placed. When
 * every spot is taken the tag is left off (null), so a crowded scope shows
 * blips instead of a pile of unreadable text, unless `force` places it at the
 * top-right anyway (for the selected aircraft and emergencies).
 */
export function placeTag(
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
  placed: Rect[],
  force = false,
): Rect | null {
  const candidates: Rect[] = [
    { x: x + gap, y: y - gap - h, w, h },
    { x: x + gap, y: y + gap, w, h },
    { x: x - gap - w, y: y - gap - h, w, h },
    { x: x - gap - w, y: y + gap, w, h },
  ];
  const rect =
    candidates.find((c) => !placed.some((p) => overlaps(c, p))) ?? (force ? candidates[0]! : null);
  if (rect) placed.push(rect);
  return rect;
}

/** Collision test for labels placed elsewhere (the map's DOM labels). */
export function overlapsAny(rect: Rect, placed: Rect[]): boolean {
  return placed.some((p) => overlaps(rect, p));
}
