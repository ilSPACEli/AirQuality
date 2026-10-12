import mongoose from 'mongoose';
import {
  MEASUREMENT_FIELDS,
  MEASUREMENT_SORT_FIELDS,
  PM25_LIMIT
} from '../config/constants.js';
import { Measurement } from '../models/Measurement.js';
import { Station } from '../models/Station.js';
import { ApiError } from '../utils/ApiError.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { assertStationExists, CITY_COLLATION } from './stationService.js';

const DEFAULT_SORT = '-measured_at';

// Відсутнє значення зберігається як null, а не 0
function toDocument({ station_id, measured_at, source = 'manual', ...values }) {
  const doc = { station_id, measured_at, source };
  for (const field of MEASUREMENT_FIELDS) doc[field] = values[field] ?? null;
  return doc;
}

function assertHasValues(doc) {
  if (MEASUREMENT_FIELDS.every(field => doc[field] === null)) {
    throw ApiError.unprocessable('Дані не пройшли валідацію', [
      {
        field: MEASUREMENT_FIELDS.join(', '),
        message: 'Потрібне хоча б одне значення показника'
      }
    ]);
  }
}

function duplicateError(doc) {
  return ApiError.conflict(
    `Вимірювання станції ${doc.station_id} за ${doc.measured_at.toISOString()} вже існує`
  );
}

function periodFilter({ from, to }) {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return range;
}

async function buildFilter({ station, city, pollutant, from, to }) {
  const filter = {};
  if (station) filter.station_id = station;
  if (city) {
    const codes = await Station.distinct('code', { city }).collation(CITY_COLLATION);
    filter.station_id = { $in: station ? codes.filter(code => code === station) : codes };
  }
  if (pollutant) filter[pollutant] = { $ne: null };

  const period = periodFilter({ from, to });
  if (period) filter.measured_at = period;
  return filter;
}

function parseSort(raw = DEFAULT_SORT) {
  const name = raw.replace(/^-/, '');
  const field = MEASUREMENT_SORT_FIELDS.includes(name) ? name : 'measured_at';
  const direction = raw.startsWith('-') ? -1 : 1;
  return { [field]: direction, _id: direction }; // _id робить порядок детермінованим
}

// Курсор: час останнього запису + його _id (кілька станцій можуть мати однаковий час)
const encodeCursor = doc => `${doc.measured_at.toISOString()}_${doc._id}`;

function cursorCondition(cursor) {
  const [time, id] = cursor.split('_');
  const measuredAt = new Date(time);
  if (!id) return { measured_at: { $lt: measuredAt } };
  return {
    $or: [
      { measured_at: { $lt: measuredAt } },
      { measured_at: measuredAt, _id: { $lt: new mongoose.Types.ObjectId(id) } }
    ]
  };
}

// Курсорна пагінація: швидкість не залежить від глибини, записи не дублюються
async function listAfterCursor(filter, after, limit) {
  const docs = await Measurement.find({ $and: [filter, cursorCondition(after)] })
    .sort({ measured_at: -1, _id: -1 })
    .limit(limit + 1);

  const data = docs.slice(0, limit);
  const hasMore = docs.length > limit;
  return { data, meta: { limit, next_cursor: hasMore ? encodeCursor(data.at(-1)) : null } };
}

export async function listMeasurements(params = {}) {
  const filter = await buildFilter(params);
  const paging = paginate(params);

  if (params.after) return listAfterCursor(filter, params.after, paging.limit);

  const sort = params.sort ?? DEFAULT_SORT;
  const [data, total] = await Promise.all([
    Measurement.find(filter).sort(parseSort(sort)).skip(paging.skip).limit(paging.limit),
    Measurement.countDocuments(filter)
  ]);

  const meta = pageMeta(total, paging.page, paging.limit);
  // З першої сторінки можна перейти на курсор, якщо порядок за замовчуванням
  if (sort === DEFAULT_SORT) {
    const hasMore = paging.skip + data.length < total;
    meta.next_cursor = hasMore ? encodeCursor(data.at(-1)) : null;
  }
  return { data, meta };
}

export async function getMeasurement(id) {
  const measurement = await Measurement.findById(id);
  if (!measurement) throw ApiError.notFound('Вимірювання не знайдено');
  return measurement;
}

export async function createMeasurement(input) {
  const doc = toDocument(input);
  assertHasValues(doc);
  await assertStationExists(doc.station_id);

  try {
    return await Measurement.create(doc);
  } catch (err) {
    if (err.code === 11000) throw duplicateError(doc);
    throw err;
  }
}

// PUT: повна заміна, показники, яких немає в запиті, стають null
export async function replaceMeasurement(id, input) {
  const measurement = await getMeasurement(id);
  const doc = toDocument({ ...input, source: measurement.source });
  assertHasValues(doc);
  await assertStationExists(doc.station_id);

  measurement.set(doc);
  try {
    return await measurement.save();
  } catch (err) {
    if (err.code === 11000) throw duplicateError(doc);
    throw err;
  }
}

// Ідемпотентне видалення: повтор не є помилкою
export async function deleteMeasurement(id) {
  await Measurement.findByIdAndDelete(id);
}

const round = value => (typeof value === 'number' ? Math.round(value * 100) / 100 : null);

// Агрегація виконується в базі, а не циклом у пам'яті Node
export async function getStationStatistics(code, { from, to } = {}) {
  await assertStationExists(code);

  const match = { station_id: code };
  const period = periodFilter({ from, to });
  if (period) match.measured_at = period;

  const group = {
    _id: null,
    count: { $sum: 1 },
    first: { $min: '$measured_at' },
    last: { $max: '$measured_at' },
    pm25_exceedances: { $sum: { $cond: [{ $gt: ['$pm25', PM25_LIMIT] }, 1, 0] } }
  };
  for (const field of MEASUREMENT_FIELDS) {
    group[`${field}_count`] = { $sum: { $cond: [{ $ne: [`$${field}`, null] }, 1, 0] } };
    group[`${field}_avg`] = { $avg: `$${field}` };
    group[`${field}_min`] = { $min: `$${field}` };
    group[`${field}_max`] = { $max: `$${field}` };
  }

  const [stats] = await Measurement.aggregate([{ $match: match }, { $group: group }]);

  const parameters = Object.fromEntries(
    MEASUREMENT_FIELDS.map(field => [
      field,
      {
        count: stats?.[`${field}_count`] ?? 0,
        avg: round(stats?.[`${field}_avg`]),
        min: round(stats?.[`${field}_min`]),
        max: round(stats?.[`${field}_max`])
      }
    ])
  );

  return {
    station_id: code,
    count: stats?.count ?? 0,
    period: { from: stats?.first ?? null, to: stats?.last ?? null },
    pm25_limit: PM25_LIMIT,
    pm25_exceedances: stats?.pm25_exceedances ?? 0,
    parameters
  };
}

// Пакетний upsert за природним ключем (станція + час) для скриптів seed та імпорту
export async function upsertMeasurements(records) {
  if (records.length === 0) return { upserted: 0, matched: 0 };

  const ops = records.map(record => {
    const { station_id, measured_at, ...fields } = toDocument(record);
    return {
      updateOne: {
        filter: { station_id, measured_at },
        update: { $set: fields },
        upsert: true
      }
    };
  });
  // ordered: false означає не зупинятися на першій помилці
  const result = await Measurement.bulkWrite(ops, { ordered: false });
  return { upserted: result.upsertedCount, matched: result.matchedCount };
}
