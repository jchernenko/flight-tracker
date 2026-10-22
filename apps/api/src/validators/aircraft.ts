import { z } from 'zod';

const coordinate = (min: number, max: number) => z.coerce.number<string>().min(min).max(max);

/** `?lat=&lon=` centres the picture on a phone's position instead of home. Both or neither. */
export const aircraftQuerySchema = z
  .object({
    lat: coordinate(-90, 90).optional(),
    lon: coordinate(-180, 180).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lon === undefined), {
    message: 'lat and lon go together',
  });
