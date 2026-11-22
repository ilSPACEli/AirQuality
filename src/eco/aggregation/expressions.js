// Базові вирази агрегацій MongoDB. Кожна функція повертає шматок пайплайна,
// тому формули зібрано в одному місці і їх видно окремо від сервісів
import { getQualityRule } from '../norms/index.js';
import { TIME_ZONE } from '../time.js';

export const field = path => `$${path}`;

// Значення придатне для розрахунків: число, не позначене invalid і в межах фізичного діапазону сенсора.
// Перевірка меж тут же дозволяє рахувати навіть ряд, який ще не очищували
export function usableValue(pollutant, date = new Date()) {
  const { physical_max } = getQualityRule(pollutant, date);
  const value = field(pollutant);
  return {
    $cond: [
      {
        $and: [
          { $isNumber: value },
          { $ne: [field(`quality.${pollutant}`), 'invalid'] },
          { $gte: [value, 0] },
          { $lte: [value, physical_max] }
        ]
      },
      value,
      null
    ]
  };
}

// Кількість елементів, для яких умова істинна
export const countIf = condition => ({ $sum: { $cond: [condition, 1, 0] } });

// Кратність перевищення K = C / норматив; без нормативу – null
export function ratio(valueExpr, norm) {
  if (norm === null || norm === undefined || norm <= 0) return { $literal: null };
  return { $cond: [{ $isNumber: valueExpr }, { $divide: [valueExpr, norm] }, null] };
}

// Округлення для відповіді API ($round повертає null для null)
export const roundTo = (expr, digits) => ({ $round: [expr, digits] });

// Місцева доба Europe/Kyiv: початок доби в UTC і підпис 'YYYY-MM-DD'
export const localDayStart = dateExpr => ({ $dateTrunc: { date: dateExpr, unit: 'day', timezone: TIME_ZONE } });
export const localDate = dateExpr => ({ $dateToString: { format: '%Y-%m-%d', date: dateExpr, timezone: TIME_ZONE } });
