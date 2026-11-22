import { describe, expect, it } from 'vitest';
import { classifySeries, classifyValue, summarizeFlags } from '../../src/eco/quality.js';

const rule = { physical_max: 1000, stuck_hours: 6 };

describe('контроль якості', () => {
  it('від’ємні значення і значення вище фізичної межі – invalid', () => {
    expect(classifyValue(-0.1, rule)).toBe('invalid');
    expect(classifyValue(1000.1, rule)).toBe('invalid');
    expect(classifyValue(0, rule)).toBe('valid');
    expect(classifyValue(1000, rule)).toBe('valid');
    expect(classifyValue(null, rule)).toBeNull();
  });

  it('нечислові значення (NaN, нескінченність) – invalid', () => {
    expect(classifyValue(Number.NaN, rule)).toBe('invalid');
    expect(classifyValue(Number.POSITIVE_INFINITY, rule)).toBe('invalid');
  });

  it('6 однакових значень поспіль – suspect («залиплий» сенсор)', () => {
    const flags = classifySeries([1, 5, 5, 5, 5, 5, 5, 2], rule);
    expect(flags).toEqual(['valid', 'suspect', 'suspect', 'suspect', 'suspect', 'suspect', 'suspect', 'valid']);
  });

  it('5 однакових значень поспіль ще не підозрілі', () => {
    expect(classifySeries([5, 5, 5, 5, 5, 1], rule)).not.toContain('suspect');
  });

  it('підсумок рахує й відсутні значення', () => {
    expect(summarizeFlags(['valid', 'invalid', null, 'suspect'])).toEqual({ valid: 1, suspect: 1, invalid: 1, missing: 1 });
  });
});
