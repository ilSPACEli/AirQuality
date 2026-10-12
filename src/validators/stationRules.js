import { body } from 'express-validator';
import { MEASUREMENT_FIELDS, UKRAINE_BOUNDS } from '../config/constants.js';
import {
  paginationRules,
  queryParam,
  stationCode,
  stationCodeMessage,
  stationCodeParam
} from './common.js';

// partial = true для PATCH: усі поля необов'язкові
function stationFields({ partial }) {
  const field = (name, message) => {
    const chain = body(name, message);
    return partial ? chain.optional() : chain.exists({ values: 'null' }).bail();
  };

  return [
    field('name', "Назва станції обов'язкова, до 120 символів")
      .isString()
      .bail()
      .trim()
      .notEmpty()
      .isLength({ max: 120 }),
    field('city', "Місто обов'язкове, до 60 символів")
      .isString()
      .bail()
      .trim()
      .notEmpty()
      .isLength({ max: 60 }),
    field('latitude', 'Широта: число в межах України (44.0–52.5)')
      .isFloat(UKRAINE_BOUNDS.latitude)
      .toFloat(),
    field('longitude', 'Довгота: число в межах України (22.0–40.5)')
      .isFloat(UKRAINE_BOUNDS.longitude)
      .toFloat(),
    body('active', 'active: очікується true або false').optional().isBoolean({ strict: true }),
    body('measurement_types', 'measurement_types: очікується масив').optional().isArray(),
    body('measurement_types.*', `Допустимі типи вимірювань: ${MEASUREMENT_FIELDS.join(', ')}`).isIn(
      MEASUREMENT_FIELDS
    )
  ];
}

export const listStationsRules = [
  queryParam('city', 'city: очікується непорожній рядок').isString().trim().notEmpty(),
  queryParam('active', 'active: очікується true або false').isBoolean().toBoolean(),
  ...paginationRules
];

export const stationIdRules = [stationCodeParam];

export const createStationRules = [
  stationCode(body('code', stationCodeMessage).exists({ values: 'null' }).bail()),
  ...stationFields({ partial: false })
];

export const replaceStationRules = [stationCodeParam, ...stationFields({ partial: false })];

export const patchStationRules = [stationCodeParam, ...stationFields({ partial: true })];
