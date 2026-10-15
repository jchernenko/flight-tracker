import type { Env } from '../../config/env.js';
import type { FeedProvider } from './types.js';
import { createPointApiProvider } from './point-api.js';
import { createReadsbProvider } from './readsb.js';
import { createDemoProvider } from './demo.js';

export type { FeedProvider } from './types.js';

export function createFeedProvider(env: Pick<Env, 'FEED_PROVIDER' | 'FEED_URL'>): FeedProvider {
  switch (env.FEED_PROVIDER) {
    case 'adsblol':
      return createPointApiProvider('adsblol', env.FEED_URL ?? 'https://api.adsb.lol');
    case 'airplaneslive':
      return createPointApiProvider('airplaneslive', env.FEED_URL ?? 'https://api.airplanes.live');
    case 'readsb':
      return createReadsbProvider(env.FEED_URL ?? 'http://localhost:8080/data/aircraft.json');
    case 'demo':
      return createDemoProvider();
  }
}
