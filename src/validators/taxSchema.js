import { loadNorms } from '../eco/norms/index.js';
import { RATES_FILE } from '../eco/v4-tax/index.js';
import { z } from './zod.js';

const mass = name =>
  z
    .number({ error: `${name}: очікується число (т)` })
    .min(0, { error: `${name}: маса не може бути від'ємною` })
    .max(1e9, { error: `${name}: завелике значення` });

const HAZARD = ['I', 'II', 'III', 'IV'];

const emission = z.object({
  code: z.string().trim().toUpperCase().optional(),
  name: z.string().trim().max(200).optional(),
  hazard_class: z.enum(HAZARD, { error: 'hazard_class: одне з I, II, III, IV' }).optional(),
  obrv_mg_m3: z.number().positive({ error: 'obrv_mg_m3: додатне число' }).optional(),
  mass_t: mass('mass_t'),
  annual_mass_t: mass('annual_mass_t').optional()
});

const discharge = z.object({
  code: z.string().trim().toUpperCase().optional(),
  name: z.string().trim().max(200).optional(),
  gdk_mg_l: z.number().positive({ error: 'gdk_mg_l: додатне число' }).optional(),
  mass_t: mass('mass_t'),
  receiver: z.enum(['river', 'pond_lake', 'other'], { error: 'receiver: river, pond_lake або other' }).default('river')
});

const wasteItem = z.object({
  name: z.string().trim().max(200).optional(),
  hazard_class: z.enum([...HAZARD, 'IV_MINING', 'NONE'], {
    error: 'hazard_class: I, II, III, IV, IV_MINING або NONE'
  }),
  mass_t: mass('mass_t'),
  within_settlement: z.boolean().default(false),
  unprotected_dump: z.boolean().default(false)
});

// Речовини, що мають власну ставку: п. 243.1 і 243.4 (CO2) для викидів, п. 245.1 для скидів
const NAMED_BASIS = { air: ['243.1', '243.4'], water: ['245.1'] };
const codesOf = direction =>
  new Set(
    loadNorms(RATES_FILE)
      .records.filter(r => r.direction === direction && NAMED_BASIS[direction].includes(r.basis))
      .map(r => r.code)
  );

export const taxQuarterBody = z
  .object({
    enterprise: z.object({
      name: z.string().trim().min(1, { error: 'enterprise.name: назва підприємства обов’язкова' }).max(200),
      edrpou: z.string().regex(/^\d{8}$/, { error: 'enterprise.edrpou: 8 цифр' }).optional(),
      region: z.string().trim().max(100).optional()
    }),
    year: z.number().int().min(2015, { error: 'year: не раніше 2015' }).max(2100),
    quarter: z.number().int().min(1, { error: 'quarter: від 1 до 4' }).max(4, { error: 'quarter: від 1 до 4' }),
    emissions: z.array(emission).max(200).default([]),
    discharges: z.array(discharge).max(200).default([]),
    waste: z.array(wasteItem).max(200).default([])
  })
  .superRefine((data, ctx) => {
    const airCodes = codesOf('air');
    const waterCodes = codesOf('water');

    data.emissions.forEach((e, i) => {
      const ways = [e.code, e.hazard_class, e.obrv_mg_m3].filter(v => v !== undefined).length;
      if (ways !== 1) {
        ctx.addIssue({ code: 'custom', path: ['emissions', i], message: 'Вкажіть рівно одне: code, hazard_class або obrv_mg_m3' });
      }
      if (e.code && !airCodes.has(e.code)) {
        ctx.addIssue({ code: 'custom', path: ['emissions', i, 'code'], message: `Невідома речовина «${e.code}». Допустимі: ${[...airCodes].join(', ')}` });
      }
      if (e.code === 'CO2' && e.annual_mass_t === undefined) {
        ctx.addIssue({ code: 'custom', path: ['emissions', i, 'annual_mass_t'], message: 'Для CO2 потрібен річний обсяг викидів (поріг 500 т)' });
      }
      if ((e.hazard_class || e.obrv_mg_m3) && !e.name) {
        ctx.addIssue({ code: 'custom', path: ['emissions', i, 'name'], message: 'Для речовини без коду вкажіть назву' });
      }
    });

    data.discharges.forEach((d, i) => {
      if ((d.code === undefined) === (d.gdk_mg_l === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['discharges', i], message: 'Вкажіть рівно одне: code або gdk_mg_l' });
      }
      if (d.code && !waterCodes.has(d.code)) {
        ctx.addIssue({ code: 'custom', path: ['discharges', i, 'code'], message: `Невідома речовина «${d.code}». Допустимі: ${[...waterCodes].join(', ')}` });
      }
    });

    if (data.emissions.length + data.discharges.length + data.waste.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['emissions'], message: 'Потрібна хоча б одна позиція викидів, скидів або відходів' });
    }
  });
