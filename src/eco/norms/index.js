import { readFileSync } from 'node:fs';

// Довідники лежать поруч у *.json. Кожен запис має source і valid_from:
// коли норматив змінюється, додається новий запис, старий лишається для минулих періодів
const cache = new Map();

export function loadNorms(name) {
  if (!cache.has(name)) {
    const url = new URL(`./${name}.json`, import.meta.url);
    cache.set(name, JSON.parse(readFileSync(url, 'utf8')));
  }
  return cache.get(name);
}

export const normsVersion = name => loadNorms(name).version;

const toDateKey = date =>
  date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);

// Запис, чинний на дату: найпізніший valid_from, що не пізніше за дату
export function pickRecord(records, predicate, date = new Date()) {
  const day = toDateKey(date);
  return (
    records
      .filter(record => predicate(record) && record.valid_from <= day)
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] ?? null
  );
}

// ГДК зберігаються в мг/м³, як у наказі № 52. Робочі одиниці: мкг/м³, для CO – мг/м³
const toWorkingUnit = (pollutant, mgm3) => {
  if (mgm3 === null || mgm3 === undefined) return null;
  return pollutant === 'co' ? mgm3 : Math.round(mgm3 * 1e6) / 1e3;
};

export function getGdk(pollutant, date) {
  const record = pickRecord(loadNorms('gdk').records, r => r.pollutant === pollutant, date);
  if (!record) return null;
  return {
    pollutant,
    gdk_mr: toWorkingUnit(pollutant, record.gdk_mr),
    gdk_sd: toWorkingUnit(pollutant, record.gdk_sd),
    hazard_class: record.hazard_class,
    source: record.source,
    valid_from: record.valid_from
  };
}

export function getLimitValues(pollutant, date) {
  const records = loadNorms('limit-values').records.filter(r => r.pollutant === pollutant);
  const periods = [...new Set(records.map(r => r.period))];
  return periods
    .map(period => pickRecord(records, r => r.period === period, date))
    .filter(Boolean);
}

export function getCompleteness(period, date) {
  return pickRecord(loadNorms('completeness').records, r => r.period === period, date);
}

export function getQualityRule(pollutant, date) {
  const norms = loadNorms('quality');
  const record = pickRecord(norms.records, r => r.pollutant === pollutant, date);
  return record && { ...record, stuck_hours: norms.stuck_hours };
}

export const izaCoefficients = () => loadNorms('gdk').iza_k;
