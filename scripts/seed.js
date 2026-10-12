// Наповнення бази демонстраційними даними: npm run seed [-- --days=3]
import { connectDB, disconnectDB } from '../src/config/database.js';
import { upsertMeasurements } from '../src/services/measurementService.js';
import { upsertStations } from '../src/services/stationService.js';
import { parseArgs } from './args.js';

const STATIONS = [
  { code: 'KYIV-01', name: 'Київ, вул. Хрещатик', city: 'Kyiv', latitude: 50.4501, longitude: 30.5234 },
  { code: 'KYIV-02', name: 'Київ, Оболонь', city: 'Kyiv', latitude: 50.5013, longitude: 30.4982 },
  { code: 'LVIV-01', name: 'Львів, пл. Ринок', city: 'Lviv', latitude: 49.8419, longitude: 24.0315 },
  { code: 'KHARKIV-01', name: 'Харків, майдан Свободи', city: 'Kharkiv', latitude: 50.0045, longitude: 36.2312 },
  { code: 'ODESA-01', name: 'Одеса, Приморський бульвар', city: 'Odesa', latitude: 46.4857, longitude: 30.7438 },
  { code: 'DNIPRO-01', name: 'Дніпро, просп. Яворницького', city: 'Dnipro', latitude: 48.4647, longitude: 35.0462 },
  { code: 'ZAPORIZHZHIA-01', name: 'Запоріжжя, просп. Соборний', city: 'Zaporizhzhia', latitude: 47.8388, longitude: 35.1396 },
  { code: 'VINNYTSIA-01', name: 'Вінниця, вул. Соборна', city: 'Vinnytsia', latitude: 49.2331, longitude: 28.4682 },
  { code: 'IF-01', name: 'Івано-Франківськ, вул. Незалежності', city: 'Ivano-Frankivsk', latitude: 48.9226, longitude: 24.7111 },
  { code: 'CHERNIHIV-01', name: 'Чернігів, Красна площа', city: 'Chernihiv', latitude: 51.4982, longitude: 31.2893 }
].map(station => ({
  ...station,
  measurement_types: ['pm25', 'pm10', 'no2', 'temperature', 'humidity']
}));

// Детермінований генератор: однаковий вхід дає однакові значення при повторному запуску
function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10_000;
  return x - Math.floor(x);
}

const round = value => Math.round(value * 10) / 10;

function generateMeasurements(days) {
  const hourMs = 3_600_000;
  const lastHour = Math.floor(Date.now() / hourMs) * hourMs; // межа години в UTC
  const records = [];

  STATIONS.forEach((station, stationIndex) => {
    for (let h = 0; h < days * 24; h++) {
      const time = lastHour - h * hourMs;
      const hourOfDay = new Date(time).getUTCHours();
      const seed = time / hourMs + stationIndex * 1000;
      const rushHour = hourOfDay >= 5 && hourOfDay <= 8 ? 1.6 : 1; // ранковий пік
      const pm25 = round((6 + stationIndex * 1.5 + pseudoRandom(seed) * 22) * rushHour);

      records.push({
        station_id: station.code,
        measured_at: new Date(time),
        source: 'seed',
        pm25,
        pm10: round(pm25 * (1.3 + pseudoRandom(seed + 1) * 0.5)),
        // Кожне двадцяте значення NO2 відсутнє: сенсор не передав дані (null, а не 0)
        no2: h % 20 === 7 ? null : round(8 + pseudoRandom(seed + 2) * 30),
        temperature: round(9 + Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI) * 5 + pseudoRandom(seed + 3) * 2),
        humidity: round(55 + pseudoRandom(seed + 4) * 35)
      });
    }
  });

  return records;
}

const args = parseArgs();
const days = Number(args.days) || 3;

try {
  await connectDB();
  const stations = await upsertStations(STATIONS);
  const measurements = await upsertMeasurements(generateMeasurements(days));

  console.log(`Станції:     нових ${stations.upserted}, вже існували ${stations.matched}`);
  console.log(`Вимірювання: нових ${measurements.upserted}, вже існували ${measurements.matched}`);
} catch (err) {
  console.error(`Помилка seed: ${err.message}`);
  process.exitCode = 1; // за кодом виходу CI та планувальник розуміють, чи впорався скрипт
} finally {
  await disconnectDB();
}
