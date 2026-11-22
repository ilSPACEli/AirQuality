// Наповнення бази демонстраційними даними: npm run seed [-- --days=3]
import { connectDB, disconnectDB } from '../src/config/database.js';
import { upsertMeasurements } from '../src/services/measurementService.js';
import { upsertStations } from '../src/services/stationService.js';
import { parseArgs } from './args.js';
import { STATIONS } from './stations.js';

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
