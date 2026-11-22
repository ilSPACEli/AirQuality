import { Router } from 'express';
import * as controller from '../controllers/ecoController.js';
import { validateZod } from '../middleware/validateZod.js';
import {
  alertsQuery,
  aqiQuery,
  dailyQuery,
  hourlyQuery,
  stationParams,
  statsQuery,
  yearQuery
} from '../validators/ecoSchemas.js';

// /api/v1/stations/:id/…: показники якості повітря станції
const router = Router({ mergeParams: true });

const params = stationParams;

router.get('/stats', validateZod({ params, query: statsQuery }), controller.getStats);
router.get('/annual', validateZod({ params, query: yearQuery }), controller.getAnnual);
router.get('/daily', validateZod({ params, query: dailyQuery }), controller.getDaily);
router.get('/hourly-stats', validateZod({ params, query: hourlyQuery }), controller.getHourlyStats);
router.get('/aqi', validateZod({ params, query: aqiQuery }), controller.getAqi);
router.get('/alerts', validateZod({ params, query: alertsQuery }), controller.listAlerts);
// Очищення, добові агрегати й alerts за рік (те саме, що npm run process:year)
router.post('/process', validateZod({ params, query: yearQuery }), controller.processYear);

export default router;
