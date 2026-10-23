import L from 'leaflet';
import { distanceNm, greatCircle, type Aircraft, type LatLon } from '@flight/shared';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import { STALE_AFTER_MS } from '../aircraft/status';
import { alertRgb, altitudeRgb, type Theme } from '../../lib/theme';
import { deadReckon, positionAgeSec, toLatLon } from '../radar/geometry';
import {
  isEmergency,
  isMinor,
  overlapsAny,
  tagLines,
  type Rect,
  type TagLine,
} from '../radar/tags';
import { splitPath, trackHistory, trailPath } from '../radar/trails';

/** Aircraft move this often between polls; plenty for a map, cheap for the tablet. */
const TICK_MS = 1000;
/** While an emergency is on screen the pulse ring animates at this rate instead. */
const PULSE_FRAME_MS = 1000 / 15;
const PULSE_MS = 1400;
/** Trails are drawn as this many runs, each fainter than the one before, to fade out. */
const TRAIL_SEGMENTS = 6;
const HIT_RADIUS = 22;
const GLOW_RADIUS = 14;
/** Labels sit up and to the right of the aircraft, as the DOM markers did. */
const LABEL_DX = 12;
const LABEL_DY = -22;
const LABEL_LINE_H = 15;
const MINOR_LABEL_ALPHA = 0.7;
const ROUTE_STEP_NM = 20;
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const FONTS: Record<TagLine['kind'], string> = {
  ident: '600 12px Geist, system-ui, sans-serif',
  altitude: '400 11px "Geist Mono", ui-monospace, monospace',
  note: '400 11px "Geist Mono", ui-monospace, monospace',
};

type Drawn = { a: Aircraft; x: number; y: number; rgb: string };

/**
 * Every aircraft on the map, drawn on one canvas over the tiles: trails,
 * symbols, labels and the selected flight's route line. Hundreds of DOM
 * markers would be slow on the tablet at the wide ranges.
 */
export class MapAircraftLayer {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private snapshot: AircraftSnapshot | null = null;
  private rangeNm = 0;
  private selected: string | null = null;
  private stale = false;
  private frozenElapsed: number | null = null;
  private drawn: Drawn[] = [];
  private glowSprites = new Map<string, HTMLCanvasElement>();
  private dpr = 1;
  private tick = 0;
  private pulseTimer = 0;

  constructor(
    private readonly map: L.Map,
    private theme: Theme,
    /** Degrees the map is turned for heading-up, so labels can be turned back upright. */
    private readonly heading: () => number,
    private readonly onSelect: (hex: string | null) => void,
  ) {
    this.ctx = this.canvas.getContext('2d')!;
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '450',
      pointerEvents: 'none',
    });
    map.getContainer().appendChild(this.canvas);
    map.on('move zoom resize', this.draw);
    map.on('click', this.click);
    this.tick = window.setInterval(this.draw, TICK_MS);
    this.draw();
  }

  remove(): void {
    window.clearInterval(this.tick);
    window.clearTimeout(this.pulseTimer);
    this.map.off('move zoom resize', this.draw);
    this.map.off('click', this.click);
    this.canvas.remove();
  }

  setSnapshot(snapshot: AircraftSnapshot, rangeNm: number): void {
    if (this.snapshot?.fetchedAt !== snapshot.fetchedAt) this.frozenElapsed = null;
    this.snapshot = snapshot;
    this.rangeNm = rangeNm;
    this.draw();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.glowSprites.clear();
    this.draw();
  }

  setSelected(hex: string | null): void {
    this.selected = hex;
    this.draw();
  }

  setStale(stale: boolean): void {
    this.stale = stale;
  }

  redraw(): void {
    this.draw();
  }

  /** Taps select the nearest aircraft within reach, or clear the selection. */
  private click = (e: L.LeafletMouseEvent) => {
    // Leaflet's containerPoint ignores the CSS turn in heading-up, so undo it here.
    const rect = this.canvas.getBoundingClientRect();
    const dx = e.originalEvent.clientX - (rect.left + rect.width / 2);
    const dy = e.originalEvent.clientY - (rect.top + rect.height / 2);
    const [lx, ly] = rotate(dx, dy, this.heading());
    const x = lx + this.canvas.clientWidth / 2;
    const y = ly + this.canvas.clientHeight / 2;
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const d of this.drawn) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist <= bestDist) {
        best = d.a.hex;
        bestDist = dist;
      }
    }
    this.onSelect(best !== null && best !== this.selected ? best : null);
  };

  private resize(): boolean {
    const { clientWidth: w, clientHeight: h } = this.map.getContainer();
    const dpr = window.devicePixelRatio || 1;
    if (w === 0 || h === 0) return false;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      if (dpr !== this.dpr) this.glowSprites.clear();
      this.dpr = dpr;
    }
    return true;
  }

  private point(p: LatLon): L.Point {
    return this.map.latLngToContainerPoint([p.lat, p.lon]);
  }

  private draw = (): void => {
    const { ctx, snapshot, theme } = this;
    if (!this.resize()) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawn = [];
    if (!snapshot) return;

    let elapsed = performance.now() - snapshot.receivedAt;
    if (this.stale || snapshot.stale || elapsed > STALE_AFTER_MS) {
      this.frozenElapsed ??= Math.min(elapsed, STALE_AFTER_MS);
    }
    // Frozen until a new picture arrives, so aircraft don't jump ahead.
    if (this.frozenElapsed !== null) elapsed = this.frozenElapsed;
    const nowMs = Date.parse(snapshot.servedAt) + elapsed;
    const center = snapshot.center;
    const alert = alertRgb(theme);

    // Trails first, so symbols and labels sit on top of them.
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let selectedHere: { a: Aircraft; here: LatLon } | null = null;
    for (const a of snapshot.aircraft) {
      if (distanceNm(center, a) > this.rangeNm) continue;
      const head = deadReckon(a, center, positionAgeSec(a, snapshot.servedAt, elapsed));
      const here = toLatLon(center, head);
      const { x, y } = this.point(here);
      const rgb = isEmergency(a) ? alert : altitudeRgb(theme, a.onGround ? 0 : a.altitudeFt);
      this.drawn.push({ a, x, y, rgb });
      if (a.hex === this.selected) selectedHere = { a, here };

      // Through the positions it reported, so turns show, like the radar.
      const path = trailPath(a, head, center, trackHistory.fixesFor(a.hex), nowMs);
      ctx.strokeStyle = `rgb(${rgb})`;
      splitPath(path, TRAIL_SEGMENTS).forEach((run, i) => {
        if (run.length < 2) return;
        ctx.globalAlpha = 0.85 * (1 - i / TRAIL_SEGMENTS);
        ctx.beginPath();
        run.forEach((o, k) => {
          const p = this.point(toLatLon(center, o));
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;

    if (selectedHere) this.drawRoute(selectedHere.a, selectedHere.here);

    const t = performance.now();
    let pulsing = false;
    for (const d of this.drawn) pulsing = this.drawSymbol(d, t) || pulsing;
    this.drawLabels();

    // Animate the emergency ring only while one is on screen.
    window.clearTimeout(this.pulseTimer);
    if (pulsing) this.pulseTimer = window.setTimeout(this.draw, PULSE_FRAME_MS);
  };

  /** Returns true for an emergency, whose ring is animating. */
  private drawSymbol({ a, x, y, rgb }: Drawn, t: number): boolean {
    const { ctx, theme } = this;
    const emergency = isEmergency(a);
    if (a.hex === this.selected) {
      ctx.fillStyle = theme.selRing;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    if (emergency) {
      const phase = REDUCED_MOTION ? 0.3 : (t % PULSE_MS) / PULSE_MS;
      ctx.globalAlpha = 1 - phase;
      ctx.strokeStyle = `rgb(${rgb})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 8 + 22 * phase, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1.5;
    if (a.military && !emergency) {
      // Military: a hollow diamond, never red.
      ctx.strokeStyle = theme.text;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.stroke();
    } else if (a.kind === 'helicopter' && !emergency) {
      ctx.strokeStyle = `rgb(${rgb})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
    } else if (isMinor(a) && !emergency) {
      // Charter and private: a hollow ring.
      ctx.strokeStyle = `rgb(${rgb})`;
      ctx.beginPath();
      ctx.arc(x, y, 4.25, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      if (!emergency) {
        ctx.drawImage(
          this.glow(rgb),
          x - GLOW_RADIUS,
          y - GLOW_RADIUS,
          GLOW_RADIUS * 2,
          GLOW_RADIUS * 2,
        );
      }
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return emergency && !REDUCED_MOTION;
  }

  /**
   * Labels go on in order of importance (selected, emergencies, then nearest),
   * skipping any that would overlap one already shown. Overlaps are judged
   * as seen on screen, so they hold when the map is turned heading-up.
   */
  private drawLabels(): void {
    const { ctx, theme, snapshot } = this;
    const heading = this.heading();
    const rad = (heading * Math.PI) / 180;
    const w2 = this.canvas.clientWidth / 2;
    const h2 = this.canvas.clientHeight / 2;
    const center = snapshot!.center;
    const rank = (a: Aircraft) =>
      a.hex === this.selected ? -2 : isEmergency(a) ? -1 : distanceNm(center, a);
    const ordered = [...this.drawn].sort((p, q) => rank(p.a) - rank(q.a));

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = theme.name === 'dark' ? theme.bg : '#f1efea';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = theme.name === 'dark' ? 1 : 0;
    const placed: Rect[] = [];
    for (const { a, x, y, rgb } of ordered) {
      const lines = tagLines(a);
      let w = 0;
      for (const line of lines) {
        ctx.font = FONTS[line.kind];
        w = Math.max(w, ctx.measureText(line.text).width);
      }
      // Where the aircraft appears on screen once the map's turn is applied.
      const [sx, sy] = rotate(x - w2, y - h2, -heading);
      const rect = { x: sx + LABEL_DX, y: sy + LABEL_DY, w, h: lines.length * LABEL_LINE_H };
      const emergency = isEmergency(a);
      const forced = emergency || a.hex === this.selected;
      if (!forced && overlapsAny(rect, placed)) continue;
      placed.push(rect);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rad);
      ctx.globalAlpha = !forced && isMinor(a) ? MINOR_LABEL_ALPHA : 1;
      lines.forEach((line, i) => {
        ctx.font = FONTS[line.kind];
        ctx.fillStyle = emergency
          ? `rgb(${rgb})`
          : line.kind === 'ident'
            ? theme.text
            : line.kind === 'altitude'
              ? `rgb(${rgb})`
              : theme.muted;
        ctx.fillText(line.text, LABEL_DX, LABEL_DY + i * LABEL_LINE_H + 1.5);
      });
      ctx.restore();
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  /**
   * The selected flight's route: a faint solid great circle from the origin
   * to the aircraft and a dashed one on to the destination, with both airports.
   */
  private drawRoute(a: Aircraft, here: LatLon): void {
    const route = a.route;
    const from = route?.originPos;
    const to = route?.destinationPos;
    if (!route || !from || !to) return;
    const { ctx, theme } = this;
    const stroke = (points: LatLon[], dash: number[], alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.setLineDash(dash);
      ctx.beginPath();
      points.forEach((p, i) => {
        const { x, y } = this.point(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    ctx.save();
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1.5;
    stroke(greatCircle(from, here, ROUTE_STEP_NM), [], 0.35);
    stroke(greatCircle(here, to, ROUTE_STEP_NM), [6, 6], 0.7);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const heading = (this.heading() * Math.PI) / 180;
    ctx.font = FONTS.altitude;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const [pos, code] of [
      [from, route.origin],
      [to, route.destination],
    ] as const) {
      const { x, y } = this.point(pos);
      ctx.fillStyle = theme.bg;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);
      ctx.fillStyle = theme.text2;
      ctx.fillText(code, 8, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  private glow(rgb: string): HTMLCanvasElement {
    let sprite = this.glowSprites.get(rgb);
    if (sprite) return sprite;
    const size = Math.round(GLOW_RADIUS * 2 * this.dpr);
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const g = sprite.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb},0.45)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.glowSprites.set(rgb, sprite);
    return sprite;
  }
}

/** Turns (x, y) by `deg` clockwise on screen (y down), as CSS rotate() does. */
function rotate(x: number, y: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}
