import { EMERGENCY_SQUAWKS, type Aircraft } from '@flight/shared';

export type TagLine = { text: string; kind: 'ident' | 'altitude' | 'note' };

const thousands = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Scope data tag: the callsign, then the altitude ("13,300 ft"). Emergencies
 * show the squawk instead of the altitude; military traffic gets a note.
 */
export function tagLines(a: Aircraft): TagLine[] {
  const ident = a.callsign ?? a.registration ?? a.hex.replace('~', '').toUpperCase();
  const altitude = a.onGround
    ? 'GND'
    : a.altitudeFt === null
      ? '—'
      : `${thousands.format(a.altitudeFt)} ft`;
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

export type Rect = { x: number; y: number; w: number; h: number };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Places a w×h tag near a blip at (x, y), trying the four diagonal corners in
 * turn and taking the first that doesn't overlap a tag already placed.
 * Falls back to the top-right corner when every spot is taken.
 */
export function placeTag(
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
  placed: Rect[],
): Rect {
  const candidates: Rect[] = [
    { x: x + gap, y: y - gap - h, w, h },
    { x: x + gap, y: y + gap, w, h },
    { x: x - gap - w, y: y - gap - h, w, h },
    { x: x - gap - w, y: y + gap, w, h },
  ];
  const free = candidates.find((c) => !placed.some((p) => overlaps(c, p)));
  const rect = free ?? candidates[0]!;
  placed.push(rect);
  return rect;
}
