import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { distanceNm, type LatLon } from '@flight/shared';
import { headingFromOrientation, normalizeDeg, smoothHeading } from './heading';

/** Smaller moves than this don't re-centre the display (about 50 m). */
const MOVE_THRESHOLD_NM = 0.03;
/** No compass reading this long after starting means the device has none we can use. */
const COMPASS_TIMEOUT_MS = 3000;

/**
 * The direction the phone faces, as a bearing from true north. Changes many
 * times a second, so it's a store the radar and map read directly instead of
 * React state that would re-render the page.
 */
export class HeadingStore {
  private value: number | null = null;
  private magnetic: number | null = null;
  private declination = 0;
  private listeners = new Set<() => void>();

  get = (): number | null => this.value;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A raw reading from magnetic north. */
  pushMagnetic(deg: number): void {
    this.magnetic = smoothHeading(this.magnetic, deg);
    this.emit();
  }

  /** Magnetic declination at the phone's position (east positive), from the world magnetic model. */
  setDeclination(deg: number): void {
    this.declination = deg;
    this.emit();
  }

  clear(): void {
    this.magnetic = null;
    this.emit();
  }

  private emit(): void {
    const next = this.magnetic === null ? null : normalizeDeg(this.magnetic + this.declination);
    if (next === this.value) return;
    this.value = next;
    for (const listener of this.listeners) listener();
  }
}

/** The heading rounded to whole degrees, for text that shouldn't re-render on every reading. */
export function useRoundedHeading(store: HeadingStore): number | null {
  return useSyncExternalStore(store.subscribe, () => {
    const h = store.get();
    return h === null ? null : Math.round(h) % 360;
  });
}

export type Compass = 'waiting' | 'ok' | 'unavailable' | 'denied';

export type Follow = {
  on: boolean;
  /** The phone's position; null until the first fix, or when location is blocked. */
  position: LatLon | null;
  locationError: 'denied' | 'unavailable' | null;
  compass: Compass;
  heading: HeadingStore;
  /** Must be called from a tap: iOS only asks for motion access from a user gesture. */
  start: () => void;
  stop: () => void;
};

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

const screenAngle = () => screen.orientation?.angle ?? 0;

/** "Follow me" mode: centre on the phone's GPS position and turn the display to face where it points. */
export function useFollowMe(): Follow {
  const [on, setOn] = useState(false);
  const [position, setPosition] = useState<LatLon | null>(null);
  const [locationError, setLocationError] = useState<Follow['locationError']>(null);
  const [compass, setCompass] = useState<Compass>('waiting');
  const [motionAllowed, setMotionAllowed] = useState<boolean | null>(null);
  const headingRef = useRef<HeadingStore | null>(null);
  headingRef.current ??= new HeadingStore();
  const heading = headingRef.current;

  const start = useCallback(() => {
    setOn(true);
    setCompass('waiting');
    setLocationError(null);
    const api = (window.DeviceOrientationEvent as PermissionApi | undefined)?.requestPermission;
    if (!api) {
      setMotionAllowed(true);
      return;
    }
    api()
      .then((result) => setMotionAllowed(result === 'granted'))
      .catch(() => setMotionAllowed(false));
  }, []);

  const stop = useCallback(() => {
    setOn(false);
    setPosition(null);
    setMotionAllowed(null);
    heading.clear();
  }, [heading]);

  // GPS.
  useEffect(() => {
    if (!on) return;
    if (!('geolocation' in navigator)) {
      setLocationError('unavailable');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lon: coords.longitude };
        setLocationError(null);
        setPosition((prev) => (prev && distanceNm(prev, next) < MOVE_THRESHOLD_NM ? prev : next));
      },
      (err) => setLocationError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);

  // Compasses point at magnetic north; the display wants true north (about 15° apart in BC).
  const declinationKey = position ? `${position.lat.toFixed(1)},${position.lon.toFixed(1)}` : null;
  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    // Loaded on demand: only phones in follow mode need the magnetic model.
    void import('geomagnetism').then(({ model }) => {
      if (cancelled) return;
      const field = model(new Date(), { allowOutOfBoundsModel: true });
      heading.setDeclination(field.point([position.lat, position.lon]).decl);
    });
    return () => {
      cancelled = true;
    };
    // Only worth recomputing when the phone has moved a fair way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declinationKey, heading]);

  // Compass.
  useEffect(() => {
    if (!on || motionAllowed === null) return;
    if (!motionAllowed) {
      setCompass('denied');
      return;
    }
    // Chrome on Android sends earth-relative readings as their own event; Safari adds webkitCompassHeading.
    const type =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    let got = false;
    const onReading = (e: Event) => {
      const o = e as OrientationEvent;
      let deg: number | null = null;
      if (typeof o.webkitCompassHeading === 'number' && o.webkitCompassHeading >= 0) {
        deg = o.webkitCompassHeading + screenAngle();
      } else if (o.absolute && o.alpha !== null && o.beta !== null && o.gamma !== null) {
        deg = headingFromOrientation(o.alpha, o.beta, o.gamma, screenAngle());
      }
      if (deg === null) return;
      if (!got) {
        got = true;
        setCompass('ok');
      }
      heading.pushMagnetic(normalizeDeg(deg));
    };
    window.addEventListener(type, onReading);
    const timer = window.setTimeout(() => {
      if (!got) setCompass('unavailable');
    }, COMPASS_TIMEOUT_MS);
    return () => {
      window.removeEventListener(type, onReading);
      window.clearTimeout(timer);
      heading.clear();
    };
  }, [on, motionAllowed, heading]);

  return { on, position, locationError, compass, heading, start, stop };
}
