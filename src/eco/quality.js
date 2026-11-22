// Контроль якості годинних значень. Прапорці: valid, suspect, invalid.
// Значення не видаляються з бази: на захисті треба показати, скільки відкинуто і чому
export const QUALITY_FLAGS = ['valid', 'suspect', 'invalid'];

// Одне значення: null – даних немає; від'ємне або вище фізичної межі – invalid
export function classifyValue(value, { physical_max }) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > physical_max) return 'invalid';
  return 'valid';
}

// Ряд значень однієї речовини, упорядкований за часом.
// Крім меж, шукаємо «залиплий» сенсор: однакове значення stuck_hours годин поспіль → suspect
export function classifySeries(values, { physical_max, stuck_hours = 6 }) {
  const flags = values.map(v => classifyValue(v, { physical_max }));

  let start = 0;
  for (let i = 1; i <= values.length; i++) {
    const sameAsPrev =
      i < values.length && flags[i] === 'valid' && flags[i - 1] === 'valid' && values[i] === values[i - 1];
    if (sameAsPrev) continue;
    if (i - start >= stuck_hours && flags[start] === 'valid') {
      for (let j = start; j < i; j++) flags[j] = 'suspect';
    }
    start = i;
  }
  return flags;
}

export function summarizeFlags(flags) {
  const summary = { valid: 0, suspect: 0, invalid: 0, missing: 0 };
  for (const flag of flags) summary[flag ?? 'missing'] += 1;
  return summary;
}

// В агрегати потрапляють valid і suspect; invalid і відсутні значення – ні
export const usable = flag => flag === 'valid' || flag === 'suspect';
