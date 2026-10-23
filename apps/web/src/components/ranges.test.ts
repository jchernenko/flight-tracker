import { describe, expect, it } from 'vitest';
import { nextRange, rangeFor } from './Headline';

describe('ranges', () => {
  it('goes out to 250 nm on the map only', () => {
    expect(nextRange(60, 'map')).toBe(120);
    expect(nextRange(250, 'map')).toBe(10);
    expect(nextRange(60, 'radar')).toBe(10);
    expect(rangeFor(250, 'radar')).toBe(60);
    expect(rangeFor(250, 'map')).toBe(250);
    expect(rangeFor(20, 'board')).toBe(20);
  });
});
