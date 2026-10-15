import { readsbPayloadSchema, type ReadsbPayload } from './readsb-format.js';

const USER_AGENT = 'flight-tracker/2.0 (+https://github.com/jchernenko/flight-tracker)';

export async function fetchReadsbJson(url: string, timeoutMs: number): Promise<ReadsbPayload> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Feed responded ${response.status} for ${url}`);
  return readsbPayloadSchema.parse(await response.json());
}
