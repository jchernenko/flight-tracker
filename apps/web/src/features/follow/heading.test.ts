import { describe, expect, it } from 'vitest';
import { headingFromOrientation, smoothHeading } from './heading';

const close = (actual: number | null, expected: number) => {
  expect(actual).not.toBeNull();
  const diff = ((actual! - expected + 540) % 360) - 180;
  expect(Math.abs(diff)).toBeLessThan(0.01);
};

describe('headingFromOrientation', () => {
  it('reads the top edge of a phone lying flat (alpha counts anticlockwise)', () => {
    close(headingFromOrientation(0, 0, 0), 0);
    close(headingFromOrientation(90, 0, 0), 270);
    close(headingFromOrientation(270, 0, 0), 90);
  });

  it('agrees whether the phone is flat, tilted towards you or upright', () => {
    for (const beta of [0, 30, 60, 89, 90]) close(headingFromOrientation(300, beta, 0), 60);
  });

  it('ignores rolling the phone sideways while held upright', () => {
    close(headingFromOrientation(300, 90, 20), 60 - 20);
    // Rolled while flat, the top edge still points the same way.
    close(headingFromOrientation(300, 0, 20), 60);
  });

  it('turns with the screen in landscape', () => {
    // Turned anticlockwise, the screen's top is the phone's right edge.
    close(headingFromOrientation(0, 0, 0, 90), 90);
    close(headingFromOrientation(0, 0, 0, 270), 270);
  });
});

describe('smoothHeading', () => {
  it('takes the first reading as is', () => {
    expect(smoothHeading(null, 123)).toBe(123);
  });

  it('moves the short way round through north', () => {
    close(smoothHeading(350, 10, 0.5), 0);
    close(smoothHeading(10, 350, 0.5), 0);
  });
});
