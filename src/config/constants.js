import { getGdk } from '../eco/norms/index.js';

export const API_PREFIX = '/api/v1';

export const POLLUTANTS = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];
export const METEO_FIELDS = ['temperature', 'humidity'];
export const MEASUREMENT_FIELDS = [...POLLUTANTS, ...METEO_FIELDS];


export const RANGES = {
  pm25: { min: 0, max: 1000 },
  pm10: { min: 0, max: 1000 },
  no2: { min: 0, max: 1000 },
  so2: { min: 0, max: 1000 },
  co: { min: 0, max: 1000 },
  o3: { min: 0, max: 1000 },
  temperature: { min: -60, max: 60 },
  humidity: { min: 0, max: 100 }
};

// Межі України для перевірки координат
export const UKRAINE_BOUNDS = {
  latitude: { min: 44.0, max: 52.5 },
  longitude: { min: 22.0, max: 40.5 }
};

export const STATION_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

// ГДК с.д. для PM2.5, мкг/м³: береться з довідника, а не записується в коді
export const PM25_LIMIT = getGdk('pm25').gdk_sd;

// Прапорці якості годинних значень
export { QUALITY_FLAGS } from '../eco/quality.js';

// Тип населеного пункту станції (потрібен для коефіцієнтів методик)
export const SETTLEMENT_TYPES = ['city', 'town', 'village', 'resort'];

// Whitelist полів сортування: параметр із запиту не потрапляє в БД напряму
export const MEASUREMENT_SORT_FIELDS = ['measured_at', 'pm25', 'pm10', 'station_id'];

export const MEASUREMENT_SOURCES = ['manual', 'seed', 'saveecobot', 'generator'];
