import { POLLUTANTS, STATION_CODE_RE } from '../config/constants.js';
import { z } from './zod.js';

export const stationParams = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(STATION_CODE_RE, { error: 'Код станції: 2–40 символів (A–Z, 0–9, "-", "_")' })
});

const year = z.coerce
  .number({ error: 'year: очікується рік числом' })
  .int({ error: 'year: очікується ціле число' })
  .min(2000, { error: 'year: не раніше 2000' })
  .max(2100, { error: 'year: не пізніше 2100' });

const pollutant = z.enum(POLLUTANTS, { error: `pollutant: одне з ${POLLUTANTS.join(', ')}` });

const isoDate = name =>
  z.coerce.date({ error: `${name}: очікується дата у форматі ISO 8601` });

export const yearQuery = z.object({ year });

export const dailyQuery = z.object({ year, pollutant: pollutant.optional() });

export const hourlyQuery = z
  .object({ from: isoDate('from'), to: isoDate('to') })
  .refine(q => q.from < q.to, { error: 'to має бути пізніше за from', path: ['to'] })
  .refine(q => q.to - q.from <= 367 * 24 * 3_600_000, { error: 'Період не довший за рік', path: ['to'] });

// /stats?period=hour&from&to | period=day&year | period=year&year
export const statsQuery = z.discriminatedUnion('period', [
  z.object({ period: z.literal('hour'), from: isoDate('from'), to: isoDate('to') }),
  z.object({ period: z.literal('day'), year, pollutant: pollutant.optional() }),
  z.object({ period: z.literal('year'), year })
], { error: 'period: одне з hour, day, year' });

export const aqiQuery = z.object({ at: isoDate('at').optional() });

export const alertsQuery = z.object({
  year: year.optional(),
  pollutant: pollutant.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100)
});
