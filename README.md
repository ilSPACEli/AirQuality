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

**Stack:** Node.js, Express 5, MongoDB Atlas, Mongoose, express-validator, Zod, decimal.js, Swagger, Vitest + Supertest.

Laboratory work 3 (environmental impact calculations) is described in the section [Laboratory Work 3](#laboratory-work-3-environmental-impact-calculations).

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

Requirements: Node.js 20.19 or newer and MongoDB 7.0+ (Atlas or local): laboratory work 3 uses `$median` and `$percentile`.

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
| `npm test` | Run all tests with Vitest: unit tests of the calculations and API tests on an in-memory database |
| `npm run seed:year -- --station KYIV-01 --year 2025` | Generate a year of hourly measurements for a station (lab 3) |
| `npm run process:year -- --station KYIV-01 --year 2025` | Clean the year, build daily aggregates and alerts (lab 3) |
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

## Laboratory Work 3. Environmental Impact Calculations

*Лабораторна робота 3. Розрахунок впливу на довкілля в MERN-застосунку*

**Goal:** process a year of hourly air-quality measurements in Node.js and MongoDB and implement one regulatory method so that its result can be checked by a manual calculation.

### How to run

```bash
npm install                                              # adds decimal.js, zod, vitest
npm run seed:year -- --station KYIV-01 --year 2025       # 8760 hourly measurements
npm run process:year -- --station KYIV-01 --year 2025    # cleaning → daily_stats → alerts
npm run dev
npm test
```

`process:year` prints how many values were rejected for each pollutant and why. The same processing is available as `POST /api/v1/stations/KYIV-01/process?year=2025` and as the «Обробити рік» button on the station page.

### Structure of the calculation code

All statistics of part A are computed by MongoDB aggregation pipelines. Every formula is a separate function that returns a piece of a pipeline, and the pipelines are assembled from these functions in one module.

```
src/eco/
  aggregation/
    expressions.js   usable value, K = C / norm, local day for Europe/Kyiv
    statistics.js    median, percentile (nearest rank), count above a threshold, min, max
    indices.js       category of the index of Order No. 590, worst pollutant, ІЗА term
    pipelines.js     pipelines: daily_stats, alerts, annual indicators, hourly statistics, index at a moment
  quality.js         valid / suspect / invalid flags (cleaning)
  time.js            local day and year boundaries for Europe/Kyiv (23- and 25-hour days)
  units.js           ppb ↔ µg/m³ through the molar mass and 24.45 l/mol
  norms/*.json       reference data: every record has source and valid_from
  v4-tax/            variant 4: environmental tax for a quarter (pure functions, decimal.js)
src/services/ecoService.js   runs the pipelines and assembles the responses
scripts/year-generator.js    generator of the yearly series (pure function)
```

### Part A

**Data model.** `Station` got `population` (Держстат, 01.01.2022) and `settlement_type`. `Measurement` got `quality` with a flag for each pollutant, because one document holds six pollutants and a failure of one sensor must not discard the other five. The `min`/`max` limits were removed from the schema: raw sensor values, even negative ones, are stored, and the flag decides whether a value is usable. New collections: `daily_stats` and `alerts`.

**Units.** All concentrations are stored in µg/m³, CO in mg/m³. Norms of Order No. 52 are stored in mg/m³ as in the document and converted in `norms/index.js`.

**Generator** (`scripts/year-generator.js`). Daily cycle (traffic and heating peaks, afternoon ozone), seasonality (heating season), log-normal noise, 3 station outages of 2–5 days, a 4-day SO₂ sensor failure, 3.5 % random missing hours, 4 episodes of peak concentrations (winter smog, grass fires, summer heat, autumn smoke), 6 invalid values per pollutant (negative or above the physical limit) and a «stuck» NO₂ sensor for 8 hours. The generator is deterministic: the same station and year give the same series. For KYIV-01, 2025: 8520 records out of 8760 hours, 6.3–7.4 % missing values for each pollutant.

**Cleaning.** `invalid`: a negative value or a value above the physical limit of the sensor (`norms/quality.json`). `suspect`: the same value 6 hours in a row (a stuck sensor); such values are kept in the aggregates but flagged. Invalid values are not deleted.

**Aggregations** (`src/eco/aggregation/pipelines.js`). All statistics are computed by MongoDB:

| Pipeline | Collection | What it computes |
|---|---|---|
| `dailyPipeline` | measurements → `daily_stats` | Daily means grouped by the local day (`$dateTrunc` with `timezone: 'Europe/Kyiv'`), a day is complete with ≥ 18 of 24 hours; 8-hour rolling mean for CO and O₃ (`$setWindowFields`, ≥ 6 of 8 hours); written with `$merge` |
| `hourlyAlertsPipeline`, `dailyAlertsPipeline` | measurements, daily_stats → `alerts` | Hourly values above ГДК м.р. and hourly limit values, complete daily means above ГДК с.д. and daily limit values, max8h above the CO and O₃ values; K = C / norm; written with `$merge` |
| `hourlyAnnualPipeline` | measurements | Completeness, annual mean (only with ≥ 90 % of hours), hourly and annual limit values, ІЗА = Σ (C/ГДКс.д.)^k |
| `dailyAnnualPipeline` | daily_stats | Median, min, max, P90.4, P98 of complete daily means (`$sortArray` + `$arrayElemAt`, nearest rank), days above ГДК с.д., daily and 8-hour limit values |
| `hourlyStatsPipeline` | measurements | Statistics of hourly values for any period (`$median`, `$percentile`, MongoDB 7.0+) |
| `aqiAtPipeline` | measurements | Index of Order No. 590 for an hour: category of each pollutant, worst pollutant, missing pollutants |

The service only runs the pipelines and puts the results into one response. The test «Агрегації MongoDB = ручний розрахунок» in `tests/eco-api.test.js` processes a generated year and compares the annual mean, the 23-hour day of the switch to summer time, the median, P90.4, the number of exceedances and ІЗА with a manual calculation in JavaScript.

**Passport.** `GET /annual` and `GET /aqi` return `passport`: the method of every value, the completeness rules, the collections, the norms with sources and the versions of the reference data.

**Norms** (`src/eco/norms`):

| File | Content | Source |
|---|---|---|
| `gdk.json` | ГДК м.р., ГДК с.д., hazard class | Order of the Ministry of Health No. 52 of 14.01.2020; for PM2.5 and PM10 the WHO 2005 levels (No. 52 has no separate values) |
| `limit-values.json` | limit and target values with allowed exceedances | Resolution of the Cabinet of Ministers No. 827, Directive 2008/50/EC |
| `completeness.json` | 18 of 24 hours, 6 of 8 hours, 90 % per year | Directive 2008/50/EC, Resolution No. 827 |
| `quality.json` | physical limits of sensors, 6 hours for a stuck sensor | sensor ranges |
| `aqi-ua.json` | 6 categories, colours and ranges of the index | Order of the Ministry of Environment No. 590 of 24.03.2025, appendix 1 |
| `eco-tax-rates.json` | tax rates and coefficients | Tax Code, articles 243, 245, 246, 249 |

A norm is compared only with a value of the same averaging period: ГДК м.р. with an hourly value, ГДК с.д. with a daily mean, limit values with the period given in Resolution 827. When K > 1 an event with the pollutant, period, value, norm and ratio is written to `alerts`.

### Endpoints of laboratory work 3

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/stations/:id/stats?period=hour&from=…&to=…` | Hourly statistics for a period: mean, median, P98, min, max |
| GET | `/api/v1/stations/:id/stats?period=day&year=2025[&pollutant=pm10]` | Daily aggregates from `daily_stats` |
| GET | `/api/v1/stations/:id/stats?period=year&year=2025` | Annual indicators (same as `/annual`) |
| GET | `/api/v1/stations/:id/annual?year=2025` | Annual indicators used by part B: completeness, annual mean, median, min/max, P90.4, P98, days above ГДК с.д., limit values, ІЗА |
| GET | `/api/v1/stations/:id/daily?year=2025&pollutant=pm10` | Daily means with ГДК с.д. for the chart |
| GET | `/api/v1/stations/:id/aqi?at=2025-03-10T08:00:00Z` | Index of Order No. 590 at a moment with sub-indices by pollutant |
| GET | `/api/v1/stations/:id/alerts?year=2025&pollutant=no2` | Exceedances sorted by ratio |
| POST | `/api/v1/stations/:id/process?year=2025` | Cleaning, daily aggregates and alerts for a year |
| POST | `/api/v1/eco/tax/quarter` | Variant 4: environmental tax for a quarter |
| GET | `/api/v1/eco/tax/rates` | Variant 4: reference rates |

Invalid input gives `422` with the list of fields (Zod schemas in `src/validators`). The calculation endpoints return `passport` next to `data`: the method, inputs with units, coefficients, reference rates with `source` and `valid_from`, and the version of the reference data.

### Part B. Individual variant

Variant = (N − 1) mod 10 + 1. Фріз Богдан, N = 14 → **variant 4: environmental tax for a quarter** (Tax Code, articles 240–250).

### Variant 4. Environmental tax for a quarter

Formulas of article 249 of the Tax Code:

- emissions (p. 249.3): `Сп = Σ Mᵢ × Нпᵢ`, rates of article 243;
- discharges (p. 249.4): `Сс = Σ Mᵢ × Нпᵢ × Кос`, rates of article 245, `Кос = 1.5` for ponds and lakes;
- waste disposal (p. 249.5): `Срв = Σ Нпᵢ × Mᵢ × Кт × Ко`, rates of article 246, `Кт = 3` within a settlement or closer than 3 km, `Ко = 3` for a dump without full protection;
- CO₂: 30 UAH/t, not taxed when the annual emission is not more than 500 t.

The rate valid on the first day of the quarter is used (`valid_from`), so a past quarter is recalculated with its own rates. Money is calculated with `decimal.js`; each position is rounded to 0.01 UAH once, and the totals are sums of the rounded positions, as in the declaration.

**Enterprise.** ТОВ «АСТОР ІНВЕСТ» (ЄДРПОУ 41571920), production of ready-mixed concrete, Odesa, 19th km of Starokyivska road. Source: «Інформація про отримання дозволу на викиди забруднюючих речовин для ознайомлення з нею громадськості», table 15.4.1, actual emissions in t/year. The data is in `examples/v4-tax-input.json` and in the default form of the client.

Assumptions:

- the mass for a quarter is the annual mass divided by 4 (the tax is normally declared from the actual quarterly accounting, which is not public);
- methane and mineral oil (НМЛОС) are taxed as «вуглеводні» (p. 243.1, 146.50 UAH/t);
- N₂O has neither ГДК м.р. nor ОБРВ, so by p. 243.5 it is taxed at the rate of hazard class I (18413.24 UAH/t);
- CO₂ is 165.22 t per year, below the 500 t threshold, so it is not taxed;
- there are no discharges: concrete trucks are washed on a recycling unit with circulating water;
- the document gives no data on waste, so appendix 3 is empty.

| No. | Substance (code) | t/year | t/quarter | Rate, UAH/t | Tax, UAH |
|---|---|---|---|---|---|
| 1 | Nitrogen oxides (4001) | 0.847 | 0.21175 | 2574.43 | 545.14 |
| 2 | Carbon monoxide (6000) | 0.484 | 0.121 | 96.99 | 11.74 |
| 3 | Suspended solid particles (3000) | 0.924 | 0.231 | 96.99 | 22.40 |
| 4 | Methane (12000) | 0.007 | 0.00175 | 146.50 | 0.26 |
| 5 | Mineral oil, НМЛОС (11000) | 0.006 | 0.0015 | 146.50 | 0.22 |
| 6 | N₂O (4002), class I | 0.003 | 0.00075 | 18413.24 | 13.81 |
| 7 | Carbon dioxide (7000) | 165.22 | 41.305 | 30.00 | 0.00 |
| | **Total for IV quarter 2026** | | | | **593.57** |

**Manual calculation: nitrogen oxides, IV quarter 2026.**

1. Annual mass (table 15.4.1): 0.847 t; mass for the quarter: M = 0.847 / 4 = 0.21175 t.
2. Rate (Tax Code, p. 243.1, valid from 01.01.2022): Нп = 2574.43 UAH/t.
3. Tax: Сп = M × Нп = 0.21175 t × 2574.43 UAH/t = 545.1356 UAH.
4. Rounding to 0.01 UAH: **545.14 UAH**.

| Value | Manual | Through the API | Difference |
|---|---|---|---|
| Rate Нп, UAH/t | 2574.43 | 2574.43 | 0 |
| Mass M, t | 0.21175 | 0.21175 | 0 |
| Rate date | 01.10.2026 | 2026-10-01 | – |
| Tax Сп, UAH | 545.14 | 545.14 | 0.00 |

The first test in `tests/v4-tax.test.js` checks exactly these values. The other tests cover a zero mass, an unknown substance, CO₂ below and above 500 t, a substance rated by hazard class, the 0.0001 mg/m³ boundary of p. 243.3, the 1.5 coefficient, `Кт × Ко = 9`, a rate change by `valid_from` and the absence of floating-point error.

The page `/tax` of the client fills in the form, shows loading, error (fields of the 422 response next to the rows) and success states, the tables of appendices 1–3 and the passport.

### What to check against official texts

The values in `src/eco/norms` were collected from public sources in November 2026. Before the defence, check them on zakon.rada.gov.ua: the ranges of Order No. 590 (taken from the draft order published by the Ministry), the appendix number of Resolution No. 827, the rates of articles 243, 245 and 246 of the Tax Code.
