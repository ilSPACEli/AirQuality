import axios from 'axios';
import { API_URL } from '../config.js';

// Помилка API в єдиному форматі: текст, HTTP-статус і деталі валідації по полях
export class ApiError extends Error {
  constructor(message, status = 0, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const http = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// Бекенд повертає { success, error, details }: перетворюємо будь-яку помилку на ApiError
http.interceptors.response.use(
  response => response,
  error => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const { response } = error;
    if (!response) {
      return Promise.reject(
        new ApiError(`Сервер недоступний. Перевірте, що API запущено (${API_URL})`)
      );
    }
    const message = response.data?.error || `Помилка сервера (${response.status})`;
    return Promise.reject(new ApiError(message, response.status, response.data?.details ?? []));
  }
);

// Відповідь бекенду: { success: true, data, meta }
const unwrap = response => ({ data: response.data?.data ?? null, meta: response.data?.meta ?? null });

export const stationsApi = {
  list: (params, signal) => http.get('/stations', { params, signal }).then(unwrap),
  get: (code, signal) => http.get(`/stations/${code}`, { signal }).then(unwrap),
  create: station => http.post('/stations', station).then(unwrap),
  replace: (code, station) => http.put(`/stations/${code}`, station).then(unwrap),
  patch: (code, changes) => http.patch(`/stations/${code}`, changes).then(unwrap),
  remove: code => http.delete(`/stations/${code}`),
  statistics: (code, params, signal) =>
    http.get(`/stations/${code}/statistics`, { params, signal }).then(unwrap),
  measurements: (code, params, signal) =>
    http.get(`/stations/${code}/measurements`, { params, signal }).then(unwrap),
  addMeasurement: (code, measurement) =>
    http.post(`/stations/${code}/measurements`, measurement).then(unwrap)
};

export const measurementsApi = {
  list: (params, signal) => http.get('/measurements', { params, signal }).then(unwrap),
  get: (id, signal) => http.get(`/measurements/${id}`, { signal }).then(unwrap),
  create: measurement => http.post('/measurements', measurement).then(unwrap),
  replace: (id, measurement) => http.put(`/measurements/${id}`, measurement).then(unwrap),
  remove: id => http.delete(`/measurements/${id}`)
};

export const healthApi = {
  check: signal => http.get('/health', { signal }).then(unwrap)
};

// Бекенд віддає не більше 200 записів за раз: для випадаючих списків збираємо всі сторінки
export async function fetchAllStations(signal) {
  const limit = 200;
  const first = await stationsApi.list({ limit, page: 1 }, signal);
  const pages = first.meta?.pages ?? 1;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => stationsApi.list({ limit, page: i + 2 }, signal))
  );
  return { data: [first, ...rest].flatMap(page => page.data), meta: first.meta };
}
