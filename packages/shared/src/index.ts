// Runtime-free entry: types, constants and helpers only, so the web bundle
// doesn't pull in Zod. Import schemas from '@flight/shared/schemas'.
export type { Route, Aircraft, AircraftKind, AircraftResponse, Health } from './schemas.js';

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Scope ranges the display cycles through, in nautical miles. */
export const RANGES_NM = [10, 20, 30, 60, 120, 250] as const;
/** The radar scope and the board stop here; only the map goes wider. */
export const SCOPE_MAX_RANGE_NM = 60;
export type RangeNm = (typeof RANGES_NM)[number];
export const DEFAULT_RANGE_NM: RangeNm = 30;

/** Squawk codes that mean hijack, radio failure and emergency. */
export const EMERGENCY_SQUAWKS = ['7500', '7600', '7700'] as const;
export * from './geo.js';
