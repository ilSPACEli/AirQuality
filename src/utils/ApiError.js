// Помилка з HTTP-статусом: сервіси кидають її, не знаючи про req і res
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static notFound(message) {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static unprocessable(message, details) {
    return new ApiError(422, message, details);
  }
}
