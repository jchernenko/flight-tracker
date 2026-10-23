import type { Aircraft, LatLon } from '@flight/shared';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import { STALE_AFTER_MS } from '../aircraft/status';
import { alertRgb, altitudeRgb, type Theme } from '../../lib/theme';
import { deadReckon, offsetNm, positionAgeSec, ringStepNm, type Offset } from './geometry';
import { isEmergency, isMinor, placeTag, tagLines, type Rect, type TagLine } from './tags';
import { BORDER, LANDMARKS } from './landmarks';
import { trackHistory, trailPath } from './trails';

const FRAME_MS = 1000 / 30; // the tablet is slow; 30 fps is plenty for a scope
const SANS = 'Geist, system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const FONTS: Record<TagLine['kind'], string> = {
  ident: `600 12px ${SANS}`,
  altitude: `500 11px ${MONO}`,
  note: `500 11px ${MONO}`,
};
const TAG_LINE_H = 15;
const TAG_GAP = 10;
const GLOW_RADIUS = 16;
const HIT_RADIUS = 22;
const PULSE_MS = 1400;
const MINOR_TAG_ALPHA = 0.7;
const ACQUIRING_ARC_RAD = 0.7;
const ACQUIRING_SEC_PER_RAD = 0.9;
/** Turning the scope redraws the rings and landmarks, so ignore wobbles smaller than this. */
const HEADING_STEP_DEG = 0.5;
/** The slice of sky in front of you, shaded when the scope turns with the phone. */
const VIEW_CONE_DEG = 60;
const COMPASS_POINTS = [
  ['N', 0],
  ['E', 90],
  ['S', 180],
  ['W', 270],
] as const;

/** Everything that only changes with a new picture or theme is computed once, not per frame. */
type Track = {
  aircraft: Aircraft;
  lines: TagLine[];
  tagW: number;
  emergency: boolean;
  /** "r,g,b" of its altitude colour, or alert for an emergency. */
  rgb: string;
};

type Hit = { hex: string; x: number; y: number };

/**
 * Draws the scope on a canvas with its own animation loop. React hands it data
 * and settings; everything per-frame stays out of React.
 */
export class RadarRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly staticLayer = document.createElement('canvas');
  private readonly glowSprites = new Map<string, HTMLCanvasElement>();
  private readonly tracks = new Map<string, Track>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private snapshot: AircraftSnapshot | null = null;
  private theme: Theme;
  private alertRgb: string;
  private rangeNm: number;
  private selected: string | null = null;
  private stale = false;
  private acquiring = false;
  /** Bearing that points up the screen; null is the usual north-up scope. */
  private heading: number | null = null;
  private headingSin = 0;
  private headingCos = 1;
  /** Positions stop moving once the picture goes stale; this is the age they froze at. */
  private frozenElapsed: number | null = null;
  private hits: Hit[] = [];
  private raf = 0;
  private lastFrame = 0;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cx = 0;
  private cy = 0;
  private radiusPx = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    rangeNm: number,
    theme: Theme,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.rangeNm = rangeNm;
    this.theme = theme;
    this.alertRgb = alertRgb(theme);
    this.resize();
  }

  start(): void {
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      if (t - this.lastFrame < FRAME_MS) return;
      this.lastFrame = t;
      this.draw(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  setRange(rangeNm: number): void {
    this.rangeNm = rangeNm;
    this.buildStaticLayer();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.alertRgb = alertRgb(theme);
    this.glowSprites.clear();
    for (const track of this.tracks.values()) track.rgb = this.colorFor(track.aircraft);
    this.buildStaticLayer();
  }

  setSelected(hex: string | null): void {
    this.selected = hex;
  }

  /** Set by the page when the feed stops answering; the renderer also notices an old picture itself. */
  setStale(stale: boolean): void {
    this.stale = stale;
  }

  /** No picture yet: shows the rotating arc on the outer ring. */
  setAcquiring(acquiring: boolean): void {
    this.acquiring = acquiring;
  }

  /**
   * Turn the scope so `deg` (a bearing from true north) points up the screen,
   * for a phone held in the direction you're looking. Null is north-up.
   */
  setHeading(deg: number | null): void {
    const current = this.heading;
    if (
      deg === null
        ? current === null
        : current !== null && Math.abs(((deg - current + 540) % 360) - 180) < HEADING_STEP_DEG
    ) {
      return;
    }
    this.heading = deg;
    const rad = ((deg ?? 0) * Math.PI) / 180;
    this.headingSin = Math.sin(rad);
    this.headingCos = Math.cos(rad);
    this.buildStaticLayer();
  }

  /** Screen position of an east/north offset from the centre, turned for the heading. */
  private toScreen(o: Offset, scale = this.pxPerNm): { x: number; y: number } {
    const { headingSin: s, headingCos: c } = this;
    return {
      x: this.cx + (o.eastNm * c - o.northNm * s) * scale,
      y: this.cy - (o.eastNm * s + o.northNm * c) * scale,
    };
  }

  /** The aircraft drawn nearest to a point (CSS pixels on the canvas), if one is within reach. */
  hitTest(x: number, y: number): string | null {
    let best: Hit | null = null;
    let bestDist = HIT_RADIUS;
    for (const hit of this.hits) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d <= bestDist) {
        best = hit;
        bestDist = d;
      }
    }
    return best?.hex ?? null;
  }

  setSnapshot(next: AircraftSnapshot): void {
    // The API may answer from its cache with the same picture. Keep the first
    // receive time so dead-reckoning doesn't jump backwards.
    const centerChanged =
      this.snapshot?.center.lat !== next.center.lat ||
      this.snapshot?.center.lon !== next.center.lon;
    if (this.snapshot?.fetchedAt === next.fetchedAt) {
      // Same picture, but a phone in follow mode has moved: re-centre only.
      if (centerChanged) {
        this.snapshot = { ...this.snapshot, center: next.center };
        this.buildStaticLayer();
      }
      return;
    }
    this.snapshot = next;
    this.frozenElapsed = null;
    if (centerChanged) this.buildStaticLayer();

    const seen = new Set<string>();
    for (const a of next.aircraft) {
      seen.add(a.hex);
      let track = this.tracks.get(a.hex);
      if (!track) {
        track = { aircraft: a, lines: [], tagW: 0, emergency: false, rgb: '' };
        this.tracks.set(a.hex, track);
      }
      track.aircraft = a;
      track.emergency = isEmergency(a);
      track.rgb = this.colorFor(a);
      track.lines = tagLines(a);
      track.tagW = this.measureTag(track.lines);
    }
    for (const hex of this.tracks.keys()) if (!seen.has(hex)) this.tracks.delete(hex);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.radiusPx = Math.max(10, Math.min(this.width, this.height) / 2 - 48);

    // Fonts may have loaded since the tags were measured.
    for (const track of this.tracks.values()) track.tagW = this.measureTag(track.lines);
    this.glowSprites.clear();
    this.buildStaticLayer();
  }

  private colorFor(a: Aircraft): string {
    return isEmergency(a) ? this.alertRgb : altitudeRgb(this.theme, a.altitudeFt);
  }

  private measureTag(lines: TagLine[]): number {
    let w = 0;
    for (const line of lines) {
      this.ctx.font = FONTS[line.kind];
      w = Math.max(w, this.ctx.measureText(line.text).width);
    }
    return Math.ceil(w);
  }

  private get pxPerNm(): number {
    return this.radiusPx / this.rangeNm;
  }

  private buildStaticLayer(): void {
    const layer = this.staticLayer;
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const g = layer.getContext('2d');
    if (!g) return;
    const { cx, cy, radiusPx, theme } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    g.fillStyle = theme.bg;
    g.fillRect(0, 0, this.width, this.height);

    // Range rings: dotted inside, a solid outer edge.
    const step = ringStepNm(this.rangeNm);
    for (let nm = step; nm <= this.rangeNm + 0.001; nm += step) {
      const outer = nm + step > this.rangeNm + 0.001;
      g.strokeStyle = outer ? theme.ringOuter : theme.ring;
      g.lineWidth = 1;
      g.setLineDash(outer ? [] : [1, 5]);
      g.beginPath();
      g.arc(cx, cy, outer ? radiusPx : nm * this.pxPerNm, 0, Math.PI * 2);
      g.stroke();
    }
    g.setLineDash([]);

    g.font = `500 11px ${SANS}`;
    g.fillStyle = theme.dim;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const r = radiusPx + 16;
    for (const [label, bearing] of COMPASS_POINTS) {
      const { x, y } = this.toScreen(
        {
          eastNm: Math.sin((bearing * Math.PI) / 180),
          northNm: Math.cos((bearing * Math.PI) / 180),
        },
        r,
      );
      g.fillText(label, x, y);
    }

    if (this.heading !== null) this.drawViewCone(g);
    this.drawLandmarks(g);

    g.strokeStyle = theme.text;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, 5, 0, Math.PI * 2);
    g.stroke();

    // Heading-up: an arrowhead on your position, pointing the way you face.
    if (this.heading !== null) {
      g.fillStyle = theme.text;
      g.beginPath();
      g.moveTo(cx, cy - 17);
      g.lineTo(cx + 5.5, cy - 8);
      g.lineTo(cx - 5.5, cy - 8);
      g.closePath();
      g.fill();
    }
  }

  /** Heading-up: a faint wedge for what's in front of you, and the heading above the scope. */
  private drawViewCone(g: CanvasRenderingContext2D): void {
    const { cx, cy, radiusPx, theme } = this;
    const half = ((VIEW_CONE_DEG / 2) * Math.PI) / 180;
    const up = -Math.PI / 2;
    g.fillStyle = theme.text;
    g.globalAlpha = 0.05;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, radiusPx, up - half, up + half);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;

    // A caret on the outer ring marks straight ahead.
    g.fillStyle = theme.text;
    g.beginPath();
    g.moveTo(cx, cy - radiusPx + 1);
    g.lineTo(cx - 6, cy - radiusPx - 9);
    g.lineTo(cx + 6, cy - radiusPx - 9);
    g.closePath();
    g.fill();
  }

  /** Faint landmarks and the border, inside the scope only. */
  private drawLandmarks(g: CanvasRenderingContext2D): void {
    const center = this.snapshot?.center;
    if (!center) return;
    const { cx, cy, radiusPx, theme } = this;
    const scale = this.pxPerNm;
    const toXY = (p: LatLon) => this.toScreen(offsetNm(center, p), scale);

    g.save();
    g.beginPath();
    g.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    g.clip();

    g.strokeStyle = theme.landmark;
    g.lineWidth = 1;
    g.setLineDash([1, 4]);
    g.beginPath();
    BORDER.forEach((p, i) => {
      const { x, y } = toXY(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    g.setLineDash([]);

    g.font = `10px ${SANS}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const lm of LANDMARKS) {
      const { x, y } = toXY(lm);
      if (Math.hypot(x - cx, y - cy) > radiusPx) continue;
      g.strokeStyle = theme.landmark;
      g.fillStyle = theme.landmark;
      g.beginPath();
      if (lm.kind === 'airport') {
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.moveTo(x - 6, y);
        g.lineTo(x + 6, y);
        g.stroke();
      } else if (lm.kind === 'peak') {
        g.moveTo(x, y - 4);
        g.lineTo(x + 4, y + 3);
        g.lineTo(x - 4, y + 3);
        g.closePath();
        g.stroke();
      } else {
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      g.fillStyle = theme.landmarkLabel;
      g.fillText(lm.label, x + 8, y);
    }
    g.restore();
  }

  /** A soft round glow drawn once per colour and stamped under each blip (cheaper than shadowBlur). */
  private glow(rgb: string): HTMLCanvasElement {
    let sprite = this.glowSprites.get(rgb);
    if (sprite) return sprite;
    const size = Math.round(GLOW_RADIUS * 2 * this.dpr);
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const g = sprite.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb},0.35)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.glowSprites.set(rgb, sprite);
    return sprite;
  }

  private draw(t: number): void {
    const { ctx, cx, cy, radiusPx, theme } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const still = this.reducedMotion.matches;

    const snapshot = this.snapshot;
    if (!snapshot) {
      this.hits = [];
      if (this.acquiring) {
        const start = still ? -Math.PI / 2 : t / 1000 / ACQUIRING_SEC_PER_RAD;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx, start, start + ACQUIRING_ARC_RAD);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      return;
    }

    let elapsedMs = t - snapshot.receivedAt;
    const stale = this.stale || snapshot.stale || elapsedMs > STALE_AFTER_MS;
    if (stale) this.frozenElapsed ??= Math.min(elapsedMs, STALE_AFTER_MS);
    // Frozen positions stay put until a new picture arrives (setSnapshot clears
    // this), so they don't jump ahead when the same cached picture comes back.
    if (this.frozenElapsed !== null) elapsedMs = this.frozenElapsed;

    const scale = this.pxPerNm;
    const center = snapshot.center;
    const nowMs = Date.parse(snapshot.servedAt) + elapsedMs;
    const drawn: { track: Track; x: number; y: number }[] = [];

    // Trails first, clipped to the scope, so blips and tags sit on top of them.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const track of this.tracks.values()) {
      const a = track.aircraft;
      const pos = deadReckon(a, center, positionAgeSec(a, snapshot.servedAt, elapsedMs));
      // In range by reported position, like the list, so every blip has a row and can be selected.
      const reported = offsetNm(center, a);
      if (Math.hypot(reported.eastNm, reported.northNm) > this.rangeNm) continue;
      const { x, y } = this.toScreen(pos, scale);
      drawn.push({ track, x, y });
      this.drawTrail(track, pos, nowMs);
    }
    ctx.restore();

    this.hits = drawn.map(({ track, x, y }) => ({ hex: track.aircraft.hex, x, y }));

    for (const { track, x, y } of drawn) {
      const { rgb, emergency } = track;
      if (emergency) {
        const phase = still ? 0.3 : (t % PULSE_MS) / PULSE_MS;
        ctx.globalAlpha = 1 - phase;
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 8 + 22 * phase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (track.aircraft.military && !emergency) {
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.stroke();
      } else if (track.aircraft.kind === 'helicopter' && !emergency) {
        // Helicopters: a small cross.
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      } else if (isMinor(track.aircraft) && !emergency) {
        // Charter and private traffic: a hollow ring, like a VFR symbol on a real scope.
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const sprite = this.glow(rgb);
        ctx.drawImage(sprite, x - GLOW_RADIUS, y - GLOW_RADIUS, GLOW_RADIUS * 2, GLOW_RADIUS * 2);
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (track.aircraft.hex === this.selected) {
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const placed: Rect[] = [];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // Tags go on in order of importance, so when the scope is crowded the
    // selected aircraft, emergencies and the nearest traffic keep theirs.
    const rank = ({ track, x, y }: (typeof drawn)[number]) =>
      track.aircraft.hex === this.selected ? -2 : track.emergency ? -1 : Math.hypot(x - cx, y - cy);
    drawn.sort((a, b) => rank(a) - rank(b));
    for (const { track, x, y } of drawn) {
      const { lines, emergency, rgb } = track;
      const force = emergency || track.aircraft.hex === this.selected;
      const h = lines.length * TAG_LINE_H;
      const tag = placeTag(x, y, track.tagW, h, TAG_GAP, placed, force);
      if (!tag) continue;
      // Non-airline tags sit a step back, so the airliners read first.
      ctx.globalAlpha = !force && isMinor(track.aircraft) ? MINOR_TAG_ALPHA : 1;
      lines.forEach((line, i) => {
        ctx.font = FONTS[line.kind];
        ctx.fillStyle = emergency
          ? `rgb(${rgb})`
          : line.kind === 'ident'
            ? theme.text
            : line.kind === 'altitude'
              ? `rgb(${rgb})`
              : theme.muted;
        ctx.fillText(line.text, tag.x, tag.y + i * TAG_LINE_H + 1);
      });
    }
    ctx.globalAlpha = 1;

    if (stale) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }
  }

  /** A comet tail fading out behind the aircraft, curving through the turns it flew. */
  private drawTrail(track: Track, head: Offset, nowMs: number): void {
    const { ctx } = this;
    const a = track.aircraft;
    const center = this.snapshot!.center;
    const path = trailPath(a, head, center, trackHistory.fixesFor(a.hex), nowMs);
    if (path.length < 2) return;
    const scale = this.pxPerNm;
    const points = path.map((o) => this.toScreen(o, scale));
    const first = points[0]!;
    const tail = points[points.length - 1]!;

    const grad = ctx.createLinearGradient(first.x, first.y, tail.x, tail.y);
    grad.addColorStop(0, `rgba(${track.rgb},0.9)`);
    grad.addColorStop(1, `rgba(${track.rgb},0)`);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.stroke();
  }
}
