import { Router } from 'express';
import * as controller from '../controllers/stationController.js';
import { getStationStatistics } from '../controllers/measurementController.js';
import { validate } from '../middleware/validate.js';
import { stationStatisticsRules } from '../validators/measurementRules.js';
import {
  createStationRules,
  listStationsRules,
  patchStationRules,
  replaceStationRules,
  stationIdRules
} from '../validators/stationRules.js';
import stationMeasurementsRouter from './stationMeasurements.js';

const router = Router();

// /api/v1/stations: колекція
router
  .route('/')
  .get(validate(listStationsRules), controller.listStations)
  .post(validate(createStationRules), controller.createStation);

// /api/v1/stations/:id: одна станція, :id це її код (наприклад KYIV-01)
router
  .route('/:id')
  .get(validate(stationIdRules), controller.getStation)
  .put(validate(replaceStationRules), controller.replaceStation)
  .patch(validate(patchStationRules), controller.patchStation)
  .delete(validate(stationIdRules), controller.deleteStation);

// Агреговані показники станції
router.get('/:id/statistics', validate(stationStatisticsRules), getStationStatistics);

// Вкладений ресурс: вимірювання конкретної станції
router.use('/:id/measurements', stationMeasurementsRouter);

export default router;
