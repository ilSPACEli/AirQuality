import { ApiError } from '../utils/ApiError.js';

const LOCATIONS = ['params', 'query', 'body'];

export function validateZod(schemas) {
  return (req, res, next) => {
    const details = [];
    const valid = { ...(req.valid ?? {}) };

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        valid[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ field: issue.path.join('.') || location, message: issue.message });
        }
      }
    }

    if (details.length) return next(ApiError.unprocessable('Дані не пройшли валідацію', details));
    req.valid = valid;
    next();
  };
}
