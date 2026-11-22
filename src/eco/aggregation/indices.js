// Індекс якості повітря за наказом № 590 та ІЗА як вирази MongoDB

// Номер категорії 1…6 за верхніми межами діапазонів.
// Межі в додатку задано цілими числами (0–5, 6–15 …), тому «C ≤ 5 після округлення» = «C < 5,5»
export function bandLevel(valueExpr, upperBounds) {
  return {
    $cond: [
      { $isNumber: valueExpr },
      {
        $switch: {
          branches: upperBounds.map((upper, i) => ({ case: { $lt: [valueExpr, upper + 0.5] }, then: i + 1 })),
          default: upperBounds.length + 1
        }
      },
      null
    ]
  };
}

// Стадії, що рахують індекс № 590 для документа з полем concentrations: { pm25, pm10, o3, no2, so2 }.
// Результат: subindices (значення, категорія), level (найгірша речовина), dominant, category, missing, complete
export function aqiUaStages(table) {
  const pollutants = table.pollutants;
  const categoryOf = levelExpr => ({
    $cond: [{ $eq: [levelExpr, null] }, null, { $arrayElemAt: [{ $literal: table.categories }, { $subtract: [levelExpr, 1] }] }]
  });

  return [
    // 1. Категорія кожної речовини
    {
      $addFields: {
        subindices: Object.fromEntries(
          pollutants.map(p => [p, { value: `$concentrations.${p}`, level: bandLevel(`$concentrations.${p}`, table.upper_bounds[p]) }])
        )
      }
    },
    // 2. Колір і назва категорії речовини + список рівнів для пошуку найгіршої
    {
      $addFields: {
        ...Object.fromEntries(pollutants.map(p => [`subindices.${p}.category`, categoryOf(`$subindices.${p}.level`)])),
        levels: pollutants.map(p => ({ pollutant: p, level: `$subindices.${p}.level` }))
      }
    },
    // 3. Не виміряні речовини і найгірша речовина (перша з максимальною категорією)
    {
      $addFields: {
        missing: { $map: { input: { $filter: { input: '$levels', as: 'l', cond: { $eq: ['$$l.level', null] } } }, as: 'l', in: '$$l.pollutant' } },
        worst: {
          $reduce: {
            input: '$levels',
            initialValue: { pollutant: null, level: null },
            in: {
              $cond: [
                { $and: [{ $ne: ['$$this.level', null] }, { $or: [{ $eq: ['$$value.level', null] }, { $gt: ['$$this.level', '$$value.level'] }] }] },
                '$$this',
                '$$value'
              ]
            }
          }
        }
      }
    },
    // 4. Загальна категорія години
    {
      $addFields: {
        level: '$worst.level',
        dominant: '$worst.pollutant',
        category: categoryOf('$worst.level'),
        complete: { $eq: [{ $size: '$missing' }, 0] }
      }
    }
  ];
}

// Доданок ІЗА: (C / ГДКс.д.)^k, лише для повного річного ряду
export function izaTerm(meanExpr, gdkSd, k) {
  if (!gdkSd || k === undefined) return { $literal: null };
  return { $cond: [{ $isNumber: meanExpr }, { $pow: [{ $divide: [meanExpr, gdkSd] }, k] }, null] };
}
