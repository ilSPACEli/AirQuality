import { ApiError } from '../utils/ApiError.js';

// Реєструється після всіх маршрутів
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Маршрут ${req.method} ${req.originalUrl} не існує`));
}
