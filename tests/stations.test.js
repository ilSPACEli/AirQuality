import request from 'supertest';
import app from '../src/app.js';
import { Measurement } from '../src/models/Measurement.js';
import { Station } from '../src/models/Station.js';
import { clearDatabase, kyivStation, lvivStation, startDatabase, stopDatabase } from './setup.js';

const API = '/api/v1/stations';

beforeAll(startDatabase, 600_000);
afterEach(clearDatabase);
afterAll(stopDatabase);

describe('POST /stations', () => {
  test('створює станцію: 201, Location і запис у базі', async () => {
    const res = await request(app).post(API).send(kyivStation).expect(201);

    expect(res.headers.location).toBe(`${API}/KYIV-01`);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 'KYIV-01',
      code: 'KYIV-01',
      city: 'Kyiv',
      latitude: 50.4501,
      longitude: 30.5234,
      active: true
    });

    const saved = await Station.findOne({ code: 'KYIV-01' });
    expect(saved.location.coordinates).toEqual([30.5234, 50.4501]); // [довгота, широта]
  });

  test('дублікат коду: 409', async () => {
    await request(app).post(API).send(kyivStation).expect(201);
    const res = await request(app).post(API).send(kyivStation).expect(409);

    expect(res.body).toEqual({ success: false, error: 'Станція KYIV-01 вже зареєстрована' });
    expect(await Station.countDocuments()).toBe(1);
  });

  test('невалідні дані: 422 з деталізацією по полях', async () => {
    const res = await request(app)
      .post(API)
      .send({ code: 'KYIV-01', name: '', latitude: 10, longitude: 30.5, active: 'yes' })
      .expect(422);

    expect(res.body.success).toBe(false);
    const fields = res.body.details.map(d => d.field).sort();
    expect(fields).toEqual(['active', 'city', 'latitude', 'name']);
    expect(await Station.countDocuments()).toBe(0);
  });

  test('зламаний JSON: 400, а не 422', async () => {
    const res = await request(app)
      .post(API)
      .set('Content-Type', 'application/json')
      .send('{"code": "KYIV-01",')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  test('зайві поля з тіла запиту не потрапляють у базу', async () => {
    await request(app)
      .post(API)
      .send({ ...kyivStation, created_at: '2000-01-01T00:00:00Z', hacked: true })
      .expect(201);

    const saved = await Station.findOne({ code: 'KYIV-01' }).lean();
    expect(saved.hacked).toBeUndefined();
    expect(saved.created_at.getFullYear()).toBeGreaterThan(2000);
  });
});

describe('GET /stations', () => {
  test('порожня колекція: 200 і порожній масив', async () => {
    const res = await request(app).get(API).expect(200);

    expect(res.body).toEqual({
      success: true,
      data: [],
      meta: { total: 0, page: 1, limit: 50, pages: 0 }
    });
  });

  test('фільтр за містом без урахування регістру', async () => {
    await request(app).post(API).send(kyivStation);
    await request(app).post(API).send(lvivStation);

    const res = await request(app).get(`${API}?city=kyiv`).expect(200);

    expect(res.body.data.map(s => s.code)).toEqual(['KYIV-01']);
    expect(res.body.meta.total).toBe(1);
  });

  test('пагінація: page і limit', async () => {
    await request(app).post(API).send(kyivStation);
    await request(app).post(API).send(lvivStation);

    const res = await request(app).get(`${API}?page=2&limit=1`).expect(200);

    expect(res.body.data.map(s => s.code)).toEqual(['LVIV-01']);
    expect(res.body.meta).toEqual({ total: 2, page: 2, limit: 1, pages: 2 });
  });

  test('limit понад максимум зменшується до 200', async () => {
    const res = await request(app).get(`${API}?limit=1000000`).expect(200);
    expect(res.body.meta.limit).toBe(200);
  });

  test('некоректні параметри запиту: 422', async () => {
    await request(app).get(`${API}?page=0`).expect(422);
    await request(app).get(`${API}?limit=abc`).expect(422);
    await request(app).get(`${API}?city=Kyiv&city=Lviv`).expect(422);
  });
});

describe('GET /stations/:id', () => {
  test('існуюча станція: 200', async () => {
    await request(app).post(API).send(kyivStation);
    const res = await request(app).get(`${API}/kyiv-01`).expect(200);
    expect(res.body.data.code).toBe('KYIV-01');
  });

  test('неіснуюча станція: 404', async () => {
    const res = await request(app).get(`${API}/KYIV-99`).expect(404);
    expect(res.body).toEqual({ success: false, error: 'Станцію KYIV-99 не знайдено' });
  });
});

describe('PUT і PATCH /stations/:id', () => {
  test('PUT повністю замінює станцію', async () => {
    await request(app).post(API).send(kyivStation);

    const res = await request(app)
      .put(`${API}/KYIV-01`)
      .send({ name: 'Нова назва', city: 'Kyiv', latitude: 50.5, longitude: 30.6 })
      .expect(200);

    expect(res.body.data).toMatchObject({ name: 'Нова назва', latitude: 50.5, longitude: 30.6 });
    expect(res.body.data.measurement_types).toEqual([]); // не передано, тож скинуто
  });

  test('PUT без обов’язкових полів: 422', async () => {
    await request(app).post(API).send(kyivStation);
    await request(app).put(`${API}/KYIV-01`).send({ name: 'Лише назва' }).expect(422);
  });

  test('PATCH змінює лише передані поля', async () => {
    await request(app).post(API).send(kyivStation);

    const res = await request(app)
      .patch(`${API}/KYIV-01`)
      .send({ active: false, latitude: 50.6 })
      .expect(200);

    expect(res.body.data).toMatchObject({
      active: false,
      name: kyivStation.name,
      latitude: 50.6,
      longitude: kyivStation.longitude,
      measurement_types: ['pm25', 'pm10']
    });
  });

  test('оновлення неіснуючої станції: 404', async () => {
    await request(app).patch(`${API}/KYIV-99`).send({ active: false }).expect(404);
  });
});

describe('DELETE /stations/:id', () => {
  test('204 без тіла, повтор теж 204, вимірювання станції видаляються', async () => {
    await request(app).post(API).send(kyivStation);
    await request(app)
      .post(`${API}/KYIV-01/measurements`)
      .send({ measured_at: '2026-03-14T08:00:00.000Z', pm25: 20 })
      .expect(201);

    const res = await request(app).delete(`${API}/KYIV-01`).expect(204);
    expect(res.text).toBe('');
    await request(app).delete(`${API}/KYIV-01`).expect(204);

    expect(await Station.countDocuments()).toBe(0);
    expect(await Measurement.countDocuments()).toBe(0);
    await request(app).get(`${API}/KYIV-01`).expect(404);
  });
});

describe('Службові маршрути', () => {
  test('неіснуючий маршрут: 404 у єдиному форматі', async () => {
    const res = await request(app).get('/api/v1/unknown').expect(404);
    expect(res.body.success).toBe(false);
  });

  test('health: 200', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  test('OpenAPI-специфікація описує всі ресурси', async () => {
    const res = await request(app).get('/api/docs.json').expect(200);
    expect(Object.keys(res.body.paths).sort()).toEqual([
      '/health',
      '/measurements',
      '/measurements/{id}',
      '/stations',
      '/stations/{id}',
      '/stations/{id}/measurements',
      '/stations/{id}/statistics'
    ]);
  });

  test('CORS: дозволене походження отримує заголовок, чуже ні', async () => {
    const allowed = await request(app).get(API).set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const foreign = await request(app).get(API).set('Origin', 'http://evil.example');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });
});
