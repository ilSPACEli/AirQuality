import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadNorms } from '../src/eco/norms/index.js';
import { taxQuarterBody } from '../src/validators/taxSchema.js';
import {
  dischargesTax,
  emissionsTax,
  findAirRate,
  quarterStart,
  quarterTax,
  TaxInputError,
  wasteTax
} from '../src/eco/v4-tax/index.js';

const rates = loadNorms('eco-tax-rates');
const date = quarterStart(2026, 4);
const example = JSON.parse(readFileSync(new URL('../examples/v4-tax-input.json', import.meta.url), 'utf8'));

describe('В4. Ручний розрахунок: ТОВ «АСТОР ІНВЕСТ», оксиди азоту, IV квартал 2026', () => {
  // Вручну (див. README):
  //   маса за рік 0,847 т (табл. 15.4.1) → за квартал M = 0,847 / 4 = 0,21175 т
  //   ставка Нп = 2574,43 грн/т (ПКУ, п. 243.1)
  //   Сп = M × Нп = 0,21175 × 2574,43 = 545,1356 грн → 545,14 грн
  it('функція дає ті самі проміжні й кінцеве значення', () => {
    const rate = findAirRate({ code: 'NOX' }, date, rates);
    expect(rate.rate_uah_per_t).toBe('2574.43');
    const { rows, total_uah } = emissionsTax([{ code: 'NOX', mass_t: 0.847 / 4 }], { date, rates });
    expect(rows[0].mass_t).toBe('0.21175');
    expect(rows[0].tax_uah).toBe('545.14');
    expect(total_uah).toBe('545.14');
  });
});

describe('В4. Податок за квартал (ТОВ «АСТОР ІНВЕСТ»)', () => {
  const result = quarterTax(example);

  it('податок за позиціями викидів', () => {
    expect(result.appendix1_emissions.rows.map(r => r.tax_uah)).toEqual([
      '545.14', // оксиди азоту
      '11.74', // оксид вуглецю
      '22.40', // тверді частинки
      '0.26', // метан
      '0.22', // масло мінеральне
      '13.81', // N2O за ставкою I класу
      '0.00' // CO2: 165,22 т на рік ≤ 500 т
    ]);
  });

  it('підсумки за трьома напрямами', () => {
    expect(result.appendix1_emissions.total_uah).toBe('593.57');
    expect(result.appendix2_discharges.total_uah).toBe('0.00');
    expect(result.appendix3_waste.total_uah).toBe('0.00');
    expect(result.total_uah).toBe('593.57');
  });

  it('ставка береться на перший день кварталу', () => {
    expect(result.period.rates_date).toBe('2026-10-01');
  });
});

describe('В4. Граничні випадки', () => {
  it('нульова маса – нульовий податок', () => {
    const { rows } = emissionsTax([{ code: 'SO2', mass_t: 0 }], { date, rates });
    expect(rows[0].tax_uah).toBe('0.00');
  });

  it('невідома речовина – помилка з полем', () => {
    expect(() => emissionsTax([{ code: 'XYZ', mass_t: 1 }], { date, rates })).toThrow(TaxInputError);
  });

  it('CO2: річний обсяг до 500 т не оподатковується', () => {
    const { rows } = emissionsTax([{ code: 'CO2', mass_t: 120, annual_mass_t: 480 }], { date, rates });
    expect(rows[0].tax_uah).toBe('0.00');
    expect(rows[0].note).toMatch(/не оподатковується/);
  });

  it('CO2: понад 500 т на рік – 30 грн/т', () => {
    const { rows } = emissionsTax([{ code: 'CO2', mass_t: 19.43, annual_mass_t: 600 }], { date, rates });
    expect(rows[0].tax_uah).toBe('582.90');
  });

  it('речовина без коду – ставка за класом небезпечності (п. 243.2)', () => {
    const { rows } = emissionsTax([{ name: 'Ксилол', hazard_class: 'III', mass_t: 1 }], { date, rates });
    expect(rows[0].tax_uah).toBe('628.32');
  });

  it('ОБРВ рівно 0,0001 мг/м³ – другий діапазон (0,0001–0,001 включно)', () => {
    expect(findAirRate({ obrv_mg_m3: 0.0001 }, date, rates).rate_uah_per_t).toBe('66410.35');
    expect(findAirRate({ obrv_mg_m3: 0.00009 }, date, rates).rate_uah_per_t).toBe('775097.25');
    expect(findAirRate({ obrv_mg_m3: 0.5 }, date, rates).rate_uah_per_t).toBe('96.99');
  });

  it('скид у ставок або озеро – коефіцієнт 1,5', () => {
    const river = dischargesTax([{ code: 'NO3', mass_t: 1, receiver: 'river' }], { date, rates });
    const pond = dischargesTax([{ code: 'NO3', mass_t: 1, receiver: 'pond_lake' }], { date, rates });
    expect(river.rows[0].tax_uah).toBe('1108.56');
    expect(pond.rows[0].tax_uah).toBe('1662.84');
  });

  it('відходи в межах населеного пункту на незахищеному звалищі – Кт × Ко = 9', () => {
    const { rows } = wasteTax([{ hazard_class: 'IV', mass_t: 10, within_settlement: true, unprotected_dump: true }], { date, rates });
    expect(rows[0].tax_uah).toBe('495.00'); // 5,50 × 10 × 3 × 3
  });

  it('нова ставка з пізнішим valid_from діє лише з її дати', () => {
    const changed = {
      ...rates,
      records: [...rates.records, { direction: 'air', basis: '243.1', code: 'NOX', name: 'Азоту оксиди', rate_uah_per_t: '3000.00', valid_from: '2027-01-01' }]
    };
    expect(findAirRate({ code: 'NOX' }, '2026-10-01', changed).rate_uah_per_t).toBe('2574.43');
    expect(findAirRate({ code: 'NOX' }, '2027-01-01', changed).rate_uah_per_t).toBe('3000.00');
  });

  it('копійки не накопичують похибку: 0,1 + 0,2 т', () => {
    const { total_uah } = emissionsTax([{ code: 'CO', mass_t: 0.1 }, { code: 'CO', mass_t: 0.2 }], { date, rates });
    expect(total_uah).toBe('29.10'); // 9,70 + 19,40
  });
});

describe('В4. Граничні значення', () => {
  it('CO2: рівно 500 т на рік – ще не оподатковується, 500,001 т – уже так', () => {
    const at500 = emissionsTax([{ code: 'CO2', mass_t: 100, annual_mass_t: 500 }], { date, rates });
    const above = emissionsTax([{ code: 'CO2', mass_t: 100, annual_mass_t: 500.001 }], { date, rates });
    expect(at500.rows[0].tax_uah).toBe('0.00');
    expect(above.rows[0].tax_uah).toBe('3000.00');
  });

  it('округлення ROUND_HALF_UP: рівно пів копійки – завжди вгору', () => {
    // 0,0015 т CO2 × 30 грн/т = 0,045 → 0,05 (банківське округлення дало б 0,04)
    const half = emissionsTax([{ code: 'CO2', mass_t: 0.0015, annual_mass_t: 600 }], { date, rates });
    expect(half.rows[0].tax_uah).toBe('0.05');
    // 0,5 × 96,99 = 48,495 → 48,50
    expect(emissionsTax([{ code: 'CO', mass_t: 0.5 }], { date, rates }).rows[0].tax_uah).toBe('48.50');
  });

  it('дуже мала маса: 0,001 т × 96,99 = 0,09699 → 0,10 грн', () => {
    expect(emissionsTax([{ code: 'SOLIDS', mass_t: 0.001 }], { date, rates }).rows[0].tax_uah).toBe('0.10');
  });

  it('ГДК у воді на межі діапазону п. 245.2: 0,001 – «до 0,001 включно», 0,0011 – наступний', () => {
    const at = dischargesTax([{ gdk_mg_l: 0.001, mass_t: 1 }], { date, rates });
    const above = dischargesTax([{ gdk_mg_l: 0.0011, mass_t: 1 }], { date, rates });
    expect(at.rows[0].rate_uah_per_t).toBe('1349948.00');
    expect(above.rows[0].rate_uah_per_t).toBe('978777.84');
  });

  it('перший і останній квартал року', () => {
    expect(quarterStart(2026, 1)).toBe('2026-01-01');
    expect(quarterStart(2026, 4)).toBe('2026-10-01');
  });

  it('валідація: квартал 1 і 4 – так, 0 і 5 – ні; маса 0 – так, −0,001 – ні', () => {
    const body = (quarter, mass) => ({ enterprise: { name: 'Т' }, year: 2026, quarter, emissions: [{ code: 'NOX', mass_t: mass }] });
    expect(taxQuarterBody.safeParse(body(1, 0)).success).toBe(true);
    expect(taxQuarterBody.safeParse(body(4, 0)).success).toBe(true);
    expect(taxQuarterBody.safeParse(body(0, 1)).success).toBe(false);
    expect(taxQuarterBody.safeParse(body(5, 1)).success).toBe(false);
    expect(taxQuarterBody.safeParse(body(4, -0.001)).success).toBe(false);
  });

  it('порожня декларація (жодної позиції) не приймається', () => {
    const result = taxQuarterBody.safeParse({ enterprise: { name: 'Т' }, year: 2026, quarter: 4 });
    expect(result.success).toBe(false);
  });
});
