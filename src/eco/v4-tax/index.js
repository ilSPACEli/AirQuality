// Варіант 4. Екологічний податок за квартал (ПКУ, розділ VIII, ст. 240–250).
// Чисті функції: на вході маси (т) і довідник ставок, на виході суми за позиціями.
// Гроші рахуються через decimal.js, округлення до 0,01 грн – один раз для кожної позиції
import Decimal from 'decimal.js';
import { loadNorms, pickRecord } from '../norms/index.js';

export const RATES_FILE = 'eco-tax-rates';
export const METHOD = 'ПКУ, ст. 249: п. 249.3 (викиди), п. 249.4 (скиди), п. 249.5 (розміщення відходів); ставки – ст. 243, 245, 246';

// Помилка вхідних даних із шляхом до поля: endpoint перетворює її на 422
export class TaxInputError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'TaxInputError';
    this.field = field;
  }
}

const money = value => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const fmt = value => money(value).toFixed(2);

// Перший день кварталу: ставка береться чинна на початок податкового періоду
export function quarterStart(year, quarter) {
  return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
}

function coefficient(code, date, rates) {
  const record = pickRecord(rates.coefficients, r => r.code === code, date);
  if (!record) throw new Error(`У довіднику немає коефіцієнта ${code}`);
  return record;
}

const rateRecord = (rates, predicate, date) => pickRecord(rates.records, predicate, date);

export function findAirRate(entry, date, rates, field = 'emissions') {
  if (entry.code) {
    const record = rateRecord(rates, r => r.direction === 'air' && r.code === entry.code, date);
    if (!record) throw new TaxInputError(`${field}.code`, `Невідома речовина «${entry.code}» для викидів`);
    return record;
  }
  if (entry.hazard_class) {
    const record = rateRecord(rates, r => r.direction === 'air' && r.basis === '243.2' && r.hazard_class === entry.hazard_class, date);
    if (!record) throw new TaxInputError(`${field}.hazard_class`, `Немає ставки для класу ${entry.hazard_class}`);
    return record;
  }
  if (entry.obrv_mg_m3 !== undefined && entry.obrv_mg_m3 !== null) {
    const x = entry.obrv_mg_m3;
    const bands = rates.records
      .filter(r => r.direction === 'air' && r.basis === '243.3')
      .sort((a, b) => (a.obrv_to_mg_m3 ?? Infinity) - (b.obrv_to_mg_m3 ?? Infinity));
    // «Менше ніж 0,0001» – строго; далі «до … включно»; останній – «понад 0,1»
    const band = bands.find((b, i) => b.obrv_to_mg_m3 === null || (i === 0 ? x < b.obrv_to_mg_m3 : x <= b.obrv_to_mg_m3));
    return rateRecord(rates, r => r.code === band.code, date);
  }
  throw new TaxInputError(field, 'Вкажіть code, hazard_class або obrv_mg_m3');
}

export function findWaterRate(entry, date, rates, field = 'discharges') {
  if (entry.code) {
    const record = rateRecord(rates, r => r.direction === 'water' && r.code === entry.code, date);
    if (!record) throw new TaxInputError(`${field}.code`, `Невідома речовина «${entry.code}» для скидів`);
    return record;
  }
  if (entry.gdk_mg_l !== undefined && entry.gdk_mg_l !== null) {
    const bands = rates.records
      .filter(r => r.direction === 'water' && r.basis === '245.2')
      .sort((a, b) => (a.gdk_to_mg_l ?? Infinity) - (b.gdk_to_mg_l ?? Infinity));
    const band = bands.find(b => b.gdk_to_mg_l === null || entry.gdk_mg_l <= b.gdk_to_mg_l);
    return rateRecord(rates, r => r.code === band.code, date);
  }
  throw new TaxInputError(field, 'Вкажіть code або gdk_mg_l');
}

export function findWasteRate(entry, date, rates, field = 'waste') {
  const record = rateRecord(rates, r => r.direction === 'waste' && r.hazard_class === entry.hazard_class, date);
  if (!record) throw new TaxInputError(`${field}.hazard_class`, `Немає ставки для класу відходів ${entry.hazard_class}`);
  return record;
}


export function emissionsTax(entries, { date, rates }) {
  const threshold = new Decimal(rates.co2_threshold_t_per_year.value);
  const rows = entries.map((entry, i) => {
    const rate = findAirRate(entry, date, rates, `emissions.${i}`);
    const mass = new Decimal(entry.mass_t);
    let tax = mass.mul(rate.rate_uah_per_t);
    let note = null;

    if (rate.code === 'CO2') {
      if (entry.annual_mass_t === undefined || entry.annual_mass_t === null) {
        throw new TaxInputError(`emissions.${i}.annual_mass_t`, 'Для CO2 потрібен річний обсяг викидів annual_mass_t');
      }
      if (new Decimal(entry.annual_mass_t).lte(threshold)) {
        tax = new Decimal(0);
        note = `Річний обсяг ${entry.annual_mass_t} т ≤ ${threshold} т: не оподатковується`;
      }
    }

    return {
      no: i + 1,
      code: rate.code,
      name: entry.name || rate.name,
      basis: `п. ${rate.basis}`,
      mass_t: mass.toString(),
      rate_uah_per_t: new Decimal(rate.rate_uah_per_t).toFixed(2),
      tax_uah: fmt(tax),
      formula: `${mass} × ${new Decimal(rate.rate_uah_per_t).toFixed(2)}`,
      note,
      source: rate.source,
      valid_from: rate.valid_from
    };
  });
  return { rows, total_uah: sumRows(rows) };
}


export function dischargesTax(entries, { date, rates }) {
  const pond = coefficient('K_POND', date, rates);
  const rows = entries.map((entry, i) => {
    const rate = findWaterRate(entry, date, rates, `discharges.${i}`);
    const mass = new Decimal(entry.mass_t);
    const kos = entry.receiver === 'pond_lake' ? new Decimal(pond.value) : new Decimal(1);
    const tax = mass.mul(rate.rate_uah_per_t).mul(kos);
    return {
      no: i + 1,
      code: rate.code,
      name: entry.name || rate.name,
      basis: `п. ${rate.basis}`,
      receiver: entry.receiver ?? 'river',
      mass_t: mass.toString(),
      rate_uah_per_t: new Decimal(rate.rate_uah_per_t).toFixed(2),
      k_os: kos.toString(),
      tax_uah: fmt(tax),
      formula: `${mass} × ${new Decimal(rate.rate_uah_per_t).toFixed(2)} × ${kos}`,
      source: rate.source,
      valid_from: rate.valid_from
    };
  });
  return { rows, total_uah: sumRows(rows), coefficient_pond: pond };
}


export function wasteTax(entries, { date, rates }) {
  const kt3 = coefficient('KT_SETTLEMENT', date, rates);
  const ko3 = coefficient('KO_UNPROTECTED', date, rates);
  const rows = entries.map((entry, i) => {
    const rate = findWasteRate(entry, date, rates, `waste.${i}`);
    const mass = new Decimal(entry.mass_t);
    const kt = entry.within_settlement ? new Decimal(kt3.value) : new Decimal(1);
    const ko = entry.unprotected_dump ? new Decimal(ko3.value) : new Decimal(1);
    const tax = new Decimal(rate.rate_uah_per_t).mul(mass).mul(kt).mul(ko);
    return {
      no: i + 1,
      code: rate.code,
      name: entry.name || rate.name,
      hazard_class: entry.hazard_class,
      basis: `п. ${rate.basis}`,
      mass_t: mass.toString(),
      rate_uah_per_t: new Decimal(rate.rate_uah_per_t).toFixed(2),
      k_t: kt.toString(),
      k_o: ko.toString(),
      tax_uah: fmt(tax),
      formula: `${new Decimal(rate.rate_uah_per_t).toFixed(2)} × ${mass} × ${kt} × ${ko}`,
      source: rate.source,
      valid_from: rate.valid_from
    };
  });
  return { rows, total_uah: sumRows(rows), coefficients: { k_t: kt3, k_o: ko3 } };
}

const sumRows = rows => rows.reduce((acc, row) => acc.add(row.tax_uah), new Decimal(0)).toFixed(2);

/* ---------- Податок за квартал ---------- */

export function quarterTax(input, rates = loadNorms(RATES_FILE)) {
  const { year, quarter, emissions = [], discharges = [], waste = [] } = input;
  const date = quarterStart(year, quarter);

  const air = emissionsTax(emissions, { date, rates });
  const water = dischargesTax(discharges, { date, rates });
  const solid = wasteTax(waste, { date, rates });
  const total = new Decimal(air.total_uah).add(water.total_uah).add(solid.total_uah);

  return {
    period: { year, quarter, rates_date: date },
    enterprise: input.enterprise ?? null,
    appendix1_emissions: air,
    appendix2_discharges: water,
    appendix3_waste: solid,
    total_uah: total.toFixed(2),
    summary: [
      { direction: 'Викиди в атмосферне повітря (додаток 1)', tax_uah: air.total_uah },
      { direction: 'Скиди у водні об’єкти (додаток 2)', tax_uah: water.total_uah },
      { direction: 'Розміщення відходів (додаток 3)', tax_uah: solid.total_uah }
    ]
  };
}

export function taxPassport(input, result, rates = loadNorms(RATES_FILE)) {
  const used = new Map();
  for (const row of [
    ...result.appendix1_emissions.rows,
    ...result.appendix2_discharges.rows,
    ...result.appendix3_waste.rows
  ]) {
    used.set(row.code, { code: row.code, rate_uah_per_t: row.rate_uah_per_t, source: row.source, valid_from: row.valid_from });
  }
  return {
    method: METHOD,
    formulas: {
      emissions: 'Сп = Σ Mᵢ × Нпᵢ',
      discharges: 'Сс = Σ Mᵢ × Нпᵢ × Кос (Кос = 1,5 для ставків і озер, інакше 1)',
      waste: 'Срв = Σ Нпᵢ × Mᵢ × Кт × Ко (Кт = 3 у межах населеного пункту або ближче 3 км, Ко = 3 для звалищ без повного захисту)'
    },
    inputs: input,
    units: { mass: 'т', rate: 'грн/т', tax: 'грн' },
    rates_date: result.period.rates_date,
    rates_used: [...used.values()],
    coefficients: rates.coefficients.map(({ code, value, source, valid_from }) => ({ code, value, source, valid_from })),
    co2_threshold: rates.co2_threshold_t_per_year,
    rounding: 'Кожна позиція округлюється до 0,01 грн (ROUND_HALF_UP) один раз, підсумки – сума округлених позицій',
    norms_version: rates.version
  };
}
