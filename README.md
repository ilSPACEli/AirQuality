# Laboratory Work 1. Server Side with Express and MongoDB for Environmental Data

*Лабораторна робота 1. Створення серверної частини з Express і MongoDB для екологічних даних*

| | |
|---|---|
| **University** | Національний технічний університет України «Київський політехнічний інститут імені Ігоря Сікорського» |
| **Institute** | Навчально-науковий інститут атомної та теплової енергетики |
| **Department** | Кафедра цифрових технологій в енергетиці |
| **Course** | Серверні інформаційні системи екологічного моніторингу |
| **Done by** | Фріз Богдан Володимирович, Онищук Дмитро Ігорович, група ТР-41 |
| **Checked by** | Рудик Володимир Іванович |
| **Year** | 2026 |

## About

**Goal:** learn to build a REST API with Express.js connected to MongoDB and implement CRUD operations for storing and reading environmental indicators.

The project is a REST API for air-quality monitoring. It stores two resources and provides full CRUD for both:

- **stations**: code, name, city, coordinates;
- **measurements**: time, PM2.5, PM10, NO2, SO2, CO, O3, temperature, humidity.

**Stack:** Node.js, Express 5, MongoDB Atlas, Mongoose, express-validator, Swagger, Jest + Supertest.

## Subject area

The subject area is **monitoring of atmospheric air quality**. Environmental monitoring is the regular collection, storage and analysis of data about the state of the environment. Air is one of its main objects, because polluted air directly affects people's health.

Air quality is measured by **monitoring stations**: devices with sensors installed at a fixed point in a city. Each station has coordinates and regularly reports the concentration of pollutants in the air around it. One station produces many measurements over time, so the data is a time series: every value is tied to a station and to a moment in time.

The system works with these indicators:

| Indicator | What it is | Main sources |
|---|---|---|
| PM2.5 | Fine particles smaller than 2.5 µm; they get deep into the lungs | Transport, heating, fires |
| PM10 | Particles smaller than 10 µm: dust, soot | Roads, construction, industry |
| NO2 | Nitrogen dioxide | Car exhaust, power plants |
| SO2 | Sulphur dioxide | Burning coal and fuel oil |
| CO | Carbon monoxide | Incomplete combustion of fuel |
| O3 | Ground-level ozone | Forms from other pollutants in sunlight |
| Temperature, humidity | Weather conditions | They affect how pollutants spread |

Concentrations are measured in micrograms per cubic metre (µg/m³). For each station the system counts how many PM2.5 readings exceed 25 µg/m³, the daily threshold used in the course materials.

Two features of this data shape the project:

- **A sensor can fail or send nothing.** A missing value is stored as `null`, not `0`, because zero would mean clean air. Values that are physically impossible, such as a negative concentration, are rejected.
- **The data comes from many sources.** In Ukraine it is published by state bodies and by public networks such as SaveEcoBot, which this project uses as its source of real measurements.

## How to run

Requirements: Node.js 20.11 or newer and a MongoDB database (Atlas or local).

```bash
npm install
cp .env.example .env
```

Put your MongoDB connection string into `.env`, with the database name before the `?`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/eco_monitoring?retryWrites=true&w=majority
```

Then:

```bash
npm run seed     # demo data: 10 stations and 3 days of hourly measurements
npm run dev      # start the server
```

- API: <http://localhost:3000/api/v1>
- Swagger documentation: <http://localhost:3000/api/docs>

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with automatic restart |
| `npm start` | Start the server |
| `npm test` | Run 52 automated tests on an in-memory database |
| `npm run seed` | Fill the database with demo data |
| `npm run import` | Import current data from the SaveEcoBot open API |

`seed` and `import` can be run repeatedly without creating duplicates.

### Settings in `.env`

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MONGODB_URI` | required | MongoDB connection string |
| `CORS_ORIGINS` | `http://localhost:5173` | Browser origins allowed to call the API |
| `SAVEECOBOT_API` | `https://api.saveecobot.com/output.json` | Data source for `npm run import` |
| `DNS_SERVERS` | `8.8.8.8,1.1.1.1` | Fallback DNS if the Atlas lookup fails with `querySrv ECONNREFUSED` |

## Project structure

The project follows the layered architecture `routes → controllers → services → models`. Each layer calls only the next one.

```
src/
  server.js      entry point: connects to the database and starts the server
  app.js         builds the app: middleware, routes, error handler
  config/        settings: environment, database connection, constants
  routes/        which URL and method leads to which controller
  validators/    rules for checking input data
  middleware/    runs validation, handles 404 and all errors
  controllers/   read the request, call a service, send the response
  services/      business logic: CRUD, filters, pagination, statistics
  models/        Mongoose schemas: structure of documents in the database
  utils/         helpers: error class, pagination, HTTP requests with retries
  docs/          API description for Swagger
scripts/         seed.js and import-saveecobot.js
tests/           automated tests
api-tests.http   ready-made requests for manual testing in VS Code
```

A request passes through the layers in this order:

1. `app.js` parses the request body into an object.
2. A route is matched by URL and method.
3. Validators check the data. If the check fails, the client gets 422.
4. The controller calls a service.
5. The service runs the logic and reads or writes through a model.
6. The controller sends the response with a status code.

Any error on the way goes to one error handler, which returns it in a common format.

## Data model

**Station**

| Field | Type | Notes |
|---|---|---|
| `code` | String | Unique identifier, for example `KYIV-01` |
| `name`, `city` | String | Required |
| `latitude`, `longitude` | Number | Must be inside Ukraine; stored as a GeoJSON point |
| `active` | Boolean | Default `true` |
| `measurement_types` | Array | Which parameters the station measures |

**Measurement**

| Field | Type | Notes |
|---|---|---|
| `station_id` | String | Code of the station |
| `measured_at` | Date | ISO 8601, stored in UTC |
| `pm25`, `pm10`, `no2`, `so2`, `co`, `o3` | Number or null | µg/m³, from 0 to 1000 |
| `temperature` | Number or null | °C, from −60 to 60 |
| `humidity` | Number or null | %, from 0 to 100 |

`null` means the sensor sent no data, `0` means no pollution was detected. One station cannot have two measurements with the same time.

## API

Base URL: `/api/v1`

| Method | Path | Action | Success | Errors |
|---|---|---|---|---|
| GET | `/stations` | List stations | 200 | 422 |
| POST | `/stations` | Create a station | 201 | 400, 409, 422 |
| GET | `/stations/:id` | Get one station | 200 | 404 |
| PUT | `/stations/:id` | Replace a station | 200 | 404, 422 |
| PATCH | `/stations/:id` | Change part of a station | 200 | 404, 422 |
| DELETE | `/stations/:id` | Delete a station and its measurements | 204 | |
| GET | `/stations/:id/measurements` | Measurements of one station | 200 | 404, 422 |
| POST | `/stations/:id/measurements` | Add a measurement to a station | 201 | 404, 409, 422 |
| GET | `/stations/:id/statistics` | Average, minimum, maximum per parameter | 200 | 404, 422 |
| GET | `/measurements` | List measurements | 200 | 422 |
| POST | `/measurements` | Create a measurement | 201 | 400, 404, 409, 422 |
| GET | `/measurements/:id` | Get one measurement | 200 | 404, 422 |
| PUT | `/measurements/:id` | Replace a measurement | 200 | 404, 409, 422 |
| DELETE | `/measurements/:id` | Delete a measurement | 204 | 422 |
| GET | `/health` | Server and database status | 200 | 503 |

For stations `:id` is the station code. For measurements it is the MongoDB ObjectId.

### Filters for measurement lists

| Parameter | Example | Meaning |
|---|---|---|
| `station` | `KYIV-01` | Measurements of one station |
| `city` | `Kyiv` | Measurements of all stations in a city |
| `pollutant` | `pm25` | Only records where this pollutant was measured |
| `from`, `to` | `2026-03-01` | Period, ISO 8601, UTC |
| `sort` | `-measured_at` | Sort field; a minus means descending |
| `page`, `limit` | `1`, `50` | Page number and page size; `limit` is at most 200 |
| `after` | value of `meta.next_cursor` | Next page by cursor |

### Response format

```jsonc
// success, one record
{ "success": true, "data": { "id": "KYIV-01", "city": "Kyiv" } }

// success, list
{ "success": true, "data": [], "meta": { "total": 0, "page": 1, "limit": 50, "pages": 0 } }

// error
{
  "success": false,
  "error": "Дані не пройшли валідацію",
  "details": [{ "field": "pm25", "message": "pm25: число від 0 до 1000 або null" }]
}
```

### Status codes

| Code | Meaning |
|---|---|
| 200 | Read or updated. An empty list is also 200 |
| 201 | Created; the `Location` header contains the address of the new record |
| 204 | Deleted, no response body. A repeated delete also returns 204 |
| 400 | The request cannot be read, for example broken JSON |
| 404 | The record or the route does not exist |
| 409 | Such a record already exists |
| 422 | The request was read, but the data failed validation |
| 500 | Unexpected server error |

### Example

```bash
# create a station
curl -i -X POST http://localhost:3000/api/v1/stations \
  -H "Content-Type: application/json" \
  -d '{"code":"KYIV-01","name":"Khreshchatyk","city":"Kyiv","latitude":50.4501,"longitude":30.5234}'

# add a measurement
curl -i -X POST http://localhost:3000/api/v1/stations/KYIV-01/measurements \
  -H "Content-Type: application/json" \
  -d '{"measured_at":"2026-03-14T08:00:00.000Z","pm25":23.4,"pm10":31.2}'

# read measurements of the station
curl "http://localhost:3000/api/v1/measurements?station=KYIV-01&limit=10"
```

## Sources of environmental data

| Source | Data | Access |
|---|---|---|
| [SaveEcoBot](https://www.saveecobot.com/) | Air quality from about 470 sensors in Ukraine | Open JSON API |
| [data.gov.ua](https://data.gov.ua/) | Official datasets: air, water, radiation | API, CSV, JSON, XML |
| [EcoSystem](https://eco.gov.ua/) | Registers, regional reports, pollution maps | Web portal |
| [State Statistics Service](https://ukrstat.gov.ua/) | Yearly statistics on emissions and waste | Excel, PDF |
| [OpenAQ](https://openaq.org/) | Global air-quality data | REST API |
| [NASA POWER](https://power.larc.nasa.gov/) | Satellite climate data | REST API |

The project imports data from SaveEcoBot because it publishes current station readings as open JSON without registration. Values outside the valid ranges, which come from faulty sensors, are skipped during import.
