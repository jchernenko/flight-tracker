import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import type { AircraftSnapshot } from '../aircraft/useAircraft';
import type { Theme } from '../../lib/theme';
import type { HeadingStore } from '../follow/useFollowMe';
import { MapAircraftLayer } from './aircraftLayer';

const NM_TO_M = 1852;
/** How often labels are turned upright again while the map turns heading-up. */
const LABEL_TURN_MS = 1000 / 15;

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

type Props = {
  snapshot: AircraftSnapshot | undefined;
  rangeNm: number;
  theme: Theme;
  selectedHex: string | null;
  stale: boolean;
  /** In follow mode, turns the map so the way the phone faces is up. */
  heading: HeadingStore | null;
  onSelect: (hex: string | null) => void;
};

/** Leaflet map view: gray street tiles, the home point, the range circle and live aircraft with comet trails. */
export function FlightMap({
  snapshot,
  rangeNm,
  theme,
  selectedHex,
  stale,
  heading,
  onSelect,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const rotorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer[]>([]);
  const rangeRef = useRef<L.Circle | null>(null);
  const homeRef = useRef<L.CircleMarker | null>(null);
  const facingRef = useRef<L.Marker | null>(null);
  const layerRef = useRef<MapAircraftLayer | null>(null);
  const themeRef = useRef(theme);
  const onSelectRef = useRef(onSelect);
  const headingRef = useRef(heading);
  themeRef.current = theme;
  onSelectRef.current = onSelect;
  headingRef.current = heading;

  // Create the map once the centre is known. In follow mode the centre moves with the phone.
  const center = snapshot?.center;
  const hasCenter = center !== undefined;
  const rotating = heading !== null;
  // Side of the turned square: the frame's diagonal, so turning never shows a corner.
  const [diagonal, setDiagonal] = useState(0);
  useEffect(() => {
    const outer = outerRef.current;
    if (!rotating || !outer) return;
    const observer = new ResizeObserver(() =>
      setDiagonal(Math.ceil(Math.hypot(outer.clientWidth, outer.clientHeight)) + 2),
    );
    observer.observe(outer);
    return () => observer.disconnect();
  }, [rotating]);
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
    mapRef.current = map;
    layerRef.current = new MapAircraftLayer(
      map,
      t,
      () => headingRef.current?.get() ?? 0,
      (hex) => onSelectRef.current(hex),
    );

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      map.remove();
      mapRef.current = null;
      rangeRef.current = null;
      homeRef.current = null;
      facingRef.current = null;
      tilesRef.current = [];
    };
    // Created once; the centre, range, theme and data go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCenter]);

  // Heading-up: the map is drawn on an oversized square so turning it never shows
  // a corner, and pans and zooms stay centred on you. The labels turn back upright in CSS.
  useEffect(() => {
    const map = mapRef.current;
    const el = rotorRef.current;
    if (!map || !el) return;
    map.invalidateSize({ animate: false });
    const zoomAround = rotating ? 'center' : true;
    Object.assign(map.options, {
      touchZoom: zoomAround,
      scrollWheelZoom: zoomAround,
      doubleClickZoom: zoomAround,
    });
    if (rotating) map.dragging.disable();
    else map.dragging.enable();
    // An arrowhead on your position, pointing the way you face (screen-up).
    if (rotating && !facingRef.current) {
      const at = homeRef.current?.getLatLng();
      if (at) {
        facingRef.current = L.marker(at, {
          icon: L.divIcon({ className: 'you-facing', html: '<div></div>', iconSize: [0, 0] }),
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }
    } else if (!rotating && facingRef.current) {
      facingRef.current.remove();
      facingRef.current = null;
    }
    if (!heading) {
      el.style.removeProperty('--map-heading');
      return;
    }
    // Labels on the canvas are turned back upright as it draws; a few times a second is enough.
    let pending = 0;
    const update = () => {
      el.style.setProperty('--map-heading', `${heading.get() ?? 0}deg`);
      pending ||= window.setTimeout(() => {
        pending = 0;
        layerRef.current?.redraw();
      }, LABEL_TURN_MS);
    };
    update();
    const unsubscribe = heading.subscribe(update);
    return () => {
      unsubscribe();
      window.clearTimeout(pending);
    };
  }, [heading, rotating, hasCenter, diagonal]);

  useEffect(() => {
    const map = mapRef.current;
    const circle = rangeRef.current;
    if (!map || !circle || !center) return;
    circle.setLatLng([center.lat, center.lon]);
    homeRef.current?.setLatLng([center.lat, center.lon]);
    facingRef.current?.setLatLng([center.lat, center.lon]);
    circle.setRadius(rangeNm * NM_TO_M);
    // Fit the range circle to what's visible, not to the oversized square when turned.
    const outer = outerRef.current;
    const inner = rotorRef.current;
    const pad =
      rotating && outer && inner
        ? Math.max(0, (inner.clientWidth - Math.min(outer.clientWidth, outer.clientHeight)) / 2)
        : 0;
    map.fitBounds(rangeBounds(center.lat, center.lon, rangeNm), {
      padding: [pad, pad],
      animate: false,
    });
  }, [rangeNm, center?.lat, center?.lon, rotating, hasCenter, diagonal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swap the tiles and recolour the overlays when the theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of tilesRef.current) layer.remove();
    tilesRef.current = tileLayers(theme).map((layer) => layer.addTo(map));
    homeRef.current?.setStyle({ color: theme.text });
    rangeRef.current?.setStyle({ color: theme.text });
    layerRef.current?.setTheme(theme);
  }, [theme, hasCenter]);

  // Only aircraft in range are drawn, like the radar and the list, so every one can be selected.
  useEffect(() => {
    if (snapshot) layerRef.current?.setSnapshot(snapshot, rangeNm);
  }, [snapshot, rangeNm, hasCenter]);

  useEffect(() => layerRef.current?.setSelected(selectedHex), [selectedHex, hasCenter]);
  useEffect(() => layerRef.current?.setStale(stale), [stale, hasCenter]);

  return (
    <div ref={outerRef} className="relative h-full w-full overflow-hidden">
      {/* Turned in follow mode. Leaflet owns the classes on its own container,
          so React never changes them; it turns this wrapper instead. */}
      <div
        ref={rotorRef}
        className={rotating ? 'flight-map-rotating' : 'h-full w-full'}
        style={rotating ? { width: diagonal, height: diagonal } : undefined}
      >
        <div ref={containerRef} className="flight-map h-full w-full" aria-label="Flight map" />
      </div>
      {rotating && (
        // Leaflet's own attribution sits in a corner of the turned square, out of view.
        <p className="map-attribution" dangerouslySetInnerHTML={{ __html: ATTRIBUTION }} />
      )}
    </div>
  );
}
