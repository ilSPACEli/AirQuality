import { POLLUTANTS } from '../config/constants.js';
import {
  MAX8H_POLLUTANTS,
  aqiAtPipeline,
  alertsSummaryPipeline,
  dailyAlertsPipeline,
  dailyAnnualPipeline,
  dailyPipeline,
  dailySummaryPipeline,
  hourlyAlertsPipeline,
  hourlyAnnualPipeline,
  hourlyStatsPipeline
} from '../eco/aggregation/pipelines.js';
import {
  getCompleteness,
  getGdk,
  getLimitValues,
  getQualityRule,
  izaCoefficients,
  loadNorms,
  normsVersion
} from '../eco/norms/index.js';
import { classifySeries, summarizeFlags } from '../eco/quality.js';
import { TIME_ZONE, hoursInYear, yearRange } from '../eco/time.js';
import { UNITS } from '../eco/units.js';
import { Alert } from '../models/Alert.js';
import { DailyStat } from '../models/DailyStat.js';
import { Measurement } from '../models/Measurement.js';
import { ApiError } from '../utils/ApiError.js';
import { assertStationExists, getStation } from './stationService.js';

/* ---------- 1. Очищення ---------- */

// Позначає кожне годинне значення valid / suspect / invalid і повертає кількість за речовинами.
// Значення не видаляються: на захисті треба показати, скільки відкинуто і чому
export async function cleanStationYear(code, year) {
  await assertStationExists(code);
  const { from, to } = yearRange(year);

  const docs = await Measurement.find(
    { station_id: code, measured_at: { $gte: from, $lt: to } },
    { measured_at: 1, ...Object.fromEntries(POLLUTANTS.map(p => [p, 1])) }
  )
    .sort({ measured_at: 1 })
    .lean();

  const flags = {};
  const summary = {};
  for (const p of POLLUTANTS) {
    const rule = getQualityRule(p, from);
    flags[p] = classifySeries(docs.map(d => d[p] ?? null), rule);
    summary[p] = { ...summarizeFlags(flags[p]), physical_max: rule.physical_max, unit: UNITS[p] };
  }

  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { quality: Object.fromEntries(POLLUTANTS.map(p => [p, flags[p][i]])) } }
    }
  }));
  for (let i = 0; i < ops.length; i += 2000) {
    await Measurement.bulkWrite(ops.slice(i, i + 2000), { ordered: false });
  }

  return { station_id: code, year, records: docs.length, expected_hours: hoursInYear(year), summary };
}

/* ---------- 2. Добові агрегати (MongoDB → daily_stats) ---------- */

export async function aggregateDaily(code, year) {
  await assertStationExists(code);
  const { from, to } = yearRange(year);
  const minHours = getCompleteness('day', from).min_hours;
  const minWindowHours = getCompleteness('max8h', from).min_hours;

  // $merge потребує унікального індексу (station_id, date): чекаємо, поки Mongoose його створить
  await DailyStat.init();
  await DailyStat.deleteMany({ station_id: code, day_start: { $gte: from, $lt: to } });
  await Measurement.aggregate(dailyPipeline(code, from, to, { minHours, minWindowHours }));

  const [summary] = await DailyStat.aggregate(dailySummaryPipeline(code, from, to));
  const { days, ...complete } = summary;
  return { days, complete_days: complete, min_hours: minHours };
}

/* ---------- 3. Перевищення нормативів (MongoDB → alerts) ---------- */

// Норматив порівнюється лише з величиною того самого періоду:
// ГДК м.р. і годинна гранична величина – з годинним значенням,
// ГДК с.д. і добова гранична – з добовим середнім повної доби, 8-годинна – з max8h
export async function buildAlerts(code, year) {
  const { from, to } = yearRange(year);
  await Alert.deleteMany({ station_id: code, time: { $gte: from, $lt: to } });

  const runs = [];
  for (const p of POLLUTANTS) {
    const gdk = getGdk(p, from);
    const limits = getLimitValues(p, from);
    const norm = (type, value, source) => ({ type, value, source });

    if (gdk?.gdk_mr) runs.push(Measurement.aggregate(hourlyAlertsPipeline(code, from, to, p, norm('gdk_mr', gdk.gdk_mr, gdk.source))));
    for (const l of limits.filter(x => x.period === 'hour')) {
      runs.push(Measurement.aggregate(hourlyAlertsPipeline(code, from, to, p, norm('limit', l.value, l.source))));
    }

    const daily = { valueField: 'mean', period: 'day' };
    if (gdk?.gdk_sd) runs.push(DailyStat.aggregate(dailyAlertsPipeline(code, from, to, p, daily, norm('gdk_sd', gdk.gdk_sd, gdk.source))));
    for (const l of limits.filter(x => x.period === 'day')) {
      runs.push(DailyStat.aggregate(dailyAlertsPipeline(code, from, to, p, daily, norm('limit', l.value, l.source))));
    }
    if (MAX8H_POLLUTANTS.includes(p)) {
      for (const l of limits.filter(x => x.period === 'max8h')) {
        runs.push(
          DailyStat.aggregate(dailyAlertsPipeline(code, from, to, p, { valueField: 'max8h', period: 'max8h' }, norm('limit', l.value, l.source)))
        );
      }
    }
  }
  await Promise.all(runs);

  const rows = await Alert.aggregate(alertsSummaryPipeline(code, from, to));
  const byPollutant = {};
  let total = 0;
  for (const { _id, count } of rows) {
    byPollutant[_id.pollutant] ??= {};
    byPollutant[_id.pollutant][_id.key] = count;
    total += count;
  }
  return { total, by_pollutant: byPollutant };
}

// Повна обробка року: очищення → добові агрегати → alerts
export async function processStationYear(code, year) {
  const cleaning = await cleanStationYear(code, year);
  const daily = await aggregateDaily(code, year);
  const alerts = await buildAlerts(code, year);
  return { station_id: code, year, cleaning, daily, alerts };
}

/* ---------- 4. Річні показники ---------- */

// Нормативи, на які спираються пайплайни (з довідників, на початок року)
function annualContext(year) {
  const { from, to } = yearRange(year);
  return {
    from,
    to,
    expectedHours: hoursInYear(year),
    minShare: getCompleteness('year', from).min_share,
    minHours: getCompleteness('day', from).min_hours,
    minWindowHours: getCompleteness('max8h', from).min_hours,
    k: izaCoefficients(),
    norms: Object.fromEntries(POLLUTANTS.map(p => [p, { gdk: getGdk(p, from), limits: getLimitValues(p, from) }]))
  };
}

const PERIOD_ORDER = ['hour', 'day', 'max8h', 'year'];

// Паспорт частини А: як і з чого пораховано річні показники
function annualPassport(code, year, ctx) {
  return {
    method: {
      cleaning: 'invalid – від’ємні значення і вище фізичної межі сенсора (quality.json), у розрахунки не входять; suspect – 6 однакових годин поспіль, входять',
      daily: 'MongoDB: $dateTrunc (Europe/Kyiv) → $avg; доба повна при ≥ 18 год із 24; для CO і O₃ – $setWindowFields, ковзне 8-годинне середнє (≥ 6 год із 8), максимум за добу',
      annual_mean: '$avg годинних значень; річний показник визначається, якщо придатних годин ≥ 90 %',
      percentiles: 'медіана, P90.4, P98, мін, макс – за добовими середніми повних діб; $sortArray + $arrayElemAt, метод найближчого рангу rank = ceil(p/100 · n)',
      exceedances: 'кількість діб із добовим середнім > ГДК с.д.; граничні величини Порядку 827 – кількість перевищень проти допустимої',
      iza: 'ІЗА = Σ (Cᵢ / ГДКс.д.ᵢ)^kᵢ за речовинами з повним річним рядом; k = 1,7; 1,3; 1,0; 0,9 для класів 1–4'
    },
    collections: { source: 'measurements', daily: 'daily_stats', alerts: 'alerts' },
    inputs: { station: code, year, from: ctx.from, to: ctx.to, time_zone: TIME_ZONE },
    completeness: {
      day_min_hours: ctx.minHours,
      max8h_min_hours: ctx.minWindowHours,
      year_min_share: ctx.minShare,
      source: getCompleteness('year', ctx.from).source
    },
    norms: Object.fromEntries(
      POLLUTANTS.map(p => [
        p,
        {
          unit: UNITS[p],
          gdk: ctx.norms[p].gdk,
          limits: ctx.norms[p].limits.map(({ period, value, allowed, kind, source, valid_from }) => ({ period, value, allowed, kind, source, valid_from }))
        }
      ])
    ),
    iza_k: ctx.k,
    norms_version: {
      gdk: normsVersion('gdk'),
      limit_values: normsVersion('limit-values'),
      completeness: normsVersion('completeness'),
      quality: normsVersion('quality')
    }
  };
}

export async function getAnnualIndicators(code, year) {
  const station = await getStation(code);
  const ctx = annualContext(year);

  const [[hourly], [daily]] = await Promise.all([
    Measurement.aggregate(hourlyAnnualPipeline(code, ctx.from, ctx.to, ctx)),
    DailyStat.aggregate(dailyAnnualPipeline(code, ctx.from, ctx.to, ctx))
  ]);

  // Обидва пайплайни вже порахували все; тут лише зводимо їх в одну відповідь
  const pollutants = {};
  for (const p of POLLUTANTS) {
    const gdk = ctx.norms[p].gdk;
    const h = hourly.pollutants[p];
    const d = daily.pollutants[p];
    pollutants[p] = {
      unit: UNITS[p],
      hourly: h.hourly,
      annual_mean: h.annual_mean,
      annual_mean_raw: h.annual_mean_raw,
      daily: d.daily,
      max8h: d.max8h,
      gdk: gdk && { gdk_mr: gdk.gdk_mr, gdk_sd: gdk.gdk_sd, hazard_class: gdk.hazard_class, source: gdk.source },
      gdk_sd_ratio: h.gdk_sd_ratio,
      compliance: [...h.compliance, ...d.compliance].sort((a, b) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period))
    };
  }

  const passport = annualPassport(code, year, ctx);
  return {
    station: {
      code: station.code,
      name: station.name,
      city: station.city,
      population: station.population ?? null,
      settlement_type: station.settlement_type ?? null
    },
    year,
    period: { from: ctx.from, to: ctx.to, time_zone: TIME_ZONE },
    records: hourly.records,
    days: daily.days,
    completeness_rule: { year_min_share: ctx.minShare, day_min_hours: ctx.minHours },
    pollutants,
    iza: { ...hourly.iza, formula: 'ІЗА = Σ (Cᵢ / ГДКс.д.ᵢ)^kᵢ, k = 1,7; 1,3; 1,0; 0,9 для класів 1–4' },
    norms_version: passport.norms_version,
    passport
  };
}

/* ---------- 5. Статистика за період ---------- */

export async function getHourlyStats(code, { from, to }) {
  await assertStationExists(code);
  const [row] = await Measurement.aggregate(hourlyStatsPipeline(code, from, to));
  return {
    station_id: code,
    period: 'hour',
    from,
    to,
    records: row.records,
    note: 'Медіана і P98 рахує MongoDB ($median, $percentile, метод approximate)',
    pollutants: row.pollutants
  };
}

// Добові агрегати з daily_stats разом із ГДК с.д. для лінії на графіку
export async function getDailyStats(code, { year, pollutant }) {
  await assertStationExists(code);
  const { from, to } = yearRange(year);
  const days = await DailyStat.find({ station_id: code, day_start: { $gte: from, $lt: to } })
    .sort({ day_start: 1 })
    .lean();

  const list = pollutant ? [pollutant] : POLLUTANTS;
  const norms = Object.fromEntries(
    list.map(p => {
      const gdk = getGdk(p, from);
      return [p, { unit: UNITS[p], gdk_sd: gdk?.gdk_sd ?? null, gdk_mr: gdk?.gdk_mr ?? null }];
    })
  );
  const data = days.map(d => ({
    date: d.date,
    day_start: d.day_start,
    pollutants: Object.fromEntries(list.map(p => [p, d.pollutants?.[p] ?? null]))
  }));
  return { station_id: code, period: 'day', year, norms, data };
}

/* ---------- 6. Індекс за наказом № 590 (MongoDB) ---------- */

export async function getAqiAt(code, at) {
  await assertStationExists(code);
  const table = loadNorms('aqi-ua');
  const [result] = await Measurement.aggregate(aqiAtPipeline(code, at, table));
  if (!result) {
    throw ApiError.notFound(
      at ? `Немає вимірювання станції ${code} за годину до ${at.toISOString()}` : `Немає вимірювань станції ${code}`
    );
  }
  return {
    station_id: code,
    ...result,
    categories: table.categories,
    source: table.source,
    norms_version: table.version,
    passport: {
      method: table.rule,
      averaging: table.averaging,
      unit: table.unit,
      usable: 'Значення invalid, від’ємні та вище фізичної межі сенсора не враховуються',
      upper_bounds: table.upper_bounds,
      source: table.source,
      valid_from: table.valid_from,
      norms_version: table.version
    }
  };
}

export async function listAlerts(code, { year, pollutant, limit = 100 }) {
  await assertStationExists(code);
  const filter = { station_id: code };
  if (year) {
    const { from, to } = yearRange(year);
    filter.time = { $gte: from, $lt: to };
  }
  if (pollutant) filter.pollutant = pollutant;
  const [data, total] = await Promise.all([
    Alert.find(filter).sort({ ratio: -1 }).limit(limit),
    Alert.countDocuments(filter)
  ]);
  return { data, meta: { total, limit } };
}
