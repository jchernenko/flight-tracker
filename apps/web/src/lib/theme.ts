export type ThemeName = 'dark' | 'light';
export const THEME_NAMES: ThemeName[] = ['dark', 'light'];

type Oklch = { l: number; c: number; h: number };

export type Theme = {
  name: ThemeName;
  bg: string;
  panel: string;
  line: string;
  line2: string;
  text: string;
  text2: string;
  muted: string;
  dim: string;
  actBg: string;
  actFg: string;
  inFg: string;
  selBg: string;
  selRing: string;
  alert: string;
  alertT: string;
  ring: string;
  ringOuter: string;
  landmark: string;
  landmarkLabel: string;
  /** Lightness and chroma of the altitude colours; the hue comes from the altitude. */
  altitude: { l: number; c: number };
  alertOklch: Oklch;
};

const DARK_ALERT = { l: 0.7, c: 0.19, h: 25 };
const LIGHT_ALERT = { l: 0.56, c: 0.19, h: 25 };

export const THEMES: Record<ThemeName, Theme> = {
  dark: {
    name: 'dark',
    bg: '#0d0e12',
    panel: '#14161b',
    line: '#23262e',
    line2: '#1a1c22',
    text: '#f1f2f4',
    text2: '#c6c9cf',
    muted: '#9195a0',
    dim: '#636874',
    actBg: '#2a2d36',
    actFg: '#f1f2f4',
    inFg: '#9195a0',
    selBg: '#1c1f26',
    selRing: 'rgba(241,242,244,.22)',
    alert: 'oklch(0.70 0.19 25)',
    alertT: 'oklch(0.70 0.19 25 / .12)',
    ring: 'rgba(255,255,255,.07)',
    ringOuter: 'rgba(255,255,255,.16)',
    landmark: '#262a31',
    landmarkLabel: '#3b414b',
    altitude: { l: 0.78, c: 0.14 },
    alertOklch: DARK_ALERT,
  },
  light: {
    name: 'light',
    bg: '#f1efea',
    panel: '#fbfaf7',
    line: '#dcd9d2',
    line2: '#e7e4de',
    text: '#16171a',
    text2: '#3b3d42',
    muted: '#676a72',
    dim: '#8e9096',
    actBg: '#16171a',
    actFg: '#f1efea',
    inFg: '#676a72',
    selBg: '#f1efea',
    selRing: 'rgba(22,23,26,.18)',
    alert: 'oklch(0.56 0.19 25)',
    alertT: 'oklch(0.56 0.19 25 / .12)',
    ring: 'rgba(23,24,27,.09)',
    ringOuter: 'rgba(23,24,27,.22)',
    landmark: '#d3d0c8',
    landmarkLabel: '#a3a5aa',
    altitude: { l: 0.6, c: 0.15 },
    alertOklch: LIGHT_ALERT,
  },
};

const TOKENS = [
  'bg',
  'panel',
  'line',
  'line2',
  'text',
  'text2',
  'muted',
  'dim',
  'actBg',
  'actFg',
  'inFg',
  'selBg',
  'selRing',
  'alert',
  'alertT',
] as const;

/** Writes the theme's colours as CSS variables on <html> and updates the browser's theme colour. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const token of TOKENS) root.style.setProperty(`--t-${token}`, theme[token]);
  root.style.setProperty('--t-alt-l', String(theme.altitude.l));
  root.style.setProperty('--t-alt-c', String(theme.altitude.c));
  root.dataset.theme = theme.name;
  root.style.colorScheme = theme.name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
}

/** Amber at the ground, through green, teal and blue, to violet at 40,000 ft and above. */
export function altitudeHue(altitudeFt: number | null): number {
  const ft = Math.max(0, altitudeFt ?? 0);
  return 70 + Math.min(1, ft / 40_000) * 220;
}

/** CSS colour for an altitude, using the browser's own oklch(). */
export function altitudeCss(theme: Theme, altitudeFt: number | null, alpha = 1): string {
  const { l, c } = theme.altitude;
  const a = alpha === 1 ? '' : ` / ${alpha}`;
  return `oklch(${l} ${c} ${altitudeHue(altitudeFt).toFixed(1)}${a})`;
}

export type Rgb = [r: number, g: number, b: number];

/** OKLCH to gamma-encoded sRGB (0–255), via OKLab. Out-of-gamut channels are clipped. */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((x) => {
    const v = Math.min(1, Math.max(0, x));
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  }) as Rgb;
}

/** Canvas colour for an altitude as "r,g,b", ready for rgba(). Hues are rounded to 2° so glow sprites can be shared. */
export function altitudeRgb(theme: Theme, altitudeFt: number | null): string {
  const h = Math.round(altitudeHue(altitudeFt) / 2) * 2;
  return oklchToRgb({ ...theme.altitude, h }).join(',');
}

export const alertRgb = (theme: Theme): string => oklchToRgb(theme.alertOklch).join(',');

/**
 * CSS colour for an altitude that follows the current theme through the
 * --t-alt-* variables, so markup doesn't need to know which theme is on.
 */
export function altitudeVar(altitudeFt: number | null, alpha = 1): string {
  const a = alpha === 1 ? '' : ` / ${alpha}`;
  return `oklch(var(--t-alt-l) var(--t-alt-c) ${altitudeHue(altitudeFt).toFixed(1)}${a})`;
}
