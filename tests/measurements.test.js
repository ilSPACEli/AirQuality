import request from 'supertest';
import app from '../src/app.js';
import { Measurement } from '../src/models/Measurement.js';
import { upsertMeasurements } from '../src/services/measurementService.js';
import { clearDatabase, kyivStation, lvivStation, startDatabase, stopDatabase } from './setup.js';

const API = '/api/v1/measurements';
const STATIONS = '/api/v1/stations';

const sample = {
  station_id: 'KYIV-01',
  measured_at: '2026-03-14T08:00:00.000Z',
  pm25: 23.4,
  pm10: 31.2
};

beforeAll(startDatabase, 600_000);
beforeEach(async () => {
  await request(app).post(STATIONS).send(kyivStation).expect(201);
  await request(app).post(STATIONS).send(lvivStation).expect(201);
});
afterEach(clearDatabase);
afterAll(stopDatabase);

// Погодинні вимірювання двох станцій з однаковими мітками часу
async function seedHourly(hours) {
  const records = [];
  for (let h = 0; h < hours; h++) {
    const measured_at = new Date(Date.UTC(2026, 2, 1, h));
    records.push({ station_id: 'KYIV-01', measured_at, pm25: 10 + h, pm10: 20 + h });
    records.push({ station_id: 'LVIV-01', measured_at, pm25: 30 + h, no2: 5 });
  }
  await upsertMeasurements(records);
}

describe('POST /measurements', () => {
  test('створює вимірювання: 201, Location і запис у базі', async () => {
    const res = await request(app).post(API).send(sample).expect(201);

    expect(res.headers.location).toBe(`${API}/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      station_id: 'KYIV-01',
      measured_at: '2026-03-14T08:00:00.000Z',
      pm25: 23.4,
      pm10: 31.2,
      no2: null, // не передано, отже null, а не 0
      source: 'manual'
    });

    const saved = await Measurement.findById(res.body.data.id);
    expect(saved.pm25).toBe(23.4);
    expect(saved.measured_at).toBeInstanceOf(Date);
  });

  test('розрізняє null і 0', async () => {
    const res = await request(app)
      .post(API)
      .send({ ...sample, pm25: 0, pm10: null })
      .expect(201);

    expect(res.body.data.pm25).toBe(0);
    expect(res.body.data.pm10).toBeNull();
  });

  test('неіснуюча станція: 404', async () => {
    const res = await request(app)
      .post(API)
      .send({ ...sample, station_id: 'KYIV-99' })
      .expect(404);
    expect(res.body.error).toBe('Станцію KYIV-99 не знайдено');
  });

  test('дублікат станція + час: 409', async () => {
    await request(app).post(API).send(sample).expect(201);
    await request(app).post(API).send(sample).expect(409);
    expect(await Measurement.countDocuments()).toBe(1);
  });

  test.each([
    ['від’ємна концентрація', { pm25: -1 }, 'pm25'],
    ['значення понад верхню межу', { pm25: 5000 }, 'pm25'],
    ['нечислове значення', { pm10: 'багато' }, 'pm10'],
    ['час не у форматі ISO 8601', { measured_at: '14.03.2026 08:00' }, 'measured_at'],
    ['час у майбутньому', { measured_at: '2999-01-01T00:00:00.000Z' }, 'measured_at'],
    ['відсутній station_id', { station_id: undefined }, 'station_id']
  ])('%s: 422', async (name, patch, field) => {
    const res = await request(app)
      .post(API)
      .send({ ...sample, ...patch })
      .expect(422);

    expect(res.body.error).toBe('Дані не пройшли валідацію');
    expect(res.body.details.map(d => d.field)).toEqual([field]);
    expect(await Measurement.countDocuments()).toBe(0);
  });

  test('жодного показника: 422', async () => {
    await request(app)
      .post(API)
      .send({ station_id: 'KYIV-01', measured_at: sample.measured_at })
      .expect(422);
  });
});

describe('GET /measurements', () => {
  test('порожня колекція: 200, а не 404', async () => {
    const res = await request(app).get(`${API}?station=KYIV-01&from=2026-01-01`).expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  test('за замовчуванням сортує від новіших до давніших', async () => {
    await seedHourly(3);
    const res = await request(app).get(`${API}?station=KYIV-01`).expect(200);

    expect(res.body.data.map(m => m.pm25)).toEqual([12, 11, 10]);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 50, pages: 1 });
  });

  test('фільтри: станція, місто, забруднювач, період', async () => {
    await seedHourly(6);

    const byCity = await request(app).get(`${API}?city=lviv`).expect(200);
    expect(byCity.body.meta.total).toBe(6);
    expect(byCity.body.data.every(m => m.station_id === 'LVIV-01')).toBe(true);

    const byPollutant = await request(app).get(`${API}?pollutant=no2`).expect(200);
    expect(byPollutant.body.meta.total).toBe(6);
    expect(byPollutant.body.data.every(m => m.no2 !== null)).toBe(true);

    const byPeriod = await request(app)
      .get(`${API}?station=KYIV-01&from=2026-03-01T02:00:00Z&to=2026-03-01T04:00:00Z`)
      .expect(200);
    expect(byPeriod.body.data.map(m => m.pm25)).toEqual([14, 13, 12]);

    const mismatch = await request(app).get(`${API}?city=Lviv&station=KYIV-01`).expect(200);
    expect(mismatch.body.meta.total).toBe(0);
  });

  test('сортування за полем із whitelist', async () => {
    await seedHourly(3);
    const res = await request(app).get(`${API}?sort=pm25&limit=2`).expect(200);
    expect(res.body.data.map(m => m.pm25)).toEqual([10, 11]);
  });

  test('поле сортування поза whitelist: 422', async () => {
    await request(app).get(`${API}?sort=__v`).expect(422);
    await request(app).get(`${API}?sort=-created_at`).expect(422);
  });

  test('некоректні фільтри: 422', async () => {
    await request(app).get(`${API}?pollutant=uranium`).expect(422);
    await request(app).get(`${API}?from=yesterday`).expect(422);
    await request(app).get(`${API}?from=2026-03-02&to=2026-03-01`).expect(422);
    await request(app).get(`${API}?after=not-a-cursor`).expect(422);
  });

  test('offset-пагінація', async () => {
    await seedHourly(5); // 10 записів
    const res = await request(app).get(`${API}?page=2&limit=4`).expect(200);

    expect(res.body.data).toHaveLength(4);
    expect(res.body.meta).toMatchObject({ total: 10, page: 2, limit: 4, pages: 3 });
  });

  test('курсорна пагінація обходить усі записи без дублів і пропусків', async () => {
    await seedHourly(5); // 10 записів, по два на кожну мітку часу

    const seen = [];
    let url = `${API}?limit=3`;
    for (let i = 0; i < 10 && url; i++) {
      const res = await request(app).get(url).expect(200);
      seen.push(...res.body.data.map(m => m.id));
      const cursor = res.body.meta.next_cursor;
      url = cursor ? `${API}?limit=3&after=${encodeURIComponent(cursor)}` : null;
    }

    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
  });

  test('курсор у вигляді часу ISO 8601', async () => {
    await seedHourly(4);
    const res = await request(app)
      .get(`${API}?station=KYIV-01&after=2026-03-01T02:00:00.000Z`)
      .expect(200);

    expect(res.body.data.map(m => m.pm25)).toEqual([11, 10]);
    expect(res.body.meta).toEqual({ limit: 50, next_cursor: null });
  });
});

describe('GET, PUT, DELETE /measurements/:id', () => {
  test('отримання одного: 200, неіснуючий: 404, некоректний id: 422', async () => {
    const created = await request(app).post(API).send(sample).expect(201);

    const res = await request(app).get(`${API}/${created.body.data.id}`).expect(200);
    expect(res.body.data.pm25).toBe(23.4);

    await request(app).get(`${API}/665f1c2e8b3e4a0012a4b7c9`).expect(404);
    await request(app).get(`${API}/123`).expect(422);
  });

  test('PUT повністю замінює вимірювання', async () => {
    const created = await request(app).post(API).send(sample).expect(201);

    const res = await request(app)
      .put(`${API}/${created.body.data.id}`)
      .send({ station_id: 'KYIV-01', measured_at: sample.measured_at, pm25: 40 })
      .expect(200);

    expect(res.body.data.pm25).toBe(40);
    expect(res.body.data.pm10).toBeNull(); // не передано в PUT, отже скинуто

    const saved = await Measurement.findById(created.body.data.id);
    expect(saved.pm25).toBe(40);
  });

  test('PUT з невалідними даними: 422, запис не змінюється', async () => {
    const created = await request(app).post(API).send(sample).expect(201);

    await request(app)
      .put(`${API}/${created.body.data.id}`)
      .send({ ...sample, pm25: -5 })
      .expect(422);

    const saved = await Measurement.findById(created.body.data.id);
    expect(saved.pm25).toBe(23.4);
  });

  test('DELETE: 204 без тіла, повтор теж 204', async () => {
    const created = await request(app).post(API).send(sample).expect(201);
    const url = `${API}/${created.body.data.id}`;

    const res = await request(app).delete(url).expect(204);
    expect(res.text).toBe('');
    await request(app).delete(url).expect(204);

    expect(await Measurement.countDocuments()).toBe(0);
    await request(app).get(url).expect(404);
  });
});

describe('Вкладений ресурс /stations/:id/measurements', () => {
  test('POST бере станцію з шляху', async () => {
    const res = await request(app)
      .post(`${STATIONS}/LVIV-01/measurements`)
      .send({ measured_at: sample.measured_at, pm25: 15, station_id: 'KYIV-01' })
      .expect(201);

    expect(res.body.data.station_id).toBe('LVIV-01');
  });

  test('GET повертає лише вимірювання цієї станції', async () => {
    await seedHourly(3);
    const res = await request(app).get(`${STATIONS}/LVIV-01/measurements?limit=2`).expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every(m => m.station_id === 'LVIV-01')).toBe(true);
    expect(res.body.meta.total).toBe(3);
  });

  test('неіснуюча станція: 404', async () => {
    await request(app).get(`${STATIONS}/KYIV-99/measurements`).expect(404);
    await request(app)
      .post(`${STATIONS}/KYIV-99/measurements`)
      .send({ measured_at: sample.measured_at, pm25: 15 })
      .expect(404);
  });
});

describe('GET /stations/:id/statistics', () => {
  test('рахує середнє, мінімум, максимум і перевищення ГДК', async () => {
    await upsertMeasurements([
      { station_id: 'KYIV-01', measured_at: new Date('2026-03-01T00:00:00Z'), pm25: 10, pm10: 20 },
      { station_id: 'KYIV-01', measured_at: new Date('2026-03-01T01:00:00Z'), pm25: 30 },
      { station_id: 'KYIV-01', measured_at: new Date('2026-03-01T02:00:00Z'), pm25: 50, pm10: 40 },
      { station_id: 'KYIV-01', measured_at: new Date('2026-03-01T03:00:00Z'), pm10: 60 },
      { station_id: 'LVIV-01', measured_at: new Date('2026-03-01T00:00:00Z'), pm25: 999 }
    ]);

    const res = await request(app).get(`${STATIONS}/KYIV-01/statistics`).expect(200);

    expect(res.body.data).toMatchObject({
      station_id: 'KYIV-01',
      count: 4,
      pm25_limit: 25,
      pm25_exceedances: 2,
      period: { from: '2026-03-01T00:00:00.000Z', to: '2026-03-01T03:00:00.000Z' }
    });
    // null не враховується в середньому: (10 + 30 + 50) / 3
    expect(res.body.data.parameters.pm25).toEqual({ count: 3, avg: 30, min: 10, max: 50 });
    expect(res.body.data.parameters.pm10).toEqual({ count: 3, avg: 40, min: 20, max: 60 });
    expect(res.body.data.parameters.no2).toEqual({ count: 0, avg: null, min: null, max: null });
  });

  test('станція без вимірювань: 200 з нульовими лічильниками', async () => {
    const res = await request(app).get(`${STATIONS}/KYIV-01/statistics`).expect(200);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.pm25_exceedances).toBe(0);
  });

  test('неіснуюча станція: 404', async () => {
    await request(app).get(`${STATIONS}/KYIV-99/statistics`).expect(404);
  });
});

describe('Пакетний upsert (seed та імпорт)', () => {
  test('повторний запуск не створює дублікатів', async () => {
    const records = [
      { station_id: 'KYIV-01', measured_at: new Date('2026-03-01T00:00:00Z'), pm25: 10 },
      { station_id: 'KYIV-01', measured_at: new Date('2026-03-01T01:00:00Z'), pm25: 11 }
    ];

    expect(await upsertMeasurements(records)).toEqual({ upserted: 2, matched: 0 });
    expect(await upsertMeasurements(records)).toEqual({ upserted: 0, matched: 2 });
    expect(await Measurement.countDocuments()).toBe(2);
  });
});
