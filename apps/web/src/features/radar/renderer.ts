import type { Aircraft, LatLon } from '@flight/shared';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import { deadReckon, offsetNm, positionAgeSec, ringStepNm } from './geometry';
import { isEmergency, placeTag, tagLines, type Rect } from './tags';

const COLORS = {
  background: '#050505',
  ring: '#3a2600',
  ringOuter: '#5a3c00',
  ringLabel: '#7a5a20',
  compass: '#ff9d00',
  tick: '#7a5a20',
  blip: '#ffb000',
  tagPrimary: '#ffcc66',
  tagSecondary: '#a08350',
  ground: '#6b5328',
  alert: '#ff4d4d',
  sweep: '255, 157, 0',
};

const FRAME_MS = 1000 / 30; // the tablet is slow; 30 fps is plenty for a scope
const SWEEP_PERIOD_MS = 6000;
const SWEEP_TRAIL_RAD = 0.6;
const TRAIL_POINTS = 10;
const PREDICTOR_SEC = 60;
const FONT = '"Courier New", Courier, monospace';
/** Past this with no new picture, the contacts are dimmed so a dead feed doesn't look live. */
const STALE_AFTER_MS = 30_000;

/** Tag text is built once per update, not per frame. */
type Track = { aircraft: Aircraft; trail: LatLon[]; lines: string[]; maxLen: number };

/**
 * Draws the scope on a canvas with its own animation loop. React hands it data
 * and settings; everything per-frame stays out of React.
 */
export class RadarRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly staticLayer = document.createElement('canvas');
  private readonly glowSprites = new Map<string, HTMLCanvasElement>();
  private readonly tracks = new Map<string, Track>();
  private snapshot: AircraftSnapshot | null = null;
  private rangeNm: number;
  private raf = 0;
  private lastFrame = 0;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cx = 0;
  private cy = 0;
  private radiusPx = 0;
  private fontPx = 12;
  private charW = 7;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    rangeNm: number,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.rangeNm = rangeNm;
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

  setSnapshot(next: AircraftSnapshot): void {
    // The API may answer from its cache with the same picture. Keep the first
    // receive time so dead-reckoning doesn't jump backwards.
    if (this.snapshot?.fetchedAt === next.fetchedAt) return;
    this.snapshot = next;

    const seen = new Set<string>();
    for (const a of next.aircraft) {
      seen.add(a.hex);
      let track = this.tracks.get(a.hex);
      if (!track) {
        track = { aircraft: a, trail: [], lines: [], maxLen: 0 };
        this.tracks.set(a.hex, track);
      }
      track.aircraft = a;
      track.lines = tagLines(a);
      track.maxLen = Math.max(...track.lines.map((l) => l.length));
      const last = track.trail[track.trail.length - 1];
      if (!last || last.lat !== a.lat || last.lon !== a.lon) {
        track.trail.push({ lat: a.lat, lon: a.lon });
        if (track.trail.length > TRAIL_POINTS) track.trail.shift();
      }
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

    const minDim = Math.min(this.width, this.height);
    this.fontPx = Math.round(Math.min(18, Math.max(11, minDim / 48)));
    this.ctx.font = `${this.fontPx}px ${FONT}`;
    this.charW = this.ctx.measureText('M').width;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.radiusPx = minDim / 2 - this.fontPx * 2.4;

    this.glowSprites.clear();
    this.buildStaticLayer();
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
    const { cx, cy, radiusPx, fontPx } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    g.fillStyle = COLORS.background;
    g.fillRect(0, 0, this.width, this.height);

    // Range rings, labelled along the 045 bearing.
    const step = ringStepNm(this.rangeNm);
    g.font = `${Math.round(fontPx * 0.85)}px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let nm = step; nm <= this.rangeNm + 0.001; nm += step) {
      const r = nm * this.pxPerNm;
      const outer = nm + step > this.rangeNm + 0.001;
      g.strokeStyle = outer ? COLORS.ringOuter : COLORS.ring;
      g.lineWidth = outer ? 1.5 : 1;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = COLORS.ringLabel;
      g.fillText(`${nm}`, cx + r * Math.SQRT1_2 + 3, cy - r * Math.SQRT1_2 - 6);
    }

    // Compass ticks every 5°, longer every 10° and 30°, bearings every 30°.
    g.strokeStyle = COLORS.tick;
    g.lineWidth = 1;
    g.beginPath();
    for (let deg = 0; deg < 360; deg += 5) {
      const len = deg % 30 === 0 ? 12 : deg % 10 === 0 ? 7 : 4;
      const rad = (deg * Math.PI) / 180;
      const sin = Math.sin(rad);
      const cos = Math.cos(rad);
      g.moveTo(cx + sin * radiusPx, cy - cos * radiusPx);
      g.lineTo(cx + sin * (radiusPx - len), cy - cos * (radiusPx - len));
    }
    g.stroke();

    const cardinal: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    g.font = `bold ${fontPx}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      const r = radiusPx + fontPx * 1.2;
      g.fillStyle = cardinal[deg] ? COLORS.compass : COLORS.ringLabel;
      g.fillText(
        cardinal[deg] ?? String(deg).padStart(3, '0'),
        cx + Math.sin(rad) * r,
        cy - Math.cos(rad) * r,
      );
    }

    // Home marker.
    g.strokeStyle = COLORS.compass;
    g.beginPath();
    g.moveTo(cx - 7, cy);
    g.lineTo(cx + 7, cy);
    g.moveTo(cx, cy - 7);
    g.lineTo(cx, cy + 7);
    g.stroke();
  }

  /** A soft glow drawn once per color and stamped under each blip (cheaper than shadowBlur). */
  private glow(color: string): HTMLCanvasElement {
    let sprite = this.glowSprites.get(color);
    if (sprite) return sprite;
    const size = Math.round(this.fontPx * 2.4 * this.dpr);
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const g = sprite.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, color + '88');
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.glowSprites.set(color, sprite);
    return sprite;
  }

  private draw(t: number): void {
    const { ctx, cx, cy, radiusPx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Sweep: a bright leading edge fading clockwise-behind.
    const sweepBearing = ((t % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * Math.PI * 2;
    const leading = sweepBearing - Math.PI / 2;
    const grad = ctx.createConicGradient(leading - SWEEP_TRAIL_RAD, cx, cy);
    const edge = SWEEP_TRAIL_RAD / (Math.PI * 2);
    grad.addColorStop(0, `rgba(${COLORS.sweep}, 0)`);
    grad.addColorStop(edge, `rgba(${COLORS.sweep}, 0.2)`);
    grad.addColorStop(Math.min(1, edge + 0.0005), `rgba(${COLORS.sweep}, 0)`);
    grad.addColorStop(1, `rgba(${COLORS.sweep}, 0)`);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    const snapshot = this.snapshot;
    if (!snapshot) return;

    const scale = this.pxPerNm;
    const elapsedMs = t - snapshot.receivedAt;
    const center = snapshot.center;
    const lineH = this.fontPx * 1.15;
    const placed: Rect[] = [];
    const flashOn = Math.floor(t / 500) % 2 === 0;

    const fade = elapsedMs > STALE_AFTER_MS ? 0.35 : 1;
    const fontRegular = `${this.fontPx}px ${FONT}`;
    const fontBold = `bold ${fontRegular}`;

    for (const { aircraft: a, trail, lines, maxLen } of this.tracks.values()) {
      const pos = deadReckon(a, center, positionAgeSec(a, snapshot.servedAt, elapsedMs));
      if (Math.hypot(pos.eastNm, pos.northNm) > this.rangeNm) continue;
      const x = cx + pos.eastNm * scale;
      const y = cy - pos.northNm * scale;

      const emergency = isEmergency(a);
      const color =
        emergency || a.military ? COLORS.alert : a.onGround ? COLORS.ground : COLORS.blip;

      // Phosphor decay: brightest just after the sweep passes.
      const bearing = Math.atan2(pos.eastNm, pos.northNm);
      const since = (((sweepBearing - bearing) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const intensity = fade * (0.55 + 0.45 * (1 - since / (Math.PI * 2)) ** 3);

      // History trail: older dots fainter.
      ctx.fillStyle = color;
      for (let i = 0; i < trail.length - 1; i++) {
        const p = trail[i]!;
        const o = offsetNm(center, p);
        const ox = cx + o.eastNm * scale;
        const oy = cy - o.northNm * scale;
        if (Math.hypot(ox - cx, oy - cy) > radiusPx) continue;
        ctx.globalAlpha = 0.12 + 0.45 * (i / trail.length);
        ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
      }

      if (emergency && !flashOn) {
        ctx.globalAlpha = 1;
        continue;
      }

      // Predictor line: where it'll be in a minute.
      if (!a.onGround && a.groundSpeedKt !== null && a.trackDeg !== null) {
        const rad = (a.trackDeg * Math.PI) / 180;
        const len = (a.groundSpeedKt / 3600) * PREDICTOR_SEC * scale;
        ctx.globalAlpha = 0.6 * intensity;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(rad) * len, y - Math.cos(rad) * len);
        ctx.stroke();
      }

      const sprite = this.glow(color);
      const s = sprite.width / this.dpr;
      ctx.globalAlpha = intensity;
      ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = fade;
      ctx.fillStyle = color;
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);

      // Data tag with a leader line to its nearest corner.
      const w = maxLen * this.charW;
      const h = lines.length * lineH;
      const tag = placeTag(x, y, w, h, this.fontPx, placed);
      const anchorX = tag.x > x ? tag.x : tag.x + tag.w;
      const anchorY = tag.y > y ? tag.y : tag.y + tag.h;
      ctx.globalAlpha = 0.7 * fade;
      ctx.strokeStyle = COLORS.tagSecondary;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(anchorX, anchorY);
      ctx.stroke();
      ctx.globalAlpha = fade;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.font = i === 0 ? fontBold : fontRegular;
        ctx.fillStyle = emergency
          ? COLORS.alert
          : i === 0
            ? COLORS.tagPrimary
            : COLORS.tagSecondary;
        ctx.fillText(line, tag.x, tag.y + i * lineH);
      });
    }
    ctx.globalAlpha = 1;
  }
}
