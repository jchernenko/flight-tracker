import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import type { Aircraft } from '@flight/shared';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import { deadReckon, positionAgeSec, toLatLon } from '../radar/geometry';
import { isEmergency, tagLines } from '../radar/tags';

const NM_TO_M = 1852;
/** Markers move this often between polls; plenty for a map, cheap for the tablet. */
const TICK_MS = 1000;

/** Square bounds around the range circle. (Circle.getBounds needs a map view to exist first.) */
const rangeBounds = (lat: number, lon: number, rangeNm: number) =>
  L.latLng(lat, lon).toBounds(rangeNm * NM_TO_M * 2);

type Props = { snapshot: AircraftSnapshot | undefined; rangeNm: number };

// Callsigns and registrations come from the feed, so escape them before they go into HTML.
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function iconFor(a: Aircraft): L.DivIcon {
  const classes = ['ac'];
  if (isEmergency(a) || a.military) classes.push('ac-alert');
  else if (a.onGround) classes.push('ac-ground');
  const rotation = a.trackDeg ?? 0;
  const label = tagLines(a)
    .map((line, i) => (i === 0 ? `<b>${escapeHtml(line)}</b>` : escapeHtml(line)))
    .join('<br>');
  return L.divIcon({
    className: classes.join(' '),
    html: `<div class="ac-glyph" style="transform:rotate(${rotation}deg)">▲</div><div class="ac-label">${label}</div>`,
    iconSize: [0, 0],
  });
}

/** Leaflet map view: dark street tiles, the home point, the range circle and live aircraft. */
export function FlightMap({ snapshot, rangeNm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rangeRef = useRef<L.Circle | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; aircraft: Aircraft }>());
  const snapshotRef = useRef<AircraftSnapshot | undefined>(undefined);

  // Create the map once the home point is known.
  const center = snapshot?.center;
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !center || mapRef.current) return;
    const map = L.map(el, { zoomControl: false, attributionControl: true });
    // Esri's dark gray canvas needs no API key (CARTO now watermarks keyless requests).
    // Base and labels are separate layers; maxNativeZoom 16 is where its detail ends.
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
    L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 18,
      maxNativeZoom: 16,
      attribution:
        'Tiles &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 18,
      maxNativeZoom: 16,
    }).addTo(map);
    L.circleMarker([center.lat, center.lon], {
      radius: 5,
      color: '#ff9d00',
      weight: 2,
      fill: false,
    }).addTo(map);
    rangeRef.current = L.circle([center.lat, center.lon], {
      radius: rangeNm * NM_TO_M,
      color: '#ff9d00',
      weight: 1,
      opacity: 0.6,
      dashArray: '6 6',
      fill: false,
      interactive: false,
    }).addTo(map);
    map.fitBounds(rangeBounds(center.lat, center.lon, rangeNm));
    mapRef.current = map;

    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      rangeRef.current = null;
      markers.clear();
      snapshotRef.current = undefined;
    };
    // Created once per home point; range and data updates go through the effects below.
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

  // Sync markers with each new picture.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !snapshot) return;
    if (snapshotRef.current?.fetchedAt === snapshot.fetchedAt) return;
    snapshotRef.current = snapshot;

    const markers = markersRef.current;
    const seen = new Set<string>();
    for (const a of snapshot.aircraft) {
      seen.add(a.hex);
      const existing = markers.get(a.hex);
      if (existing) {
        existing.aircraft = a;
        existing.marker.setIcon(iconFor(a));
      } else {
        const marker = L.marker([a.lat, a.lon], { icon: iconFor(a), interactive: false }).addTo(
          map,
        );
        markers.set(a.hex, { marker, aircraft: a });
      }
    }
    for (const [hex, { marker }] of markers) {
      if (!seen.has(hex)) {
        marker.remove();
        markers.delete(hex);
      }
    }
  }, [snapshot, center?.lat, center?.lon]);

  // Dead-reckon markers between polls, like the radar does.
  useEffect(() => {
    const id = window.setInterval(() => {
      const snap = snapshotRef.current;
      if (!snap) return;
      const elapsed = performance.now() - snap.receivedAt;
      for (const { marker, aircraft } of markersRef.current.values()) {
        const pos = toLatLon(
          snap.center,
          deadReckon(aircraft, snap.center, positionAgeSec(aircraft, snap.servedAt, elapsed)),
        );
        marker.setLatLng([pos.lat, pos.lon]);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return <div ref={containerRef} className="flight-map h-full w-full" aria-label="Flight map" />;
}
