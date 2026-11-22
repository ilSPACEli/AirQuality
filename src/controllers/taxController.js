import { loadNorms } from '../eco/norms/index.js';
import { quarterTax, RATES_FILE, TaxInputError, taxPassport } from '../eco/v4-tax/index.js';
import { ApiError } from '../utils/ApiError.js';

// POST /api/v1/eco/tax/quarter – екологічний податок за квартал (варіант 4)
export function calculateQuarterTax(req, res) {
  const input = req.valid.body;
  try {
    const data = quarterTax(input);
    res.json({ success: true, data, passport: taxPassport(input, data) });
  } catch (err) {
    if (err instanceof TaxInputError) {
      throw ApiError.unprocessable('Дані не пройшли валідацію', [{ field: err.field, message: err.message }]);
    }
    throw err;
  }
}

// GET /api/v1/eco/tax/rates – довідник ставок для форми
export function listRates(req, res) {
  const rates = loadNorms(RATES_FILE);
  const pick = ({ code, name, rate_uah_per_t, source, valid_from }) => ({ code, name, rate_uah_per_t, source, valid_from });
  res.json({
    success: true,
    data: {
      version: rates.version,
      air: rates.records.filter(r => r.direction === 'air').map(r => ({ ...pick(r), basis: r.basis, hazard_class: r.hazard_class })),
      water: rates.records.filter(r => r.direction === 'water').map(r => ({ ...pick(r), basis: r.basis })),
      waste: rates.records.filter(r => r.direction === 'waste').map(r => ({ ...pick(r), hazard_class: r.hazard_class })),
      coefficients: rates.coefficients
    }
  });
}
