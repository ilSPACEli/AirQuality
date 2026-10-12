import { API_PREFIX } from '../config/constants.js';
import * as stationService from '../services/stationService.js';

export async function listStations(req, res) {
  const { data, meta } = await stationService.listStations(req.valid.query);
  res.json({ success: true, data, meta });
}

export async function createStation(req, res) {
  const station = await stationService.createStation(req.valid.body);
  res
    .status(201)
    .location(`${API_PREFIX}/stations/${station.code}`)
    .json({ success: true, data: station });
}

export async function getStation(req, res) {
  const station = await stationService.getStation(req.valid.params.id);
  res.json({ success: true, data: station });
}

export async function replaceStation(req, res) {
  const station = await stationService.replaceStation(req.valid.params.id, req.valid.body);
  res.json({ success: true, data: station });
}

export async function patchStation(req, res) {
  const station = await stationService.patchStation(req.valid.params.id, req.valid.body);
  res.json({ success: true, data: station });
}

export async function deleteStation(req, res) {
  await stationService.deleteStation(req.valid.params.id);
  res.status(204).end(); // тіла немає, тому end(), а не json()
}
