// Імпорт актуальних даних SaveEcoBot (CC BY 4.0):
//   npm run import                      усі станції
//   npm run import -- --city=Kyiv       лише одне місто
//   npm run import -- --file=dump.json  зі збереженого знімка замість мережі
//   npm run import -- --dry-run         лише розбір і статистика, без запису в базу
import { readFile } from 'node:fs/promises';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { upsertMeasurements } from '../src/services/measurementService.js';
import { mapSaveEcoBot } from '../src/services/saveEcoBotMapper.js';
import { upsertStations } from '../src/services/stationService.js';
import { fetchJson } from '../src/utils/fetchWithRetry.js';
import { parseArgs } from './args.js';

async function loadSource({ file }) {
  if (!file) return fetchJson(env.saveEcoBotApi);

  const raw = await readFile(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Некоректний JSON у ${file}`);
  }
}

const args = parseArgs();
const dryRun = args['dry-run'] === true;

try {
  const raw = await loadSource(args);
  if (!Array.isArray(raw)) throw new Error('Очікувався масив станцій');

  const { stations, measurements, skippedStations, rejectedValues } = mapSaveEcoBot(raw, {
    city: typeof args.city === 'string' ? args.city : undefined
  });

  console.log(`Отримано станцій: ${raw.length}, придатних: ${stations.length}, пропущено: ${skippedStations}`);
  console.log(`Вимірювань: ${measurements.length}, відхилено значень поза діапазоном: ${rejectedValues}`);

  if (dryRun) {
    console.log('Режим --dry-run: у базу нічого не записано');
  } else {
    await connectDB();
    // Спершу станції, потім вимірювання, що на них посилаються
    const savedStations = await upsertStations(stations);
    const savedMeasurements = await upsertMeasurements(measurements);

    console.log(`Станції:     нових ${savedStations.upserted}, вже існували ${savedStations.matched}`);
    console.log(`Вимірювання: нових ${savedMeasurements.upserted}, вже існували ${savedMeasurements.matched}`);
  }
} catch (err) {
  console.error(`Помилка імпорту: ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
