export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

// Ліміт за замовчуванням і жорсткий максимум: ?limit=1000000 не покладе базу
export function paginate({ page, limit } = {}) {
  const safeLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const safePage = Number(page) || 1;
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

export function pageMeta(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}
