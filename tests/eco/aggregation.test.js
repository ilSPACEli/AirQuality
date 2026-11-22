import { describe, expect, it } from 'vitest';
import { ratio, usableValue } from '../../src/eco/aggregation/expressions.js';
import { bandLevel, izaTerm } from '../../src/eco/aggregation/indices.js';
import { dailyAlertsPipeline, dailyPipeline, hourlyAlertsPipeline } from '../../src/eco/aggregation/pipelines.js';
import { countAbove, percentile } from '../../src/eco/aggregation/statistics.js';
import { yearRange } from '../../src/eco/time.js';

// Функції-побудовники повертають вирази MongoDB; результат обчислень перевіряє tests/eco-api.test.js
describe('побудовники виразів агрегацій', () => {
  it('кратність без нормативу не визначається', () => {
    expect(ratio('$value', null)).toEqual({ $literal: null });
    expect(ratio('$value', 200)).toEqual({ $cond: [{ $isNumber: '$value' }, { $divide: ['$value', 200] }, null] });
  });

  it('придатне значення: число, не invalid, у межах сенсора', () => {
    const expr = usableValue('pm25');
    const checks = expr.$cond[0].$and;
    expect(checks).toContainEqual({ $ne: ['$quality.pm25', 'invalid'] });
    expect(checks).toContainEqual({ $lte: ['$pm25', 1000] });
  });

  it('категорія № 590: межа «≤ 5 після округлення» = «< 5,5»', () => {
    const expr = bandLevel('$c', [5, 15, 50, 90, 140]);
    const branches = expr.$cond[1].$switch.branches;
    expect(branches[0]).toEqual({ case: { $lt: ['$c', 5.5] }, then: 1 });
    expect(branches).toHaveLength(5);
    expect(expr.$cond[1].$switch.default).toBe(6);
  });

  it('перцентиль рахує ранг як ceil(p/100 · n)', () => {
    const json = JSON.stringify(percentile('$x', 90.4));
    expect(json).toContain('"$ceil"');
    expect(json).toContain('0.904');
  });

  it('поріг відсутній – кількість перевищень не визначається', () => {
    expect(countAbove('$x', null)).toEqual({ $literal: null });
    expect(izaTerm('$m', null, 1)).toEqual({ $literal: null });
  });

  it('добові агрегати: місцева доба Europe/Kyiv і запис у daily_stats через $merge', () => {
    const { from, to } = yearRange(2025);
    const pipeline = dailyPipeline('KYIV-01', from, to, { minHours: 18, minWindowHours: 6 });
    expect(JSON.stringify(pipeline)).toContain('"timezone":"Europe/Kyiv"');
    expect(pipeline.at(-1).$merge).toMatchObject({ into: 'daily_stats', on: ['station_id', 'date'] });
  });

  it('перевищення записуються в alerts через $merge', () => {
    const { from, to } = yearRange(2025);
    const norm = { type: 'gdk_mr', value: 200, source: 'тест' };
    const hourly = hourlyAlertsPipeline('KYIV-01', from, to, 'no2', norm);
    expect(hourly).toContainEqual({ $match: { value: { $gt: 200 } } });
    expect(hourly.at(-1).$merge.into).toBe('alerts');
    const daily = dailyAlertsPipeline('KYIV-01', from, to, 'pm10', { valueField: 'mean', period: 'day' }, norm);
    expect(daily[1].$project.value).toBe('$pollutants.pm10.mean');
  });
});
