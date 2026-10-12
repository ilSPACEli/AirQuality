import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';
import {
  API_PREFIX,
  MEASUREMENT_FIELDS,
  MEASUREMENT_SORT_FIELDS,
  POLLUTANTS,
  RANGES,
  UKRAINE_BOUNDS
} from '../config/constants.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../utils/pagination.js';

const valueProperties = Object.fromEntries(
  MEASUREMENT_FIELDS.map(field => [
    field,
    { type: 'number', nullable: true, minimum: RANGES[field].min, maximum: RANGES[field].max }
  ])
);

const stationProperties = {
  name: { type: 'string', maxLength: 120, example: 'Київ, вул. Хрещатик' },
  city: { type: 'string', maxLength: 60, example: 'Kyiv' },
  latitude: { type: 'number', ...minMax(UKRAINE_BOUNDS.latitude), example: 50.4501 },
  longitude: { type: 'number', ...minMax(UKRAINE_BOUNDS.longitude), example: 30.5234 },
  active: { type: 'boolean', default: true },
  measurement_types: { type: 'array', items: { type: 'string', enum: MEASUREMENT_FIELDS } }
};

function minMax({ min, max }) {
  return { minimum: min, maximum: max };
}

const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/Error' }, example }
  }
});

const definition = {
  openapi: '3.0.0',
  info: {
    title: 'Eco Monitoring API',
    version: '1.0.0',
    description: 'REST API для станцій екологічного моніторингу та вимірювань якості повітря'
  },
  servers: [{ url: API_PREFIX }],
  components: {
    parameters: {
      StationCode: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', example: 'KYIV-01' },
        description: 'Код станції'
      },
      Page: { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
      Limit: {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, default: DEFAULT_LIMIT },
        description: `Більші за ${MAX_LIMIT} значення зменшуються до ${MAX_LIMIT}`
      },
      Pollutant: {
        in: 'query',
        name: 'pollutant',
        schema: { type: 'string', enum: POLLUTANTS },
        description: 'Лише записи, де цей показник виміряно'
      },
      From: {
        in: 'query',
        name: 'from',
        schema: { type: 'string', format: 'date-time' },
        description: 'Початок періоду, ISO 8601, UTC'
      },
      To: {
        in: 'query',
        name: 'to',
        schema: { type: 'string', format: 'date-time' },
        description: 'Кінець періоду, ISO 8601, UTC'
      },
      Sort: {
        in: 'query',
        name: 'sort',
        schema: {
          type: 'string',
          enum: MEASUREMENT_SORT_FIELDS.flatMap(field => [field, `-${field}`]),
          default: '-measured_at'
        },
        description: 'Мінус перед назвою поля означає спадання'
      },
      After: {
        in: 'query',
        name: 'after',
        schema: { type: 'string' },
        description: 'Курсор із meta.next_cursor попередньої сторінки'
      }
    },
    schemas: {
      Station: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'KYIV-01' },
          code: { type: 'string', example: 'KYIV-01' },
          ...stationProperties,
          location: {
            type: 'object',
            description: 'GeoJSON Point, координати у порядку [довгота, широта]',
            properties: {
              type: { type: 'string', example: 'Point' },
              coordinates: { type: 'array', items: { type: 'number' }, example: [30.5234, 50.4501] }
            }
          },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' }
        }
      },
      StationCreate: {
        type: 'object',
        required: ['code', 'name', 'city', 'latitude', 'longitude'],
        properties: { code: { type: 'string', example: 'KYIV-01' }, ...stationProperties }
      },
      StationUpdate: {
        type: 'object',
        required: ['name', 'city', 'latitude', 'longitude'],
        properties: stationProperties
      },
      StationPatch: { type: 'object', properties: stationProperties },
      StationResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: '#/components/schemas/Station' }
        }
      },
      MeasurementValues: {
        type: 'object',
        required: ['measured_at'],
        description: 'Потрібне хоча б одне значення показника. null означає, що сенсор не передав дані.',
        properties: {
          measured_at: { type: 'string', format: 'date-time', example: '2026-03-14T08:00:00.000Z' },
          ...valueProperties
        },
        example: { measured_at: '2026-03-14T08:00:00.000Z', pm25: 23.4, pm10: 31.2, temperature: 8.5 }
      },
      MeasurementCreate: {
        allOf: [
          {
            type: 'object',
            required: ['station_id'],
            properties: { station_id: { type: 'string', example: 'KYIV-01' } }
          },
          { $ref: '#/components/schemas/MeasurementValues' }
        ],
        example: { station_id: 'KYIV-01', measured_at: '2026-03-14T08:00:00.000Z', pm25: 23.4 }
      },
      Measurement: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '665f1c2e8b3e4a0012a4b7c9' },
          station_id: { type: 'string', example: 'KYIV-01' },
          measured_at: { type: 'string', format: 'date-time' },
          ...valueProperties,
          source: { type: 'string', enum: ['manual', 'seed', 'saveecobot'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' }
        }
      },
      MeasurementResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: '#/components/schemas/Measurement' }
        }
      },
      MeasurementListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: '#/components/schemas/Measurement' } },
          meta: { $ref: '#/components/schemas/PageMeta' }
        }
      },
      PageMeta: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 18420 },
          page: { type: 'integer', example: 2 },
          limit: { type: 'integer', example: 50 },
          pages: { type: 'integer', example: 369 },
          next_cursor: { type: 'string', nullable: true }
        }
      },
      StationStatistics: {
        type: 'object',
        properties: {
          station_id: { type: 'string', example: 'KYIV-01' },
          count: { type: 'integer' },
          period: {
            type: 'object',
            properties: {
              from: { type: 'string', format: 'date-time', nullable: true },
              to: { type: 'string', format: 'date-time', nullable: true }
            }
          },
          pm25_limit: { type: 'number', example: 25 },
          pm25_exceedances: { type: 'integer' },
          parameters: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                count: { type: 'integer' },
                avg: { type: 'number', nullable: true },
                min: { type: 'number', nullable: true },
                max: { type: 'number', nullable: true }
              }
            }
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, message: { type: 'string' } }
            }
          }
        }
      }
    },
    responses: {
      BadRequest: errorResponse('Сервер не зміг розібрати запит', {
        success: false,
        error: 'Некоректний JSON у тілі запиту'
      }),
      NotFound: errorResponse('Ресурс не існує', {
        success: false,
        error: 'Станцію KYIV-99 не знайдено'
      }),
      Conflict: errorResponse('Такий ресурс уже існує', {
        success: false,
        error: 'Станція KYIV-01 вже зареєстрована'
      }),
      ValidationError: errorResponse('Синтаксис коректний, але дані не проходять валідацію', {
        success: false,
        error: 'Дані не пройшли валідацію',
        details: [{ field: 'pm25', message: 'pm25: число від 0 до 1000 або null' }]
      })
    }
  }
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const pathsFile = path.join(currentDir, 'paths.yaml').replaceAll('\\', '/');

export const swaggerSpec = swaggerJsdoc({ definition, apis: [pathsFile] });
