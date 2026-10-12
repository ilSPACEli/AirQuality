import { Router } from 'express';
import * as controller from '../controllers/measurementController.js';
import { validate } from '../middleware/validate.js';
import {
  createMeasurementRules,
  listMeasurementsRules,
  measurementIdRules,
  replaceMeasurementRules
} from '../validators/measurementRules.js';

const router = Router();

// /api/v1/measurements: колекція з фільтрами, сортуванням і пагінацією
router
  .route('/')
  .get(validate(listMeasurementsRules), controller.listMeasurements)
  .post(validate(createMeasurementRules), controller.createMeasurement);

// /api/v1/measurements/:id: одне вимірювання, :id це ObjectId
router
  .route('/:id')
  .get(validate(measurementIdRules), controller.getMeasurement)
  .put(validate(replaceMeasurementRules), controller.replaceMeasurement)
  .delete(validate(measurementIdRules), controller.deleteMeasurement);

export default router;
