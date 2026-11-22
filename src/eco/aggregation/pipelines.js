// Пайплайни агрегацій MongoDB для частини А. Усі розрахунки статистики виконує база,
// а кожна формула береться з окремої функції (expressions.js, statistics.js, indices.js)
import { POLLUTANTS } from '../../config/constants.js';
import { HOUR_MS } from '../time.js';
import { UNITS } from '../units.js';
import { countIf, localDate, localDayStart, ratio, roundTo, usableValue } from './expressions.js';
import { aqiUaStages, izaTerm } from './indices.js';
import { countAbove, countOf, maxOf, median, minOf, percentile } from './statistics.js';

export const MAX8H_POLLUTANTS = ['co', 'o3'];
const digits = p => (p === 'co' ? 3 : 2);

// Порожній документ гарантує, що $group поверне рядок навіть без даних (тоді лічильники = 0)
const ensureOneGroup = { $unionWith: { pipeline: [{ $documents: [{ _empty: true }] }] } };
const realDoc = { $ne: ['$_empty', true] };

/* ---------- 1. Добові агрегати → daily_stats ---------- */

// Години групуються за місцевою добою Europe/Kyiv ($dateTrunc з timezone),
// 8-годинне ковзне середнє для CO і O₃ – $setWindowFields; результат записує $merge
export function dailyPipeline(code, from, to, { minHours, minWindowHours }) {
  const window = { range: [-7, 0], unit: 'hour' };
  const windowOutput = {};
  for (const p of MAX8H_POLLUTANTS) {
    windowOutput[`${p}_8h`] = { $avg: `$${p}`, window };
    windowOutput[`${p}_8h_n`] = { $sum: { $cond: [{ $isNumber: `$${p}` }, 1, 0] }, window };
  }

  const group = { _id: localDayStart('$measured_at') };
  for (const p of POLLUTANTS) {
    group[`${p}_mean`] = { $avg: `$${p}` }; // $avg пропускає null
    group[`${p}_max`] = { $max: `$${p}` };
    group[`${p}_hours`] = countIf({ $isNumber: `$${p}` });
  }
  for (const p of MAX8H_POLLUTANTS) {
    group[`${p}_max8h`] = { $max: { $cond: [{ $gte: [`$${p}_8h_n`, minWindowHours] }, `$${p}_8h`, null] } };
  }

  const complete = p => ({ $gte: [`$${p}_hours`, minHours] });
  const pollutants = Object.fromEntries(
    POLLUTANTS.map(p => [
      p,
      {
        mean: { $cond: [complete(p), `$${p}_mean`, null] }, // неповна доба – середнього немає
        mean_raw: `$${p}_mean`,
        max: `$${p}_max`,
        hours: `$${p}_hours`,
        complete: complete(p),
        max8h: MAX8H_POLLUTANTS.includes(p) ? `$${p}_max8h` : { $literal: null }
      }
    ])
  );

  return [
    // На 7 годин раніше: вікно першої години року захоплює кінець попередньої доби
    { $match: { station_id: code, measured_at: { $gte: new Date(from.getTime() - 7 * HOUR_MS), $lt: to } } },
    { $project: { _id: 0, measured_at: 1, ...Object.fromEntries(POLLUTANTS.map(p => [p, usableValue(p, from)])) } },
    { $setWindowFields: { sortBy: { measured_at: 1 }, output: windowOutput } },
    { $match: { measured_at: { $gte: from } } },
    { $group: group },
    {
      $project: {
        _id: 0,
        station_id: { $literal: code },
        date: localDate('$_id'),
        day_start: '$_id',
        pollutants,
        created_at: '$$NOW',
        updated_at: '$$NOW'
      }
    },
    { $merge: { into: 'daily_stats', on: ['station_id', 'date'], whenMatched: 'replace', whenNotMatched: 'insert' } }
  ];
}

// Скільки діб повних за кожною речовиною
export function dailySummaryPipeline(code, from, to) {
  const group = { _id: null, days: countIf(realDoc) };
  for (const p of POLLUTANTS) group[p] = countIf({ $eq: [`$pollutants.${p}.complete`, true] });
  return [{ $match: { station_id: code, day_start: { $gte: from, $lt: to } } }, ensureOneGroup, { $group: group }, { $project: { _id: 0 } }];
}

/* ---------- 2. Перевищення → alerts ---------- */

const alertFields = (code, p, period, norm, timeExpr, dateExpr) => ({
  _id: 0,
  station_id: { $literal: code },
  pollutant: { $literal: p },
  period: { $literal: period },
  norm_type: { $literal: norm.type },
  time: timeExpr,
  date: dateExpr,
  value: '$value',
  norm: { $literal: norm.value },
  ratio: ratio('$value', norm.value), // K = C / норматив
  unit: { $literal: UNITS[p] },
  source: { $literal: norm.source },
  created_at: '$$NOW'
});

const mergeAlerts = { $merge: { into: 'alerts', whenNotMatched: 'insert' } };

// Годинні значення понад ГДК м.р. або годинну граничну величину
export function hourlyAlertsPipeline(code, from, to, p, norm) {
  return [
    { $match: { station_id: code, measured_at: { $gte: from, $lt: to } } },
    { $project: { measured_at: 1, value: usableValue(p, from) } },
    { $match: { value: { $gt: norm.value } } },
    { $project: alertFields(code, p, 'hour', norm, '$measured_at', localDate('$measured_at')) },
    mergeAlerts
  ];
}

// Добові середні повних діб (або max8h для CO і O₃) понад ГДК с.д. / добову чи 8-годинну граничну величину
export function dailyAlertsPipeline(code, from, to, p, { valueField, period }, norm) {
  return [
    { $match: { station_id: code, day_start: { $gte: from, $lt: to } } },
    { $project: { day_start: 1, date: 1, value: `$pollutants.${p}.${valueField}` } },
    { $match: { value: { $gt: norm.value } } },
    { $project: alertFields(code, p, period, norm, '$day_start', '$date') },
    mergeAlerts
  ];
}

export function alertsSummaryPipeline(code, from, to) {
  return [
    { $match: { station_id: code, time: { $gte: from, $lt: to } } },
    { $group: { _id: { pollutant: '$pollutant', key: { $concat: ['$period', ':', '$norm_type'] } }, count: { $sum: 1 } } },
    { $sort: { '_id.pollutant': 1, '_id.key': 1 } }
  ];
}

/* ---------- 3. Річні показники ---------- */

// ctx: { expectedHours, minShare, norms: { p: { gdk, limits } }, k }

// З годинних значень: повнота, річне середнє (при ≥ 90 %), годинні граничні величини, річні величини, ІЗА
export function hourlyAnnualPipeline(code, from, to, ctx) {
  const group = { _id: null, records: countIf(realDoc) };
  for (const p of POLLUTANTS) {
    const v = `$${p}_v`;
    group[`${p}_n`] = countIf({ $isNumber: v });
    group[`${p}_mean`] = { $avg: v };
    group[`${p}_raw`] = countIf({ $isNumber: `$${p}` });
    group[`${p}_invalid`] = countIf({ $eq: [`$quality.${p}`, 'invalid'] });
    group[`${p}_suspect`] = countIf({ $eq: [`$quality.${p}`, 'suspect'] });
    ctx.norms[p].limits
      .filter(l => l.period === 'hour')
      .forEach((l, i) => (group[`${p}_hour_${i}`] = countIf({ $gt: [v, l.value] })));
  }

  // Повнота і річне середнє
  const completeness = {};
  for (const p of POLLUTANTS) {
    completeness[`${p}_coverage`] = { $divide: [`$${p}_n`, ctx.expectedHours] };
  }
  const annual = {};
  for (const p of POLLUTANTS) {
    annual[`${p}_complete`] = { $gte: [`$${p}_coverage`, ctx.minShare] };
    annual[`${p}_annual`] = { $cond: [{ $gte: [`$${p}_coverage`, ctx.minShare] }, `$${p}_mean`, null] };
  }

  const pollutants = {};
  const izaTerms = [];
  for (const p of POLLUTANTS) {
    const { gdk, limits } = ctx.norms[p];
    const mean = `$${p}_annual`;
    const d = digits(p);

    const compliance = [];
    limits
      .filter(l => l.period === 'hour')
      .forEach((l, i) =>
        compliance.push({
          period: { $literal: 'hour' },
          kind: { $literal: l.kind },
          source: { $literal: l.source },
          limit: { $literal: l.value },
          allowed: { $literal: l.allowed },
          count: `$${p}_hour_${i}`,
          ok: { $lte: [`$${p}_hour_${i}`, l.allowed] }
        })
      );
    limits
      .filter(l => l.period === 'year')
      .forEach(l =>
        compliance.push({
          period: { $literal: 'year' },
          kind: { $literal: l.kind },
          source: { $literal: l.source },
          limit: { $literal: l.value },
          value: roundTo(mean, d),
          ratio: roundTo(ratio(mean, l.value), 3),
          ok: { $cond: [{ $isNumber: mean }, { $lte: [mean, l.value] }, null] }
        })
      );

    pollutants[p] = {
      hourly: {
        records: `$${p}_raw`,
        valid: `$${p}_n`,
        invalid: `$${p}_invalid`,
        suspect: `$${p}_suspect`,
        expected_hours: { $literal: ctx.expectedHours },
        coverage: roundTo(`$${p}_coverage`, 4),
        complete: `$${p}_complete`
      },
      annual_mean: roundTo(mean, d),
      annual_mean_raw: roundTo(`$${p}_mean`, d),
      gdk_sd_ratio: roundTo(ratio(mean, gdk?.gdk_sd), 3),
      compliance
    };

    if (gdk?.gdk_sd && gdk.hazard_class) {
      const k = ctx.k[String(gdk.hazard_class)];
      izaTerms.push({
        pollutant: { $literal: p },
        mean: roundTo(mean, 4),
        gdk_sd: { $literal: gdk.gdk_sd },
        hazard_class: { $literal: gdk.hazard_class },
        k: { $literal: k },
        ratio: roundTo(ratio(mean, gdk.gdk_sd), 4),
        term: izaTerm(mean, gdk.gdk_sd, k)
      });
    }
  }

  return [
    { $match: { station_id: code, measured_at: { $gte: from, $lt: to } } },
    ensureOneGroup,
    { $addFields: Object.fromEntries(POLLUTANTS.map(p => [`${p}_v`, usableValue(p, from)])) },
    { $group: group },
    { $addFields: completeness },
    { $addFields: annual },
    { $project: { _id: 0, records: 1, pollutants, iza_all: izaTerms } },
    {
      // ІЗА = Σ (Cᵢ / ГДКс.д.ᵢ)^kᵢ лише за речовинами з повним річним рядом
      $addFields: {
        iza: {
          $let: {
            vars: { used: { $filter: { input: '$iza_all', as: 't', cond: { $ne: ['$$t.term', null] } } } },
            in: {
              value: { $cond: [{ $gt: [{ $size: '$$used' }, 0] }, { $round: [{ $sum: '$$used.term' }, 2] }, null] },
              terms: { $map: { input: '$$used', as: 't', in: { $mergeObjects: ['$$t', { term: { $round: ['$$t.term', 4] } }] } } },
              excluded: { $map: { input: { $filter: { input: '$iza_all', as: 't', cond: { $eq: ['$$t.term', null] } } }, as: 't', in: '$$t.pollutant' } }
            }
          }
        }
      }
    },
    { $project: { iza_all: 0 } }
  ];
}

// З добових агрегатів: медіана, мін, макс, P90.4, P98, доби понад ГДК с.д., добові й 8-годинні граничні величини
export function dailyAnnualPipeline(code, from, to, ctx) {
  const group = { _id: null, days: countIf(realDoc) };
  for (const p of POLLUTANTS) {
    group[`${p}_means`] = { $push: `$pollutants.${p}.mean` }; // null для неповних діб, далі відкидається
    group[`${p}_max8h`] = { $push: `$pollutants.${p}.max8h` };
  }

  const pollutants = {};
  for (const p of POLLUTANTS) {
    const { gdk, limits } = ctx.norms[p];
    const means = `$${p}_means`;
    const max8h = `$${p}_max8h`;
    const d = digits(p);

    const compliance = [];
    for (const l of limits.filter(x => x.period === 'day' || x.period === 'max8h')) {
      const values = l.period === 'day' ? means : max8h;
      compliance.push({
        period: { $literal: l.period },
        kind: { $literal: l.kind },
        source: { $literal: l.source },
        limit: { $literal: l.value },
        allowed: { $literal: l.allowed },
        count: countAbove(values, l.value),
        ok: { $lte: [countAbove(values, l.value), l.allowed] }
      });
    }

    pollutants[p] = {
      daily: {
        complete_days: countOf(means),
        median: roundTo(median(means), d),
        min: roundTo(minOf(means), d),
        max: roundTo(maxOf(means), d),
        p90_4: roundTo(percentile(means, 90.4), d),
        p98: roundTo(percentile(means, 98), d),
        exceed_gdk_sd_days: countAbove(means, gdk?.gdk_sd)
      },
      max8h: MAX8H_POLLUTANTS.includes(p) ? { days: countOf(max8h), max: roundTo(maxOf(max8h), d) } : { $literal: null },
      compliance
    };
  }

  return [
    { $match: { station_id: code, day_start: { $gte: from, $lt: to } } },
    ensureOneGroup,
    { $group: group },
    { $project: { _id: 0, days: 1, pollutants } }
  ];
}

/* ---------- 4. Статистика годинних значень за період ---------- */

// Середнє, медіана, P98 рахує MongoDB ($median, $percentile – MongoDB 7.0+, метод approximate)
export function hourlyStatsPipeline(code, from, to) {
  const group = { _id: null, records: countIf(realDoc) };
  for (const p of POLLUTANTS) {
    group[`${p}_n`] = countIf({ $isNumber: `$${p}` });
    group[`${p}_mean`] = { $avg: `$${p}` };
    group[`${p}_min`] = { $min: `$${p}` };
    group[`${p}_max`] = { $max: `$${p}` };
    group[`${p}_median`] = { $median: { input: `$${p}`, method: 'approximate' } };
    group[`${p}_p98`] = { $percentile: { input: `$${p}`, p: [0.98], method: 'approximate' } };
  }
  const pollutants = Object.fromEntries(
    POLLUTANTS.map(p => [
      p,
      {
        unit: { $literal: UNITS[p] },
        n: `$${p}_n`,
        mean: roundTo(`$${p}_mean`, digits(p)),
        median: roundTo(`$${p}_median`, digits(p)),
        p98: roundTo({ $arrayElemAt: [`$${p}_p98`, 0] }, digits(p)),
        min: roundTo(`$${p}_min`, digits(p)),
        max: roundTo(`$${p}_max`, digits(p))
      }
    ])
  );
  return [
    { $match: { station_id: code, measured_at: { $gte: from, $lt: to } } },
    ensureOneGroup,
    { $project: { _empty: 1, ...Object.fromEntries(POLLUTANTS.map(p => [p, usableValue(p, from)])) } },
    { $group: group },
    { $project: { _id: 0, records: 1, pollutants } }
  ];
}

/* ---------- 5. Індекс № 590 на момент часу ---------- */

export function aqiAtPipeline(code, at, table) {
  const match = { station_id: code };
  if (at) match.measured_at = { $gt: new Date(at.getTime() - HOUR_MS), $lte: at };
  return [
    { $match: match },
    { $sort: { measured_at: -1 } },
    { $limit: 1 },
    { $addFields: { concentrations: Object.fromEntries(table.pollutants.map(p => [p, usableValue(p, at ?? new Date())])) } },
    ...aqiUaStages(table),
    { $project: { _id: 0, measured_at: 1, concentrations: 1, subindices: 1, level: 1, dominant: 1, category: 1, missing: 1, complete: 1 } }
  ];
}
