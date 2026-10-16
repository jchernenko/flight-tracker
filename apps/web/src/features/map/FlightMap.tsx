import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { distanceNm, type Aircraft } from '@flight/shared';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import { STALE_AFTER_MS } from '../aircraft/status';
import { alertRgb, altitudeHue, altitudeRgb, type Theme } from '../../lib/theme';
import { deadReckon, positionAgeSec, toLatLon } from '../radar/geometry';
import { isEmergency, tagLines } from '../radar/tags';
import { splitPath, trackHistory, trailPath } from '../radar/trails';

const NM_TO_M = 1852;
/** Markers move this often between polls; plenty for a map, cheap for the tablet. */
const TICK_MS = 1000;
/** Trails are drawn as this many runs, each fainter than the one before, to fade out. */
const TRAIL_SEGMENTS = 6;

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const ATTRIBUTION =
  'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Esri's canvas basemaps need no API key. Base and labels are separate layers; detail ends at zoom 16. */
function tileLayers(theme: Theme): L.TileLayer[] {
  const name = theme.name === 'dark' ? 'Dark' : 'Light';
  const options = { maxZoom: 18, maxNativeZoom: 16 };
  return [
    L.tileLayer(`${ESRI}/World_${name}_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      ...options,
      attribution: ATTRIBUTION,
    }),
    L.tileLayer(`${ESRI}/World_${name}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, options),
  ];
}

/** Square bounds around the range circle. (Circle.getBounds needs a map view to exist first.) */
const rangeBounds = (lat: number, lon: number, rangeNm: number) =>
  L.latLng(lat, lon).toBounds(rangeNm * NM_TO_M * 2);

// Callsigns and registrations come from the feed, so escape them before they go into HTML.
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function iconFor(a: Aircraft, selected: boolean): L.DivIcon {
  const classes = ['ac'];
  if (isEmergency(a)) classes.push('ac-alert');
  else if (a.military) classes.push('ac-mil');
  if (selected) classes.push('ac-selected');
  const hue = altitudeHue(a.onGround ? 0 : a.altitudeFt).toFixed(1);
  const lines = tagLines(a)
    .map((line) => {
      const text = escapeHtml(line.text);
      return line.kind === 'ident'
        ? `<b>${text}</b>`
        : `<span class="ac-${line.kind}">${text}</span>`;
    })
    .join('');
  return L.divIcon({
    className: classes.join(' '),
    html: `<div class="ac-hit" style="--h:${hue}"><div class="ac-dot"></div><div class="ac-label">${lines}</div></div>`,
    iconSize: [0, 0],
  });
}

type Entry = { marker: L.Marker; aircraft: Aircraft; trail: L.Polyline[] };

type Props = {
  snapshot: AircraftSnapshot | undefined;
  rangeNm: number;
  theme: Theme;
  selectedHex: string | null;
  stale: boolean;
  onSelect: (hex: string | null) => void;
};

/** Leaflet map view: gray street tiles, the home point, the range circle and live aircraft with comet trails. */
export function FlightMap({ snapshot, rangeNm, theme, selectedHex, stale, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer[]>([]);
  const rangeRef = useRef<L.Circle | null>(null);
  const homeRef = useRef<L.CircleMarker | null>(null);
  const entriesRef = useRef(new Map<string, Entry>());
  const snapshotRef = useRef<AircraftSnapshot | undefined>(undefined);
  const syncedRef = useRef<string | null>(null);
  const themeRef = useRef(theme);
  const selectedRef = useRef(selectedHex);
  const onSelectRef = useRef(onSelect);
  const staleRef = useRef(stale);
  const frozenElapsedRef = useRef<number | null>(null);
  themeRef.current = theme;
  onSelectRef.current = onSelect;
  staleRef.current = stale;

  // Create the map once the home point is known.
  const center = snapshot?.center;
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !center || mapRef.current) return;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      renderer: L.canvas(),
    });
    const t = themeRef.current;
    tilesRef.current = tileLayers(t).map((layer) => layer.addTo(map));
    homeRef.current = L.circleMarker([center.lat, center.lon], {
      radius: 5,
      color: t.text,
      weight: 2,
      fill: false,
      interactive: false,
    }).addTo(map);
    rangeRef.current = L.circle([center.lat, center.lon], {
      radius: rangeNm * NM_TO_M,
      color: t.text,
      weight: 1,
      opacity: 0.45,
      dashArray: '1 5',
      fill: false,
      interactive: false,
    }).addTo(map);
    map.fitBounds(rangeBounds(center.lat, center.lon, rangeNm));
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;

    const entries = entriesRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      rangeRef.current = null;
      homeRef.current = null;
      tilesRef.current = [];
      entries.clear();
      snapshotRef.current = undefined;
      syncedRef.current = null;
    };
    // Created once per home point; range, theme and data updates go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lon]);

  useEffect(() => {
    const map = mapRef.current;
    const circle = rangeRef.current;
    if (!map || !circle) return;
    const { lat, lng } = circle.getLatLng();
    circle.setRadius(rangeNm * NM_TO_M);
    map.fitBounds(rangeBounds(lat, lng, rangeNm));
  }, [rangeNm, center?.lat, center?.lon]);

  // Swap the tiles and recolour the overlays when the theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of tilesRef.current) layer.remove();
    tilesRef.current = tileLayers(theme).map((layer) => layer.addTo(map));
    homeRef.current?.setStyle({ color: theme.text });
    rangeRef.current?.setStyle({ color: theme.text });
    for (const { aircraft, trail } of entriesRef.current.values()) {
      const color = trailColor(theme, aircraft);
      for (const line of trail) line.setStyle({ color });
    }
  }, [theme, center?.lat, center?.lon]);

  // Sync markers with each new picture, and with the range: only aircraft in
  // range are shown, like the radar and the list, so every marker can be selected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !snapshot) return;
    const key = `${snapshot.fetchedAt}|${rangeNm}`;
    if (syncedRef.current === key) return;
    syncedRef.current = key;
    if (snapshotRef.current?.fetchedAt !== snapshot.fetchedAt) frozenElapsedRef.current = null;
    snapshotRef.current = snapshot;

    const entries = entriesRef.current;
    const seen = new Set<string>();
    for (const a of snapshot.aircraft) {
      if (distanceNm(snapshot.center, a) > rangeNm) continue;
      seen.add(a.hex);
      const icon = iconFor(a, a.hex === selectedRef.current);
      const color = trailColor(themeRef.current, a);
      const existing = entries.get(a.hex);
      if (existing) {
        existing.aircraft = a;
        existing.marker.setIcon(icon);
        for (const line of existing.trail) line.setStyle({ color });
      } else {
        const marker = L.marker([a.lat, a.lon], { icon, keyboard: false }).addTo(map);
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(selectedRef.current === a.hex ? null : a.hex);
        });
        const trail = Array.from({ length: TRAIL_SEGMENTS }, (_, i) =>
          L.polyline([], {
            color,
            weight: 2.5,
            lineCap: 'round',
            opacity: 0.85 * (1 - i / TRAIL_SEGMENTS),
            interactive: false,
          }).addTo(map),
        );
        entries.set(a.hex, { marker, aircraft: a, trail });
      }
    }
    for (const [hex, { marker, trail }] of entries) {
      if (!seen.has(hex)) {
        marker.remove();
        for (const line of trail) line.remove();
        entries.delete(hex);
      }
    }
    moveAll();
  }, [snapshot, rangeNm, center?.lat, center?.lon]);

  // Selection only changes the marker classes.
  useEffect(() => {
    const previous = selectedRef.current;
    selectedRef.current = selectedHex;
    for (const hex of [previous, selectedHex]) {
      const entry = hex ? entriesRef.current.get(hex) : undefined;
      if (entry) entry.marker.setIcon(iconFor(entry.aircraft, entry.aircraft.hex === selectedHex));
    }
  }, [selectedHex]);

  /** Dead-reckons markers and trails between polls, like the radar; frozen while stale. */
  function moveAll() {
    const snap = snapshotRef.current;
    if (!snap) return;
    let elapsed = performance.now() - snap.receivedAt;
    if (staleRef.current || snap.stale || elapsed > STALE_AFTER_MS) {
      frozenElapsedRef.current ??= Math.min(elapsed, STALE_AFTER_MS);
    }
    // Frozen until a new picture arrives, so markers don't jump ahead.
    if (frozenElapsedRef.current !== null) elapsed = frozenElapsedRef.current;
    const nowMs = Date.parse(snap.servedAt) + elapsed;
    for (const { marker, aircraft: a, trail } of entriesRef.current.values()) {
      const head = deadReckon(a, snap.center, positionAgeSec(a, snap.servedAt, elapsed));
      const pos = toLatLon(snap.center, head);
      marker.setLatLng([pos.lat, pos.lon]);

      // Through the positions it reported, so turns show, like the radar.
      const path = trailPath(a, head, snap.center, trackHistory.fixesFor(a.hex), nowMs);
      const runs = splitPath(path, TRAIL_SEGMENTS);
      trail.forEach((line, i) => {
        line.setLatLngs(
          (runs[i] ?? []).map((o) => {
            const p = toLatLon(snap.center, o);
            return [p.lat, p.lon] as [number, number];
          }),
        );
      });
    }
  }

  useEffect(() => {
    const id = window.setInterval(moveAll, TICK_MS);
    return () => window.clearInterval(id);
    // moveAll only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="flight-map h-full w-full" aria-label="Flight map" />;
}

const trailColor = (theme: Theme, a: Aircraft): string =>
  `rgb(${isEmergency(a) ? alertRgb(theme) : altitudeRgb(theme, a.onGround ? 0 : a.altitudeFt)})`;
