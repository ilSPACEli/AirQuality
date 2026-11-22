import { Router } from 'express';
import * as tax from '../controllers/taxController.js';
import { validateZod } from '../middleware/validateZod.js';
import { taxQuarterBody } from '../validators/taxSchema.js';

// /api/v1/eco/…: розрахунковий endpoint частини Б (варіант 4)
const router = Router();

// Варіант 4: екологічний податок за квартал
router.get('/tax/rates', tax.listRates);
router.post('/tax/quarter', validateZod({ body: taxQuarterBody }), tax.calculateQuarterTax);

export default router;
