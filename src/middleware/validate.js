import { matchedData, validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

const LOCATIONS = ['body', 'query', 'params'];

function withoutUndefined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result
      .array({ onlyFirstError: true })
      .map(e => ({ field: e.path, message: e.msg }));
    return next(ApiError.unprocessable('Дані не пройшли валідацію', details));
  }

  // Далі обробники бачать лише перевірені поля з уже приведеними типами
  req.valid = Object.fromEntries(
    LOCATIONS.map(location => [
      location,
      withoutUndefined(matchedData(req, { locations: [location], includeOptionals: true }))
    ])
  );
  next();
}

// Валідація на межі системи: правила + єдиний обробник результату
export const validate = rules => [...rules, handleValidation];
