// Генератор річного ряду годинних вимірювань (чиста функція, без БД).
// Добовий цикл + сезонність + шум, 5–15 % пропусків (окремі години і блоки по кілька діб),
// 4 епізоди пікових концентрацій, некоректні значення (від'ємні, вище фізичних меж)
// і один «залиплий» сенсор. Однаковий вхід дає однаковий ряд (детермінований ГПВЧ)
import { HOUR_MS, kyivHour, yearRange } from '../src/eco/time.js';

// mulberry32: простий детермінований генератор псевдовипадкових чисел
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const gaussian = random => {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};
// Логнормальний шум: множник із медіаною 1, концентрації не стають від'ємними
const noise = (random, sigma) => Math.exp(sigma * gaussian(random) - (sigma * sigma) / 2);
const bump = (x, center, width) => Math.exp(-((x - center) ** 2) / width);
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

// Епізоди: день року (0 = 1 січня), тривалість у добах, множники для речовин
export const EPISODES = [
  { name: 'Зимовий смог', startDay: 17, days: 3, factors: { pm25: 3, pm10: 2.5, no2: 1.8, co: 2.5, so2: 2 } },
  { name: 'Весняні пожежі сухої трави', startDay: 99, days: 3, factors: { pm25: 3, pm10: 4, co: 1.8 } },
  { name: 'Літня спека (фотохімічний смог)', startDay: 202, days: 4, factors: { o3: 1.6, no2: 1.2 } },
  { name: 'Осінній дим', startDay: 277, days: 2, factors: { pm25: 5, pm10: 4, co: 2 } }
];

// Відключення станції: документів за ці години немає взагалі
export const OUTAGES = [
  { startDay: 50, days: 3 },
  { startDay: 153, days: 5 },
  { startDay: 315, days: 2 }
];

// Відмова окремого сенсора: значення речовини null
export const SENSOR_GAPS = [{ pollutant: 'so2', startDay: 250, days: 4 }];

// «Залиплий» сенсор NO2: однакове значення 8 годин поспіль
export const STUCK = { pollutant: 'no2', day: 61, fromHour: 2, hours: 8, value: 41.3 };

export const RANDOM_GAP_SHARE = 0.035;
export const INVALID_PER_POLLUTANT = 6;

const PHYSICAL_MAX = { pm25: 1000, pm10: 1500, no2: 1000, so2: 1000, o3: 800, co: 100 };

function episodeFactor(pollutant, dayFloat) {
  let factor = 1;
  for (const e of EPISODES) {
    const k = e.factors[pollutant];
    if (!k || dayFloat < e.startDay || dayFloat >= e.startDay + e.days) continue;
    const phase = (dayFloat - e.startDay) / e.days; // 0…1, пік посередині епізоду
    factor *= 1 + (k - 1) * Math.sin(Math.PI * phase);
  }
  return factor;
}

const inBlock = (dayFloat, block) => dayFloat >= block.startDay && dayFloat < block.startDay + block.days;

export function generateYear({ stationId, year }) {
  const random = createRandom(hashSeed(`${stationId}:${year}`));
  const { from, to } = yearRange(year);
  const records = [];
  const planted = { outage_hours: 0, gaps: {}, invalid: {}, stuck: 0 };
  for (const p of Object.keys(PHYSICAL_MAX)) {
    planted.gaps[p] = 0;
    planted.invalid[p] = 0;
  }

  for (let t = from.getTime(); t < to.getTime(); t += HOUR_MS) {
    const measured_at = new Date(t);
    const dayFloat = (t - from.getTime()) / (24 * HOUR_MS);
    const day = Math.floor(dayFloat);
    const h = kyivHour(measured_at);

    if (OUTAGES.some(b => inBlock(dayFloat, b))) {
      planted.outage_hours += 1;
      continue;
    }

    // Сезонність: winter = 1 у середині січня, −1 у середині липня (опалювальний сезон)
    const winter = Math.cos((2 * Math.PI * (day - 15)) / 365);
    const traffic = 0.7 + 0.6 * bump(h, 8, 3) + 0.5 * bump(h, 18, 4);
    const heating = 0.9 + 0.25 * bump(h, 8, 4) + 0.35 * bump(h, 20, 6);
    const sun = 0.55 + 0.7 * bump(h, 15, 10);

    const pm25 = 14 * (1 + 0.35 * winter) * heating * noise(random, 0.35);
    const values = {
      pm25,
      pm10: pm25 * (1.5 + 0.4 * random()) + 4 * ((1 - winter) / 2) * random(),
      no2: 28 * (1 + 0.2 * winter) * traffic * noise(random, 0.3),
      so2: 7 * (1 + 0.5 * winter) * noise(random, 0.4),
      o3: 55 * (1 - 0.45 * winter) * sun * noise(random, 0.2),
      co: 0.45 * (1 + 0.4 * winter) * traffic * noise(random, 0.3)
    };

    const record = { station_id: stationId, measured_at, source: 'generator' };
    for (const [p, v] of Object.entries(values)) {
      record[p] = round(v * episodeFactor(p, dayFloat), p === 'co' ? 2 : 1);
      const sensorGap = SENSOR_GAPS.some(g => g.pollutant === p && inBlock(dayFloat, g));
      if (sensorGap || random() < RANDOM_GAP_SHARE) {
        record[p] = null;
        planted.gaps[p] += 1;
      }
    }
    if (day === STUCK.day && h >= STUCK.fromHour && h < STUCK.fromHour + STUCK.hours) {
      record[STUCK.pollutant] = STUCK.value;
      planted.stuck += 1;
    }
    record.temperature = round(8 - 12 * winter + 4 * bump(h, 15, 12) + gaussian(random), 1);
    record.humidity = round(Math.min(100, Math.max(20, 70 + 10 * winter - 15 * bump(h, 15, 12) + 5 * gaussian(random))), 1);
    records.push(record);
  }

  // Некоректні значення: половина від'ємні, половина вище фізичної межі сенсора
  for (const [p, max] of Object.entries(PHYSICAL_MAX)) {
    for (let i = 0; i < INVALID_PER_POLLUTANT; i++) {
      const record = records[Math.floor(random() * records.length)];
      if (record[p] === null) continue;
      record[p] = i % 2 === 0 ? -round(1 + random() * 20, 1) : round(max * (1.2 + random()), 1);
      planted.invalid[p] += 1;
    }
  }

  return { records, planted, expectedHours: (to - from) / HOUR_MS };
}
