import * as ecoService from '../services/ecoService.js';

const station = req => req.valid.params.id;

export async function getAnnual(req, res) {
  const data = await ecoService.getAnnualIndicators(station(req), req.valid.query.year);
  res.json({ success: true, data });
}

export async function getDaily(req, res) {
  const data = await ecoService.getDailyStats(station(req), req.valid.query);
  res.json({ success: true, data });
}

export async function getHourlyStats(req, res) {
  const data = await ecoService.getHourlyStats(station(req), req.valid.query);
  res.json({ success: true, data });
}

// Статистика за період: hour – годинні значення за [from, to), day – добові агрегати, year – річні показники
export async function getStats(req, res) {
  const { period, ...query } = req.valid.query;
  const handlers = {
    hour: () => ecoService.getHourlyStats(station(req), query),
    day: () => ecoService.getDailyStats(station(req), query),
    year: () => ecoService.getAnnualIndicators(station(req), query.year)
  };
  res.json({ success: true, data: await handlers[period]() });
}

export async function getAqi(req, res) {
  const data = await ecoService.getAqiAt(station(req), req.valid.query.at);
  res.json({ success: true, data });
}

export async function listAlerts(req, res) {
  const { data, meta } = await ecoService.listAlerts(station(req), req.valid.query);
  res.json({ success: true, data, meta });
}

export async function processYear(req, res) {
  const data = await ecoService.processStationYear(station(req), req.valid.query.year);
  res.json({ success: true, data });
}
