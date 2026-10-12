import { API_PREFIX } from '../config/constants.js';
import * as measurementService from '../services/measurementService.js';
import { assertStationExists } from '../services/stationService.js';

function sendCreated(res, measurement) {
  res
    .status(201)
    .location(`${API_PREFIX}/measurements/${measurement.id}`)
    .json({ success: true, data: measurement });
}

export async function listMeasurements(req, res) {
  const { data, meta } = await measurementService.listMeasurements(req.valid.query);
  res.json({ success: true, data, meta });
}

export async function createMeasurement(req, res) {
  const measurement = await measurementService.createMeasurement(req.valid.body);
  sendCreated(res, measurement);
}

export async function getMeasurement(req, res) {
  const measurement = await measurementService.getMeasurement(req.valid.params.id);
  res.json({ success: true, data: measurement });
}

export async function replaceMeasurement(req, res) {
  const measurement = await measurementService.replaceMeasurement(
    req.valid.params.id,
    req.valid.body
  );
  res.json({ success: true, data: measurement });
}

export async function deleteMeasurement(req, res) {
  await measurementService.deleteMeasurement(req.valid.params.id);
  res.status(204).end();
}

// Вкладений ресурс: /stations/:id/measurements

export async function listStationMeasurements(req, res) {
  const station = req.valid.params.id;
  await assertStationExists(station);
  const { data, meta } = await measurementService.listMeasurements({ ...req.valid.query, station });
  res.json({ success: true, data, meta });
}

export async function createStationMeasurement(req, res) {
  const measurement = await measurementService.createMeasurement({
    ...req.valid.body,
    station_id: req.valid.params.id
  });
  sendCreated(res, measurement);
}

export async function getStationStatistics(req, res) {
  const data = await measurementService.getStationStatistics(req.valid.params.id, req.valid.query);
  res.json({ success: true, data });
}
