// Обробка річного ряду станції: очищення → добові агрегати (daily_stats) → перевищення (alerts)
//   npm run process:year -- --station KYIV-01 --year 2025
import { connectDB, disconnectDB } from '../src/config/database.js';
import { POLLUTANTS } from '../src/config/constants.js';
import { processStationYear } from '../src/services/ecoService.js';
import { parseArgs } from './args.js';

const args = parseArgs();
const stationId = String(args.station ?? 'KYIV-01').toUpperCase();
const year = Number(args.year ?? 2025);

try {
  await connectDB();
  const report = await processStationYear(stationId, year);
  const { cleaning, daily, alerts } = report;

  console.log(`Станція ${stationId}, ${year} рік: записів ${cleaning.records} з ${cleaning.expected_hours} годин`);
  console.log('\nОчищення (кількість годинних значень):');
  console.log('Речовина  valid  suspect  invalid  missing  межа');
  for (const p of POLLUTANTS) {
    const s = cleaning.summary[p];
    console.log(
      `${p.padEnd(8)} ${String(s.valid).padStart(6)} ${String(s.suspect).padStart(8)} ${String(s.invalid).padStart(8)} ${String(s.missing).padStart(8)}  ${s.physical_max} ${s.unit}`
    );
  }
  console.log(`\nДобові агрегати: ${daily.days} діб, повних (≥ ${daily.min_hours} год):`);
  for (const p of POLLUTANTS) console.log(`  ${p.padEnd(6)} ${daily.complete_days[p]}`);
  console.log(`\nПеревищення записано в alerts: ${alerts.total}`);
  for (const [p, counts] of Object.entries(alerts.by_pollutant)) {
    console.log(`  ${p.padEnd(6)} ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
} catch (err) {
  console.error(`Помилка обробки: ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
