import { Router } from 'express';
import * as controller from '../controllers/measurementController.js';
import { validate } from '../middleware/validate.js';
import {
  createStationMeasurementRules,
  listStationMeasurementsRules
} from '../validators/measurementRules.js';

// mergeParams дає доступ до :id батьківського маршруту /stations/:id
const router = Router({ mergeParams: true });

// /api/v1/stations/:id/measurements
router
  .route('/')
  .get(validate(listStationMeasurementsRules), controller.listStationMeasurements)
  .post(validate(createStationMeasurementRules), controller.createStationMeasurement);

export default router;
