import { param, query } from 'express-validator';
import { STATION_CODE_RE } from '../config/constants.js';

const STATION_CODE_MESSAGE = 'Код станції: 2–40 символів (A–Z, 0–9, "-", "_")';

// ?key=a&key=b дає масив, а не рядок: такі запити відхиляємо явно
const single = value => !Array.isArray(value);

export const queryParam = (name, message) =>
  query(name, message).optional().custom(single).bail();

export const stationCodeParam = param('id', STATION_CODE_MESSAGE)
  .trim()
  .toUpperCase()
  .matches(STATION_CODE_RE);

export const stationCode = chain => chain.isString().bail().trim().toUpperCase().matches(STATION_CODE_RE);

export const stationCodeMessage = STATION_CODE_MESSAGE;

export const paginationRules = [
  queryParam('page', 'page має бути цілим числом від 1').isInt({ min: 1 }).toInt(),
  queryParam('limit', 'limit має бути цілим числом від 1').isInt({ min: 1 }).toInt()
];

// Межі дат інтерпретуються в UTC
export const periodRules = [
  queryParam('from', 'from: очікується дата у форматі ISO 8601').isISO8601().toDate(),
  queryParam('to', 'to: очікується дата у форматі ISO 8601')
    .isISO8601()
    .toDate()
    .custom((to, { req }) => {
      const from = new Date(req.query.from);
      return Number.isNaN(from.getTime()) || from <= to;
    })
    .withMessage('to не може бути раніше за from')
];
