import { describe, expect, it } from 'vitest';
import { HeadingStore } from './useFollowMe';

describe('HeadingStore', () => {
  it('turns compass readings into true bearings', () => {
    const store = new HeadingStore();
    store.setDeclination(15.5);
    store.pushMagnetic(350);
    expect(store.get()).toBeCloseTo(5.5);
  });

  it('prefers GPS direction of travel while moving, then falls back to the compass', () => {
    const store = new HeadingStore();
    store.pushMagnetic(225); // a car's metal body throwing the compass off
    store.setCourse(90);
    expect(store.get()).toBe(90);
    store.setCourse(null);
    expect(store.get()).toBe(225);
  });

  it('uses the course even with no compass at all', () => {
    const store = new HeadingStore();
    expect(store.get()).toBeNull();
    store.setCourse(270);
    expect(store.get()).toBe(270);
  });
});
