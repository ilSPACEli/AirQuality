import { readFileSync } from 'node:fs';
import request from 'supertest';
import { generateYear } from '../scripts/year-generator.js';
import app from '../src/app.js';
import { getQualityRule } from '../src/eco/norms/index.js';
import { classifySeries, usable } from '../src/eco/quality.js';
import { kyivDateKey, yearRange } from '../src/eco/time.js';
import { DailyStat } from '../src/models/DailyStat.js';
import { Measurement } from '../src/models/Measurement.js';
import { clearDatabase, kyivStation, lvivStation, startDatabase, stopDatabase } from './setup.js';

const STATIONS = '/api/v1/stations';
const HOUR = 3_600_000;

// Доба 2025-03-10 за Києвом (UTC+2) починається 2025-03-09T22:00Z
const DAY1 = Date.parse('2025-03-09T22:00:00Z');
const DAY2 = DAY1 + 24 * HOUR;

// 24 години першої доби і лише 12 годин другої (неповна доба).
// Значення чергуються, щоб не спрацювала перевірка «залиплого» сенсора
function hourlyRecords() {
  const records = [];
  const push = (start, hours) => {
    for (let h = 0; h < hours; h++) {
      records.push({
        station_id: 'KYIV-01',
        measured_at: new Date(start + h * HOUR),
        source: 'generator',
        pm25: start === DAY1 && h === 3 ? -5 : 20 + (h % 2), // одне від'ємне значення → invalid
        pm10: 58 + (h % 5), // середнє першої доби 59,9167 > ГДК с.д. 50
        no2: start === DAY1 && h === 10 ? 250 : 30 + (h % 2), // 250 > ГДК м.р. 200
        so2: 5 + (h % 2) * 0.5,
        o3: 40 + (h % 2),
        co: 0.5 + (h % 2) * 0.1
      });
    }
  };
  push(DAY1, 24);
  push(DAY2, 12);
  return records;
}

beforeAll(startDatabase, 600_000);
beforeEach(async () => {
  await request(app).post(STATIONS).send(kyivStation).expect(201);
  await Measurement.insertMany(hourlyRecords());
});
afterEach(clearDatabase);
afterAll(stopDatabase);

const process2025 = () => request(app).post(`${STATIONS}/KYIV-01/process?year=2025`).expect(200);

describe('Обробка річного ряду (POST /stations/:id/process)', () => {
  it('позначає некоректні значення і рахує повні доби', async () => {
    const res = await process2025();
    const { cleaning, daily } = res.body.data;
    expect(cleaning.records).toBe(36);
    expect(cleaning.summary.pm25.invalid).toBe(1);
    expect(cleaning.summary.pm10).toMatchObject({ valid: 36, invalid: 0, suspect: 0 });
    expect(daily.days).toBe(2);
    expect(daily.complete_days.pm10).toBe(1);

    const bad = await Measurement.findOne({ pm25: -5 }).lean();
    expect(bad.quality.pm25).toBe('invalid'); // значення лишилося в базі
  });
});

describe('Добові агрегати (GET /stations/:id/daily)', () => {
  it('межі доби за Europe/Kyiv і ознака повноти', async () => {
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/daily?year=2025&pollutant=pm10`).expect(200);
    const [day1, day2] = res.body.data.data;
    expect(day1.date).toBe('2025-03-10');
    expect(day1.pollutants.pm10.mean).toBeCloseTo(59.9167, 3);
    expect(day1.pollutants.pm10.complete).toBe(true);
    expect(day2.pollutants.pm10).toMatchObject({ hours: 12, complete: false, mean: null });
    expect(res.body.data.norms.pm10.gdk_sd).toBe(50);
  });
});

describe('Перевищення (GET /stations/:id/alerts)', () => {
  it('записує подію з речовиною, періодом, значенням, нормативом і кратністю', async () => {
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/alerts?year=2025&limit=1000`).expect(200);
    const alerts = res.body.data;

    const pm10 = alerts.find(a => a.pollutant === 'pm10' && a.norm_type === 'gdk_sd');
    expect(pm10).toMatchObject({ period: 'day', date: '2025-03-10', norm: 50 });
    expect(pm10.ratio).toBeCloseTo(1.1983, 3);

    const no2 = alerts.find(a => a.pollutant === 'no2' && a.norm_type === 'gdk_mr');
    expect(no2).toMatchObject({ period: 'hour', value: 250, norm: 200, ratio: 1.25 });

    // Неповна друга доба з ГДК с.д. не порівнюється
    expect(alerts.some(a => a.pollutant === 'pm10' && a.date === '2025-03-11')).toBe(false);
  });
});

describe('Річні показники (GET /stations/:id/annual)', () => {
  it('повертає повноту, статистику, ІЗА і паспорт', async () => {
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/annual?year=2025`).expect(200);
    const { pollutants, iza, station, passport } = res.body.data;

    expect(station.code).toBe('KYIV-01');
    expect(pollutants.pm10.hourly).toMatchObject({ valid: 36, expected_hours: 8760, complete: false });
    expect(pollutants.pm10.annual_mean).toBeNull(); // менше 90 % даних
    expect(pollutants.pm10.daily).toMatchObject({ complete_days: 1, exceed_gdk_sd_days: 1 });
    expect(pollutants.pm10.daily.median).toBeCloseTo(59.92, 2);
    expect(pollutants.pm25.hourly.invalid).toBe(1);
    expect(iza.value).toBeNull();
    expect(iza.excluded).toHaveLength(6);
    expect(passport.method.percentiles).toMatch(/найближчого рангу/);
    expect(passport.norms.pm10.gdk.source).toBeTruthy();
  });

  it('медіана і перцентилі за 20 добовими середніми (метод найближчого рангу)', async () => {
    // 20 повних діб PM10: 5, 10, …, 100 мкг/м³
    await DailyStat.insertMany(
      Array.from({ length: 20 }, (_, i) => ({
        station_id: 'KYIV-01',
        date: `2025-04-${String(i + 1).padStart(2, '0')}`,
        day_start: new Date(Date.UTC(2025, 2, 31, 21) + i * 24 * HOUR),
        pollutants: { pm10: { mean: (i + 1) * 5, mean_raw: (i + 1) * 5, max: 0, hours: 24, complete: true, max8h: null } }
      }))
    );
    const res = await request(app).get(`${STATIONS}/KYIV-01/annual?year=2025`).expect(200);
    const { daily, compliance } = res.body.data.pollutants.pm10;
    expect(daily).toMatchObject({
      complete_days: 20,
      median: 52.5, // (50 + 55) / 2
      min: 5,
      max: 100,
      p90_4: 95, // ранг ceil(0,904 · 20) = 19
      p98: 100, // ранг ceil(0,98 · 20) = 20
      exceed_gdk_sd_days: 10 // 55 … 100
    });
    expect(compliance.find(c => c.period === 'day')).toMatchObject({ limit: 50, allowed: 35, count: 10, ok: true });
  });

  it('те саме через /stats?period=year', async () => {
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/stats?period=year&year=2025`).expect(200);
    expect(res.body.data.year).toBe(2025);
  });

  it('без року – 422 з переліком полів', async () => {
    const res = await request(app).get(`${STATIONS}/KYIV-01/annual`).expect(422);
    expect(res.body.details.map(d => d.field)).toEqual(['year']);
  });

  it('невідома станція – 404', async () => {
    await request(app).get(`${STATIONS}/KYIV-99/annual?year=2025`).expect(404);
  });
});

describe('Агрегації MongoDB = ручний розрахунок (повний рік із генератора)', () => {
  it('річне середнє, доба переходу на літній час, медіана, P90.4, перевищення, ІЗА', async () => {
    await request(app).post(STATIONS).send(lvivStation).expect(201);
    const { records } = generateYear({ stationId: 'LVIV-01', year: 2025 });
    await Measurement.insertMany(records);
    await request(app).post(`${STATIONS}/LVIV-01/process?year=2025`).expect(200);
    const res = await request(app).get(`${STATIONS}/LVIV-01/annual?year=2025`).expect(200);
    const annual = res.body.data;

    // Вручну: прапорці якості тими самими правилами і середнє придатних годин
    const flags = classifySeries(records.map(r => r.pm25), getQualityRule('pm25'));
    const usableValues = records.map((r, i) => (usable(flags[i]) ? r.pm25 : null)).filter(v => v !== null);
    const manualMean = usableValues.reduce((a, v) => a + v, 0) / usableValues.length;
    expect(annual.pollutants.pm25.hourly.complete).toBe(true);
    expect(annual.pollutants.pm25.annual_mean).toBeCloseTo(manualMean, 1);

    // Доба переходу на літній час (23 години): групування за Europe/Kyiv
    const dstHours = records.filter((r, i) => kyivDateKey(r.measured_at) === '2025-03-30' && usable(flags[i]));
    const dstDay = await DailyStat.findOne({ station_id: 'LVIV-01', date: '2025-03-30' }).lean();
    expect(dstDay.pollutants.pm25.hours).toBe(dstHours.length);
    expect(dstDay.pollutants.pm25.mean_raw).toBeCloseTo(dstHours.reduce((a, r) => a + r.pm25, 0) / dstHours.length, 6);

    // Медіана і P90.4 добових середніх PM10 – вручну методом найближчого рангу
    const days = await DailyStat.find({ station_id: 'LVIV-01' }).lean();
    const means = days.map(d => d.pollutants.pm10.mean).filter(v => v !== null).sort((a, b) => a - b);
    const n = means.length;
    const manualP904 = means[Math.ceil(0.904 * n) - 1];
    const manualMedian = n % 2 ? means[(n - 1) / 2] : (means[n / 2 - 1] + means[n / 2]) / 2;
    expect(annual.pollutants.pm10.daily.complete_days).toBe(n);
    expect(annual.pollutants.pm10.daily.p90_4).toBeCloseTo(manualP904, 1);
    expect(annual.pollutants.pm10.daily.median).toBeCloseTo(manualMedian, 1);

    // Кількість діб понад ГДК с.д. = кількість подій gdk_sd в alerts
    const manualExceed = means.filter(v => v > 50).length;
    expect(annual.pollutants.pm10.daily.exceed_gdk_sd_days).toBe(manualExceed);
    const alerts = await request(app).get(`${STATIONS}/LVIV-01/alerts?year=2025&pollutant=pm10&limit=1000`).expect(200);
    expect(alerts.body.data.filter(a => a.norm_type === 'gdk_sd')).toHaveLength(manualExceed);

    // ІЗА = сума доданків (C/ГДКс.д.)^k
    expect(annual.iza.excluded).toEqual([]);
    const manualIza = annual.iza.terms.reduce((a, t) => a + t.ratio ** t.k, 0);
    expect(annual.iza.value).toBeCloseTo(manualIza, 1);
  });
});

describe('Статистика за годинами (GET /stations/:id/stats?period=hour)', () => {
  it('середнє і медіана за період рахує MongoDB', async () => {
    await process2025();
    const res = await request(app)
      .get(`${STATIONS}/KYIV-01/stats?period=hour&from=2025-03-09T22:00:00Z&to=2025-03-10T22:00:00Z`)
      .expect(200);
    expect(res.body.data.pollutants.pm10.n).toBe(24);
    expect(res.body.data.pollutants.pm10.mean).toBeCloseTo(59.92, 2);
    expect(res.body.data.pollutants.pm25.n).toBe(23); // invalid не враховується
  });
});

describe('Індекс за наказом № 590 (GET /stations/:id/aqi)', () => {
  it('найгірша речовина визначає категорію години', async () => {
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/aqi?at=2025-03-10T08:30:00Z`).expect(200);
    const data = res.body.data;
    expect(data.measured_at).toBe('2025-03-10T08:00:00.000Z');
    expect(data.dominant).toBe('no2'); // 250 мкг/м³ > 150
    expect(data.level).toBe(6);
    expect(data.category.name).toBe('Дуже поганий');
    expect(data.complete).toBe(true);
    expect(data.subindices.pm10).toMatchObject({ value: 58, level: 3 });
    expect(data.subindices.pm10.category.name).toBe('Задовільний');
    expect(data.passport.method).toMatch(/найгіршій категорії/);
  });

  it('частина речовин не вимірювалася – індекс неповний', async () => {
    await Measurement.create({ station_id: 'KYIV-01', measured_at: new Date('2025-06-01T10:00:00Z'), pm25: 12 });
    const res = await request(app).get(`${STATIONS}/KYIV-01/aqi?at=2025-06-01T10:00:00Z`).expect(200);
    expect(res.body.data).toMatchObject({ level: 2, dominant: 'pm25', complete: false });
    expect(res.body.data.missing).toEqual(['pm10', 'o3', 'no2', 'so2']);
  });

  it('немає вимірювання – 404', async () => {
    await request(app).get(`${STATIONS}/KYIV-01/aqi?at=2024-01-01T00:00:00Z`).expect(404);
  });
});

describe('Розрахунковий endpoint варіанта 4', () => {
  it('податок за квартал з паспортом розрахунку', async () => {
    const input = JSON.parse(readFileSync(new URL('../examples/v4-tax-input.json', import.meta.url), 'utf8'));
    const res = await request(app).post('/api/v1/eco/tax/quarter').send(input).expect(200);
    expect(res.body.data.total_uah).toBe('593.57');
    expect(res.body.passport.method).toMatch(/249/);
    expect(res.body.passport.rates_used.find(r => r.code === 'NOX').rate_uah_per_t).toBe('2574.43');
  });

  it('від’ємна маса, невідома речовина, квартал 5 – 422', async () => {
    const res = await request(app)
      .post('/api/v1/eco/tax/quarter')
      .send({ enterprise: { name: 'Т' }, year: 2026, quarter: 5, emissions: [{ code: 'XYZ', mass_t: -1 }] })
      .expect(422);
    const fields = res.body.details.map(d => d.field);
    expect(fields).toContain('quarter');
    expect(fields).toContain('emissions.0.mass_t');
    expect(fields).toContain('emissions.0.code');
  });
});

describe('Граничні значення (агрегації MongoDB)', () => {
  // Години місцевої доби: перша година доби за Києвом у UTC
  const hours = (startIso, count, values) =>
    Array.from({ length: count }, (_, h) => ({
      station_id: 'KYIV-01',
      measured_at: new Date(Date.parse(startIso) + h * HOUR),
      ...values(h)
    }));

  it('доба: 18 годин із 24 – повна, 17 – неповна', async () => {
    // 2025-05-10 і 2025-05-11 за Києвом (UTC+3) починаються о 21:00 UTC попереднього дня
    await Measurement.insertMany([
      ...hours('2025-05-09T21:00:00Z', 18, h => ({ pm10: 30 + (h % 2) })),
      ...hours('2025-05-10T21:00:00Z', 17, h => ({ pm10: 30 + (h % 2) }))
    ]);
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/daily?year=2025&pollutant=pm10`).expect(200);
    const day = date => res.body.data.data.find(d => d.date === date).pollutants.pm10;
    expect(day('2025-05-10')).toMatchObject({ hours: 18, complete: true });
    expect(day('2025-05-10').mean).toBeCloseTo(30.5, 6);
    expect(day('2025-05-11')).toMatchObject({ hours: 17, complete: false, mean: null });
  });

  it('норматив рівно на межі: K = 1 – не перевищення, 200,1 – перевищення', async () => {
    await Measurement.insertMany([
      { station_id: 'KYIV-01', measured_at: new Date('2025-06-01T10:00:00Z'), no2: 200 },
      { station_id: 'KYIV-01', measured_at: new Date('2025-06-01T11:00:00Z'), no2: 200.1 }
    ]);
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/alerts?year=2025&pollutant=no2&limit=1000`).expect(200);
    const gdk = res.body.data.filter(a => a.norm_type === 'gdk_mr').map(a => a.value);
    expect(gdk).toContain(200.1);
    expect(gdk).not.toContain(200);
  });

  it('фізична межа сенсора: 1000 мкг/м³ – придатне, 1000,1 – invalid', async () => {
    await Measurement.insertMany([
      { station_id: 'KYIV-01', measured_at: new Date('2025-06-02T10:00:00Z'), pm25: 1000 },
      { station_id: 'KYIV-01', measured_at: new Date('2025-06-02T11:00:00Z'), pm25: 1000.1 }
    ]);
    const res = await process2025();
    expect(res.body.data.cleaning.summary.pm25.invalid).toBe(2); // −5 з першої доби і 1000,1
    const ok = await Measurement.findOne({ pm25: 1000 }).lean();
    expect(ok.quality.pm25).toBe('valid');
  });

  it('межа року: 21:00 UTC 31.12 – ще 2024 рік, 22:00 UTC – уже 2025', async () => {
    await Measurement.insertMany([
      { station_id: 'KYIV-01', measured_at: new Date('2024-12-31T21:00:00Z'), pm25: 10 },
      { station_id: 'KYIV-01', measured_at: new Date('2024-12-31T22:00:00Z'), pm25: 10 }
    ]);
    const res = await process2025();
    expect(res.body.data.cleaning.records).toBe(37); // 36 годин березня + 00:00 1 січня
    const { from } = yearRange(2025);
    expect(from.toISOString()).toBe('2024-12-31T22:00:00.000Z');
  });

  it('межі категорій індексу № 590 для ТЧ2,5: 5 і 5,4 – «Добрий», 5,5 – «Допустимий», 140,4 – 5, 140,5 – 6', async () => {
    const cases = [
      [5, 1],
      [5.4, 1],
      [5.5, 2],
      [140.4, 5],
      [140.5, 6],
      [0, 1]
    ];
    await Measurement.insertMany(
      cases.map(([pm25], i) => ({ station_id: 'KYIV-01', measured_at: new Date(Date.UTC(2025, 6, 1, i)), pm25 }))
    );
    for (const [i, [pm25, level]] of cases.entries()) {
      const at = new Date(Date.UTC(2025, 6, 1, i)).toISOString();
      const res = await request(app).get(`${STATIONS}/KYIV-01/aqi?at=${at}`).expect(200);
      expect(res.body.data.subindices.pm25.value).toBe(pm25);
      expect(res.body.data.level).toBe(level);
    }
  });

  it('8-годинне середнє O₃: 5 годин у вікні – не рахується, 6 – рахується', async () => {
    // 2025-08-10 і 2025-08-12 за Києвом (UTC+3)
    await Measurement.insertMany([
      ...hours('2025-08-09T21:00:00Z', 5, () => ({ o3: 100 })),
      ...hours('2025-08-11T21:00:00Z', 6, () => ({ o3: 100 }))
    ]);
    await process2025();
    const res = await request(app).get(`${STATIONS}/KYIV-01/daily?year=2025&pollutant=o3`).expect(200);
    const day = date => res.body.data.data.find(d => d.date === date).pollutants.o3;
    expect(day('2025-08-10').max8h).toBeNull();
    expect(day('2025-08-12').max8h).toBeCloseTo(100, 6);
  });

  it('річна повнота: 7884 години (рівно 90 %) – річне середнє є, 7883 – немає', async () => {
    await request(app).post(STATIONS).send(lvivStation).expect(201);
    const { from } = yearRange(2025);
    await Measurement.insertMany(
      Array.from({ length: 7884 }, (_, h) => ({
        station_id: 'LVIV-01',
        measured_at: new Date(from.getTime() + h * HOUR),
        pm25: 10 + (h % 2)
      }))
    );
    const full = await request(app).get(`${STATIONS}/LVIV-01/annual?year=2025`).expect(200);
    expect(full.body.data.pollutants.pm25.hourly).toMatchObject({ valid: 7884, complete: true });
    expect(full.body.data.pollutants.pm25.annual_mean).toBeCloseTo(10.5, 2);

    await Measurement.deleteOne({ station_id: 'LVIV-01', measured_at: from });
    const short = await request(app).get(`${STATIONS}/LVIV-01/annual?year=2025`).expect(200);
    expect(short.body.data.pollutants.pm25.hourly).toMatchObject({ valid: 7883, complete: false });
    expect(short.body.data.pollutants.pm25.annual_mean).toBeNull();
  });

  it('немає добових агрегатів – медіана і перцентилі не визначаються (null), а не 0', async () => {
    const res = await request(app).get(`${STATIONS}/KYIV-01/annual?year=2025`).expect(200);
    expect(res.body.data.pollutants.pm10.daily).toMatchObject({ complete_days: 0, median: null, p90_4: null, p98: null, min: null, max: null });
  });
});
