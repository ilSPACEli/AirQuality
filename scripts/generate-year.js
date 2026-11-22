// Річний ряд годинних вимірювань для станції:
//   npm run seed:year -- --station KYIV-01 --year 2025
// Після генерації запустіть обробку: npm run process:year -- --station KYIV-01 --year 2025
import { connectDB, disconnectDB } from '../src/config/database.js';
import { POLLUTANTS } from '../src/config/constants.js';
import { yearRange } from '../src/eco/time.js';
import { Measurement } from '../src/models/Measurement.js';
import { Station } from '../src/models/Station.js';
import { upsertStations } from '../src/services/stationService.js';
import { parseArgs } from './args.js';
import { STATIONS } from './stations.js';
import { generateYear } from './year-generator.js';

const args = parseArgs();
const stationId = String(args.station ?? 'KYIV-01').toUpperCase();
const year = Number(args.year ?? 2025);

try {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('--year: рік від 2000 до 2100');
  await connectDB();

  // Станцію зі списку seed створюємо або оновлюємо; іншу шукаємо в базі
  const known = STATIONS.find(s => s.code === stationId);
  if (known) {
    await upsertStations([{ ...known, measurement_types: [...POLLUTANTS, 'temperature', 'humidity'] }]);
  } else if (!(await Station.exists({ code: stationId }))) {
    throw new Error(`Станцію ${stationId} не знайдено. Створіть її через API або оберіть одну зі списку seed`);
  }

  const { records, planted, expectedHours } = generateYear({ stationId, year });

  // Рік генерується повністю, тому попередні записи станції за цей рік замінюються
  const { from, to } = yearRange(year);
  const removed = await Measurement.deleteMany({ station_id: stationId, measured_at: { $gte: from, $lt: to } });
  for (let i = 0; i < records.length; i += 2000) {
    await Measurement.insertMany(records.slice(i, i + 2000), { ordered: false });
  }

  console.log(`Станція ${stationId}, ${year} рік (Europe/Kyiv)`);
  console.log(`Годин у році: ${expectedHours}, записано: ${records.length}, видалено старих: ${removed.deletedCount}`);
  console.log(`Відключення станції: ${planted.outage_hours} год (${((planted.outage_hours / expectedHours) * 100).toFixed(1)} %)`);
  console.log('Речовина  пропуски  некоректні');
  for (const p of POLLUTANTS) {
    const missing = planted.outage_hours + planted.gaps[p];
    console.log(`${p.padEnd(8)}  ${String(missing).padStart(5)} (${((missing / expectedHours) * 100).toFixed(1)} %)  ${String(planted.invalid[p]).padStart(4)}`);
  }
  console.log(`«Залиплий» сенсор NO2: ${planted.stuck} год`);
} catch (err) {
  console.error(`Помилка генерації: ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
