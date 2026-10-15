import type { LatLon } from '@flight/shared';

export type Landmark = LatLon & {
  label: string;
  kind: 'airport' | 'city' | 'peak';
};

// A minimal ATC-style "video map" for the Fraser Valley. Coordinates are
// approximate (±0.01°), which is well under a pixel at these ranges.
export const LANDMARKS: Landmark[] = [
  { label: 'YVR', kind: 'airport', lat: 49.1939, lon: -123.1844 },
  { label: 'YPK', kind: 'airport', lat: 49.2161, lon: -122.71 },
  { label: 'YXX', kind: 'airport', lat: 49.0253, lon: -122.3608 },
  { label: 'YNJ', kind: 'airport', lat: 49.1008, lon: -122.6308 },
  { label: 'ZBB', kind: 'airport', lat: 49.0742, lon: -123.0075 },
  { label: 'BLI', kind: 'airport', lat: 48.7928, lon: -122.5375 },
  { label: 'YYJ', kind: 'airport', lat: 48.6469, lon: -123.4258 },
  { label: 'DOWNTOWN', kind: 'city', lat: 49.2827, lon: -123.1207 },
  { label: 'MISSION', kind: 'city', lat: 49.133, lon: -122.3089 },
  { label: 'GOLDEN EARS', kind: 'peak', lat: 49.4367, lon: -122.4597 },
  { label: 'MT BAKER', kind: 'peak', lat: 48.7768, lon: -121.8144 },
  { label: 'WHISTLER', kind: 'city', lat: 50.1163, lon: -122.9574 },
];

/** The Canada–US border here runs along 49°N, from Boundary Bay east past the scope. */
export const BORDER: LatLon[] = [
  { lat: 49.0, lon: -123.09 },
  { lat: 49.0, lon: -120.5 },
];
