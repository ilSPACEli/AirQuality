import { describe, expect, it } from 'vitest';
import { getCompleteness, getGdk, getLimitValues, pickRecord } from '../../src/eco/norms/index.js';

describe('довідники нормативів', () => {
  it('ГДК повертається в робочих одиницях (мкг/м³, CO – мг/м³)', () => {
    expect(getGdk('no2')).toMatchObject({ gdk_mr: 200, gdk_sd: 40, hazard_class: 2 });
    expect(getGdk('co')).toMatchObject({ gdk_mr: 5, gdk_sd: 3, hazard_class: 4 });
    expect(getGdk('pm10').gdk_mr).toBeNull(); // ГДК м.р. для ТЧ10 немає
  });

  it('граничні величини Порядку 827 з допустимою кількістю перевищень', () => {
    const pm10 = getLimitValues('pm10');
    expect(pm10.find(l => l.period === 'day')).toMatchObject({ value: 50, allowed: 35 });
    expect(pm10.find(l => l.period === 'year')).toMatchObject({ value: 40, allowed: 0 });
  });

  it('правила повноти: 18 з 24, 6 з 8, 90 % за рік', () => {
    expect(getCompleteness('day').min_hours).toBe(18);
    expect(getCompleteness('max8h').min_hours).toBe(6);
    expect(getCompleteness('year').min_share).toBe(0.9);
  });

  it('pickRecord бере запис, чинний на дату (valid_from)', () => {
    const records = [
      { id: 'old', valid_from: '2020-01-01' },
      { id: 'new', valid_from: '2026-01-01' }
    ];
    expect(pickRecord(records, () => true, '2025-12-31').id).toBe('old');
    expect(pickRecord(records, () => true, '2026-01-01').id).toBe('new');
    expect(pickRecord(records, () => true, '2019-01-01')).toBeNull();
  });
});
