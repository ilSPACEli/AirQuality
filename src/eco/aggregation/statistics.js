// Статистичні формули як вирази MongoDB над масивом значень

// Лише числа (null і відсутні значення відкидаються)
export const numbersOnly = arrayExpr => ({ $filter: { input: arrayExpr, as: 'v', cond: { $isNumber: '$$v' } } });

// Числа за зростанням
export const sortedNumbers = arrayExpr => ({ $sortArray: { input: numbersOnly(arrayExpr), sortBy: 1 } });

// Перцентиль методом найближчого рангу: rank = ceil(p/100 · n), значення = sorted[rank − 1].
// Для 365 добових значень P90.4 → ранг 330, тобто 36-те найбільше значення
export function percentile(arrayExpr, p) {
  return {
    $let: {
      vars: { s: sortedNumbers(arrayExpr) },
      in: {
        $cond: [
          { $eq: [{ $size: '$$s' }, 0] },
          null,
          {
            $arrayElemAt: [
              '$$s',
              { $toInt: { $max: [0, { $subtract: [{ $ceil: { $multiply: [p / 100, { $size: '$$s' }] } }, 1] }] } }
            ]
          }
        ]
      }
    }
  };
}

// Медіана: середній елемент, для парної кількості – середнє двох середніх
export function median(arrayExpr) {
  return {
    $let: {
      vars: { s: sortedNumbers(arrayExpr) },
      in: {
        $let: {
          vars: { n: { $size: '$$s' } },
          in: {
            $switch: {
              branches: [
                { case: { $eq: ['$$n', 0] }, then: null },
                {
                  case: { $eq: [{ $mod: ['$$n', 2] }, 1] },
                  then: { $arrayElemAt: ['$$s', { $toInt: { $divide: [{ $subtract: ['$$n', 1] }, 2] } }] }
                }
              ],
              default: {
                $avg: [
                  { $arrayElemAt: ['$$s', { $toInt: { $subtract: [{ $divide: ['$$n', 2] }, 1] } }] },
                  { $arrayElemAt: ['$$s', { $toInt: { $divide: ['$$n', 2] } }] }
                ]
              }
            }
          }
        }
      }
    }
  };
}

// Скільки значень більше за поріг (поріг відсутній – null)
export function countAbove(arrayExpr, limit) {
  if (limit === null || limit === undefined) return { $literal: null };
  return { $size: { $filter: { input: numbersOnly(arrayExpr), as: 'v', cond: { $gt: ['$$v', limit] } } } };
}

export const minOf = arrayExpr => ({ $min: numbersOnly(arrayExpr) });
export const maxOf = arrayExpr => ({ $max: numbersOnly(arrayExpr) });
export const countOf = arrayExpr => ({ $size: numbersOnly(arrayExpr) });
