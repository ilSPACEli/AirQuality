export const API_PREFIX = '/api/v1';

// Забруднювачі, мкг/м³ (enum гарантує однакове написання кодів в агрегаціях)
export const POLLUTANTS = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];
export const METEO_FIELDS = ['temperature', 'humidity'];
export const MEASUREMENT_FIELDS = [...POLLUTANTS, ...METEO_FIELDS];

// Допустимі діапазони: вихід за межі свідчить про збій сенсора
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

// ГДК ВООЗ для PM2.5, середньодобова, мкг/м³
export const PM25_LIMIT = 25;

// Whitelist полів сортування: параметр із запиту не потрапляє в БД напряму
export const MEASUREMENT_SORT_FIELDS = ['measured_at', 'pm25', 'pm10', 'station_id'];

export const MEASUREMENT_SOURCES = ['manual', 'seed', 'saveecobot'];
