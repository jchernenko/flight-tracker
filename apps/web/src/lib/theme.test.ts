import { describe, expect, it } from 'vitest';
import { altitudeHue, oklchToRgb } from './theme';

describe('altitudeHue', () => {
  it('runs from amber on the ground to violet at 40,000 ft and above', () => {
    expect(altitudeHue(0)).toBe(70);
    expect(altitudeHue(null)).toBe(70);
    expect(altitudeHue(20_000)).toBe(180);
    expect(altitudeHue(40_000)).toBe(290);
    expect(altitudeHue(45_000)).toBe(290);
  });
});

describe('oklchToRgb', () => {
  it('matches known sRGB values', () => {
    expect(oklchToRgb({ l: 1, c: 0, h: 0 })).toEqual([255, 255, 255]);
    expect(oklchToRgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
    // Pure sRGB red is oklch(0.628 0.2577 29.23).
    const [r, g, b] = oklchToRgb({ l: 0.62796, c: 0.25768, h: 29.234 });
    expect(r).toBe(255);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(1);
  });
});
