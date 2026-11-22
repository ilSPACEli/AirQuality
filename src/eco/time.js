
export const TIME_ZONE = 'Europe/Kyiv';
export const HOUR_MS = 3_600_000;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function kyivParts(date) {
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) parts[type] = value;
  return parts;
}

// Місцева дата у вигляді 'YYYY-MM-DD'
export function kyivDateKey(date) {
  const p = kyivParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export const kyivHour = date => Number(kyivParts(date).hour);

// Зсув Києва відносно UTC у хвилинах (+120 узимку, +180 улітку)
function offsetMinutes(date) {
  const p = kyivParts(date);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const minute = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((wall - minute) / 60_000);
}

// Момент UTC, що відповідає місцевій півночі дати (month: 1–12)
export function kyivMidnight(year, month, day) {
  const wall = Date.UTC(year, month - 1, day);
  let t = wall - offsetMinutes(new Date(wall)) * 60_000;
  t = wall - offsetMinutes(new Date(t)) * 60_000; // уточнення, якщо зсув на межі змінився
  return new Date(t);
}

// Календарний рік за місцевим часом: [from, to)
export function yearRange(year) {
  return { from: kyivMidnight(year, 1, 1), to: kyivMidnight(year + 1, 1, 1) };
}

export const isLeapYear = year => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInYear = year => (isLeapYear(year) ? 366 : 365);
export const hoursInYear = year => daysInYear(year) * 24;
