import { hc } from 'hono/client';
import type { AppType } from '@flight/api';

export const api = hc<AppType>('/');
