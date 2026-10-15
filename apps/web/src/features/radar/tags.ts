import { EMERGENCY_SQUAWKS, type Aircraft } from '@flight/shared';

const VS_THRESHOLD_FPM = 300;

/** ATC-style data tag: callsign, then "FL arrow speed", then the route when known. */
export function tagLines(a: Aircraft): string[] {
  const ident = a.callsign ?? a.registration ?? a.hex.replace('~', '').toUpperCase();
  const level = a.onGround
    ? 'GND'
    : a.altitudeFt === null
      ? '---'
      : String(Math.max(0, Math.round(a.altitudeFt / 100))).padStart(3, '0');
  const vs = a.verticalRateFpm ?? 0;
  const arrow = vs >= VS_THRESHOLD_FPM ? '↑' : vs <= -VS_THRESHOLD_FPM ? '↓' : ' ';
  const speed =
    a.groundSpeedKt === null ? '---' : String(Math.round(a.groundSpeedKt)).padStart(3, '0');

  const lines = [ident, `${level} ${arrow} ${speed}`];
  if (a.route) lines.push(`${a.route.origin}→${a.route.destination}`);
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
