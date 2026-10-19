// Показники вимірювань: ті самі коди, що й у бекенді (src/config/constants.js)
export const MEASUREMENT_FIELDS = [
  { key: 'pm25', label: 'PM2.5', unit: 'мкг/м³', min: 0, max: 1000 },
  { key: 'pm10', label: 'PM10', unit: 'мкг/м³', min: 0, max: 1000 },
  { key: 'no2', label: 'NO₂', unit: 'мкг/м³', min: 0, max: 1000 },
  { key: 'so2', label: 'SO₂', unit: 'мкг/м³', min: 0, max: 1000 },
  { key: 'co', label: 'CO', unit: 'мкг/м³', min: 0, max: 1000 },
  { key: 'o3', label: 'O₃', unit: 'мкг/м³', min: 0, max: 1000 },
  { key: 'temperature', label: 'Температура', unit: '°C', min: -60, max: 60 },
  { key: 'humidity', label: 'Вологість', unit: '%', min: 0, max: 100 }
];

export const POLLUTANTS = MEASUREMENT_FIELDS.slice(0, 6);

export const fieldLabel = key => MEASUREMENT_FIELDS.find(f => f.key === key)?.label ?? key;

// Середньодобова ГДК ВООЗ для PM2.5
export const PM25_LIMIT = 25;

export const SOURCE_LABELS = { manual: 'вручну', seed: 'демо', saveecobot: 'SaveEcoBot' };

export function formatValue(value, digits = 1) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('uk-UA', { maximumFractionDigits: digits });
}

// Бекенд зберігає час в UTC, показуємо в локальному часовому поясі
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

const pad = n => String(n).padStart(2, '0');

export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = value => new Date(value).toISOString();

export const dayStart = date => (date ? new Date(`${date}T00:00:00`).toISOString() : undefined);
export const dayEnd = date => (date ? new Date(`${date}T23:59:59.999`).toISOString() : undefined);

export const cleanParams = params =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));
