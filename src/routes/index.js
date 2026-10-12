import { Router } from 'express';
import mongoose from 'mongoose';
import measurementsRouter from './measurements.js';
import stationsRouter from './stations.js';

const router = Router();

// Стан сервісу та з'єднання з базою даних
router.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    data: { status: connected ? 'ok' : 'unavailable', uptime: Math.round(process.uptime()) }
  });
});

router.use('/stations', stationsRouter);
router.use('/measurements', measurementsRouter);

export default router;
