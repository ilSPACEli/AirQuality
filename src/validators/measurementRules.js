import { body, param } from 'express-validator';
import {
  MEASUREMENT_FIELDS,
  MEASUREMENT_SORT_FIELDS,
  POLLUTANTS,
  RANGES
} from '../config/constants.js';
import {
  paginationRules,
  periodRules,
  queryParam,
  stationCode,
  stationCodeMessage,
  stationCodeParam
} from './common.js';

const CURSOR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z(_[a-f0-9]{24})?$/;
const SORT_VALUES = MEASUREMENT_SORT_FIELDS.flatMap(field => [field, `-${field}`]);

const measurementIdParam = param('id', 'Некоректний ідентифікатор вимірювання').isMongoId();

const stationIdBody = stationCode(
  body('station_id', `station_id обов'язковий. ${stationCodeMessage}`)
    .exists({ values: 'null' })
    .bail()
);

const measuredAt = body('measured_at', "measured_at обов'язковий: очікується формат ISO 8601")
  .exists({ values: 'null' })
  .bail()
  .isString()
  .bail()
  .isISO8601({ strict: true })
  .bail()
  .toDate()
  .custom(value => value <= new Date())
  .withMessage('Час вимірювання не може бути в майбутньому');

// optional + nullable: null означає «сенсор не передав дані», це не те саме, що 0
const valueRules = MEASUREMENT_FIELDS.map(field => {
  const { min, max } = RANGES[field];
  return body(field, `${field}: число від ${min} до ${max} або null`)
    .optional({ values: 'null' })
    .isFloat({ min, max })
    .toFloat();
});

const filterRules = [
  queryParam('pollutant', `pollutant: одне з ${POLLUTANTS.join(', ')}`).isIn(POLLUTANTS),
  ...periodRules,
  queryParam('sort', `sort: одне з ${SORT_VALUES.join(', ')}`).isIn(SORT_VALUES),
  queryParam('after', 'after: очікується курсор із meta.next_cursor або час у форматі ISO 8601 (UTC)')
    .matches(CURSOR_RE)
    .custom(value => !Number.isNaN(Date.parse(value.split('_')[0]))),
  ...paginationRules
];

export const listMeasurementsRules = [
  stationCode(queryParam('station', stationCodeMessage)),
  queryParam('city', 'city: очікується непорожній рядок').isString().trim().notEmpty(),
  ...filterRules
];

export const listStationMeasurementsRules = [stationCodeParam, ...filterRules];

export const stationStatisticsRules = [stationCodeParam, ...periodRules];

export const measurementIdRules = [measurementIdParam];

export const createMeasurementRules = [stationIdBody, measuredAt, ...valueRules];

export const createStationMeasurementRules = [stationCodeParam, measuredAt, ...valueRules];

export const replaceMeasurementRules = [measurementIdParam, stationIdBody, measuredAt, ...valueRules];
