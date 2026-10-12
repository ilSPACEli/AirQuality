import { RANGES, STATION_CODE_RE, UKRAINE_BOUNDS } from '../config/constants.js';

// Назви показників SaveEcoBot
const FIELD_BY_POLLUTANT = {
  'PM2.5': 'pm25',
  PM10: 'pm10',
  NO2: 'no2',
  SO2: 'so2',
  CO: 'co',
  O3: 'o3',
  Temperature: 'temperature',
  Humidity: 'humidity'
};

const inRange = (value, { min, max }) => Number.isFinite(value) && value >= min && value <= max;

function toStation(raw) {
  const code = String(raw.id ?? '').trim().toUpperCase();
  const latitude = parseFloat(raw.latitude); // координати приходять рядками
  const longitude = parseFloat(raw.longitude);
  const city = raw.cityName?.trim();

  if (!STATION_CODE_RE.test(code) || !city) return null;
  if (!inRange(latitude, UKRAINE_BOUNDS.latitude)) return null;
  if (!inRange(longitude, UKRAINE_BOUNDS.longitude)) return null;

  return {
    code,
    name: (raw.stationName || raw.localName || code).trim().slice(0, 120),
    city: city.slice(0, 60),
    latitude,
    longitude
  };
}

// Показники однієї станції можуть мати різний час: групуємо їх за міткою часу
function toMeasurements(code, pollutants = []) {
  const byTime = new Map();
  let rejected = 0;

  for (const { pol, time, value } of pollutants) {
    const field = FIELD_BY_POLLUTANT[pol];
    const measuredAt = new Date(time);
    if (!field || Number.isNaN(measuredAt.getTime()) || value === null || value === undefined) continue;

    // Значення поза діапазоном означає збій сенсора: у базу воно не потрапляє
    if (!inRange(Number(value), RANGES[field])) {
      rejected++;
      continue;
    }

    const key = measuredAt.toISOString();
    if (!byTime.has(key)) {
      byTime.set(key, { station_id: code, measured_at: measuredAt, source: 'saveecobot' });
    }
    byTime.get(key)[field] = Number(value);
  }

  return { measurements: [...byTime.values()], rejected };
}

// Чиста функція без fs, мережі та бази: перетворює відповідь API на записи для upsert
export function mapSaveEcoBot(rawStations, { city } = {}) {
  const stations = [];
  const measurements = [];
  let skippedStations = 0;
  let rejectedValues = 0;

  for (const raw of rawStations) {
    const station = toStation(raw);
    if (!station) {
      skippedStations++;
      continue;
    }
    if (city && station.city.toLowerCase() !== city.toLowerCase()) continue;

    const mapped = toMeasurements(station.code, raw.pollutants);
    rejectedValues += mapped.rejected;

    station.measurement_types = [
      ...new Set(mapped.measurements.flatMap(m => Object.keys(m).filter(key => key in RANGES)))
    ];
    stations.push(station);
    measurements.push(...mapped.measurements);
  }

  return { stations, measurements, skippedStations, rejectedValues };
}
