import { describe, expect, it } from 'vitest';
import { generateYear } from '../../scripts/year-generator.js';

describe('генератор річного ряду', () => {
  const { records, planted, expectedHours } = generateYear({ stationId: 'KYIV-01', year: 2025 });

  it('покриває 8760 годин року (разом із годинами відключення)', () => {
    expect(expectedHours).toBe(8760);
    expect(records.length + planted.outage_hours).toBe(8760);
  });

  it('пропуски кожної речовини – від 5 до 15 %', () => {
    for (const p of ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co']) {
      const share = (planted.outage_hours + planted.gaps[p]) / expectedHours;
      expect(share).toBeGreaterThanOrEqual(0.05);
      expect(share).toBeLessThanOrEqual(0.15);
    }
  });

  it('містить некоректні значення і пікові епізоди', () => {
    expect(records.some(r => r.pm25 !== null && r.pm25 < 0)).toBe(true);
    expect(records.some(r => r.pm25 !== null && r.pm25 > 1000)).toBe(true);
    expect(Math.max(...records.map(r => r.pm10 ?? 0).filter(v => v < 1500))).toBeGreaterThan(150);
  });

  it('детермінований: повторний запуск дає той самий ряд', () => {
    const again = generateYear({ stationId: 'KYIV-01', year: 2025 });
    expect(again.records[1234]).toEqual(records[1234]);
  });
});
