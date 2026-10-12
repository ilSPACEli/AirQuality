import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';

function toApiError(err) {
  if (err instanceof ApiError) return err;

  // Помилки парсера express.json()
  if (err.type === 'entity.parse.failed') {
    return new ApiError(400, 'Некоректний JSON у тілі запиту');
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'Тіло запиту завелике');
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Дані не пройшли валідацію', details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return new ApiError(400, `Некоректне значення параметра ${err.path}`);
  }
  // Порушення унікального індексу MongoDB
  if (err.code === 11000) {
    return ApiError.conflict('Такий запис уже існує');
  }

  return null;
}

// Обробник помилок: рівно чотири аргументи (next обов'язковий), реєструється останнім
export function errorHandler(err, req, res, next) {
  const apiError = toApiError(err);

  if (!apiError) {
    console.error(err.stack); // повний стек лише в лог
    return res.status(500).json({ success: false, error: 'Внутрішня помилка сервера' });
  }

  const body = { success: false, error: apiError.message };
  if (apiError.details) body.details = apiError.details;
  res.status(apiError.status).json(body);
}
