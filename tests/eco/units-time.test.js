import { describe, expect, it } from 'vitest';
import { HOUR_MS, kyivDateKey, kyivMidnight, yearRange } from '../../src/eco/time.js';
import { MOLAR_MASS, ppbToUgm3, toWorkingUnit, ugm3ToPpb } from '../../src/eco/units.js';

describe('одиниці', () => {
  it('ppb ↔ мкг/м³ через молярну масу і 24,45 л/моль', () => {
    // NO2: 100 ppb · 46,0055 / 24,45 = 188,16 мкг/м³
    expect(ppbToUgm3(100, MOLAR_MASS.no2)).toBeCloseTo(188.16, 2);
    expect(ugm3ToPpb(188.16, MOLAR_MASS.no2)).toBeCloseTo(100, 2);
  });

  it('CO зберігається в мг/м³', () => {
    expect(toWorkingUnit('co', 1500, 'ugm3')).toBe(1.5);
    expect(toWorkingUnit('no2', 0.04, 'mgm3')).toBe(40);
  });
});

describe('доба за Europe/Kyiv', () => {
  it('рік починається о 22:00 UTC попереднього дня (UTC+2 узимку)', () => {
    const { from, to } = yearRange(2025);
    expect(from.toISOString()).toBe('2024-12-31T22:00:00.000Z');
    expect((to - from) / HOUR_MS).toBe(8760);
  });

  it('у день переходу на літній час 23 години, на зимовий – 25', () => {
    expect((kyivMidnight(2025, 3, 31) - kyivMidnight(2025, 3, 30)) / HOUR_MS).toBe(23);
    expect((kyivMidnight(2025, 10, 27) - kyivMidnight(2025, 10, 26)) / HOUR_MS).toBe(25);
  });

  it('межа року: 21:59 UTC 31.12 – ще 2024, 22:00 UTC – уже 1 січня 2025', () => {
    expect(kyivDateKey(new Date('2024-12-31T21:59:00Z'))).toBe('2024-12-31');
    expect(kyivDateKey(new Date('2024-12-31T22:00:00Z'))).toBe('2025-01-01');
  });

  it('22:30 UTC – це вже наступна місцева доба', () => {
    expect(kyivDateKey(new Date('2025-06-14T21:30:00Z'))).toBe('2025-06-15');
  });
});
