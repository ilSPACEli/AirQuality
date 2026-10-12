import { Measurement } from '../models/Measurement.js';
import { Station } from '../models/Station.js';
import { ApiError } from '../utils/ApiError.js';
import { pageMeta, paginate } from '../utils/pagination.js';

// Порівняння назв міст без урахування регістру
export const CITY_COLLATION = { locale: 'uk', strength: 2 };

const toLocation = (latitude, longitude) => ({
  type: 'Point',
  coordinates: [longitude, latitude] // GeoJSON: [довгота, широта]
});

function toFields({ latitude, longitude, ...rest }) {
  return { ...rest, location: toLocation(latitude, longitude) };
}

export async function listStations({ city, active, page, limit } = {}) {
  const filter = {};
  if (city) filter.city = city;
  if (active !== undefined) filter.active = active;

  const paging = paginate({ page, limit });
  const [data, total] = await Promise.all([
    Station.find(filter)
      .collation(CITY_COLLATION)
      .sort({ code: 1 })
      .skip(paging.skip)
      .limit(paging.limit),
    Station.countDocuments(filter).collation(CITY_COLLATION)
  ]);

  return { data, meta: pageMeta(total, paging.page, paging.limit) };
}

export async function getStation(code) {
  const station = await Station.findOne({ code });
  if (!station) throw ApiError.notFound(`Станцію ${code} не знайдено`);
  return station;
}

export async function assertStationExists(code) {
  if (!(await Station.exists({ code }))) {
    throw ApiError.notFound(`Станцію ${code} не знайдено`);
  }
}

export async function createStation(input) {
  try {
    return await Station.create(toFields(input));
  } catch (err) {
    if (err.code === 11000) {
      throw ApiError.conflict(`Станція ${input.code} вже зареєстрована`);
    }
    throw err;
  }
}

// PUT: повна заміна, пропущені необов'язкові поля повертаються до значень за замовчуванням
export async function replaceStation(code, input) {
  const station = await getStation(code);
  station.set({ active: true, measurement_types: [], ...toFields(input) });
  return station.save();
}

// PATCH: змінюються лише передані поля
export async function patchStation(code, input) {
  const station = await getStation(code);
  const { latitude = station.latitude, longitude = station.longitude, ...rest } = input;
  station.set({ ...rest, location: toLocation(latitude, longitude) });
  return station.save();
}

// Ідемпотентне видалення: вимірювання станції без неї не мають сенсу, тому видаляються разом
export async function deleteStation(code) {
  await Promise.all([Station.deleteOne({ code }), Measurement.deleteMany({ station_id: code })]);
}

// Пакетний upsert для скриптів seed та імпорту: повторний запуск не створює дублікатів
export async function upsertStations(stations) {
  if (stations.length === 0) return { upserted: 0, matched: 0 };

  const ops = stations.map(station => {
    const { code, ...fields } = toFields(station);
    return { updateOne: { filter: { code }, update: { $set: fields }, upsert: true } };
  });
  const result = await Station.bulkWrite(ops, { ordered: false });
  return { upserted: result.upsertedCount, matched: result.matchedCount };
}
