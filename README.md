# Laboratory Work 2. React Frontend for Environmental Data Visualization

*Лабораторна робота 2. Розробка фронтенду на React для візуалізації даних*

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

**Goal:** learn to build a single-page application (SPA) in React from components and props, and show environmental indicators as tables.

The project is the web client for the air-quality REST API from Laboratory Work 1, which lives in the [`backend`](https://github.com/ilSPACEli/AirQuality/tree/backend) branch of this repository. It has three pages:

- **stations**: list with filters, create, edit, switch on and off, delete;
- **station page**: station card, statistics per parameter and the station's measurements;
- **measurements**: list with filters, sorting and pagination, create, edit, delete.

**Stack:** React 19, React Router 7, Axios, Vite.

## How the data is shown

The client follows the rules of the subject area set in Laboratory Work 1:

- **A missing value is not zero.** The API stores a value the sensor did not send as `null`. The tables show it as «—», and an empty form field is sent as `null`, because `0` would mean clean air.
- **Time is stored in UTC.** The interface shows and accepts local time and converts it in both directions.
- **PM2.5 above 25 µg/m³ is highlighted.** This is the WHO daily guideline that the backend also uses to count exceedances.
- **The server checks the data.** When the API rejects a form with status 422, each message appears under the field it belongs to.

## How to run

Requirements: Node.js 20.19+ or 22.12+ (required by Vite) and the API from Laboratory Work 1.

The backend and the frontend are separate branches, so each one is cloned into its own folder:

```bash
git clone -b backend https://github.com/ilSPACEli/AirQuality.git AirQuality-backend
git clone -b frontend https://github.com/ilSPACEli/AirQuality.git AirQuality-frontend
```

Start the backend as described in its README (`npm install`, `.env`, `npm run dev`). If its database is empty, fill it once with `npm run import` or `npm run seed`.

Then start the frontend:

```bash
cd AirQuality-frontend
npm install
npm run dev
```

- Application: <http://localhost:5173>
- The API is expected at <http://localhost:3000/api/v1>

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server on port 5173 |
| `npm run build` | Build the production version into `dist/` |
| `npm run preview` | Serve the built version |
| `npm run lint` | Check the code with oxlint |

### Settings in `.env`

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api/v1` | Base URL of the API |

The development server always uses port 5173 (`strictPort` in `vite.config.js`). The backend allows browser requests only from origins in its `CORS_ORIGINS`, and `http://localhost:5173` is the default there. If the port changes, add the new origin to `CORS_ORIGINS` and restart the backend.

## Project structure

Pages and components draw the interface, hooks keep the loading state, and one module talks to the server. No component calls Axios directly.

```
index.html             the only HTML page: an empty <div id="root">
src/
  main.jsx             entry point: mounts <App /> inside the router
  App.jsx              header, navigation, routes
  config.js            API address
  api/client.js        Axios instance and a function for every API endpoint
  hooks/               useApi (loading data), useDebounce (typing delay), useFlash (messages)
  components/          parts of the interface: DataTable, Pagination, Modal, forms, statistics
  pages/               StationsPage, StationDetailsPage, MeasurementsPage
  utils/               parameter list, number and date formatting, validation errors
  index.css            styles, light and dark theme
```

Data moves through the application in one direction:

1. A page keeps the request parameters (filters, page number) in state and passes a request function to `useApi`.
2. `useApi` sends the request after the page renders and saves the answer in state.
3. The new state renders the page again, and the data goes down to `DataTable` and `Pagination` as props.
4. Components report user actions back up through callback props: `onPageChange`, `onSortChange`, `onSubmit`.
5. The page changes its state or sends a change to the API, and the list is loaded again.

## Pages

| Address | Page | What it does |
|---|---|---|
| `/stations` | Станції | List of stations with city and status filters; create, edit, switch on and off, delete |
| `/stations/:code` | Station page | Station card, statistics, the station's measurements with full CRUD |
| `/measurements` | Вимірювання | All measurements with filters, sorting, pagination and full CRUD |
| `*` | Not found | Any other address |

## Components

**DataTable** is the generic table used for stations, measurements and statistics. It knows nothing about the data: the page passes the columns and the rows.

| Prop | Type | Notes |
|---|---|---|
| `columns` | Array | `key`, `title`, optional `render(row)`, `align`, `sortKey` |
| `data` | Array | Rows to show |
| `rowKey` | Function | Unique `key` of a row, `row => row.id` by default |
| `emptyText` | String | Text for an empty table |
| `sort`, `onSortChange` | String, Function | Server-side sorting by clicking a header; `-measured_at` means descending |
| `rowClassName` | Function | Extra CSS class for a row, used for PM2.5 exceedances |
| `loading` | Boolean | Dims the table while new data loads |

Other components:

| Component | What it does |
|---|---|
| `Pagination` | «1–20 з 223» and page buttons, built from the API's `meta` |
| `Modal`, `ConfirmDialog` | Modal window and confirmation before deleting |
| `StationForm`, `MeasurementForm` | Create and edit forms; server errors appear under fields |
| `MeasurementsManager` | Measurements table with filters, sorting, pagination and CRUD, used on two pages |
| `StatisticsPanel` | Average, minimum and maximum per parameter and PM2.5 exceedances |
| `HealthIndicator` | API status in the header |

## API usage

All requests go through `src/api/client.js`. The pages call its functions and never build URLs themselves.

| Action | Where in the interface | Request |
|---|---|---|
| List stations | Станції | `GET /stations` |
| Create a station | «Додати станцію» | `POST /stations` |
| View a station | click a station code | `GET /stations/:code` |
| Edit a station | «Змінити» | `PUT /stations/:code` |
| Switch a station on or off | click the status badge | `PATCH /stations/:code` |
| Delete a station | «Видалити» | `DELETE /stations/:code` |
| Station statistics | station page | `GET /stations/:code/statistics` |
| Station measurements | station page | `GET /stations/:code/measurements` |
| Add a measurement to a station | station page → «Додати вимірювання» | `POST /stations/:code/measurements` |
| List measurements | Вимірювання | `GET /measurements` |
| Create a measurement | «Додати вимірювання» | `POST /measurements` |
| Edit a measurement | «Змінити» | `PUT /measurements/:id` |
| Delete a measurement | «Видалити» | `DELETE /measurements/:id` |
| API status | header | `GET /health` |

After every change the list is loaded from the server again, so the table always shows what is in the database.

### Loading data

Lists are loaded with the custom hook `useApi`, built on `useEffect` and `useState`:

```jsx
const { data, meta, loading, error, reload } = useApi(
  signal => stationsApi.list({ city, page, limit: 20 }, signal),
  [city, page]                   // the request repeats when these change
);
```

- `reload()` repeats the request after a create, edit or delete.
- When the parameters change before the previous answer arrives, the old request is cancelled, so a late answer cannot replace newer data.

### Errors

An interceptor in `client.js` turns every failed request into one format: message, HTTP status and the list of invalid fields.

| Situation | What the user sees |
|---|---|
| 422, data failed validation | Each message under its form field |
| 409, record already exists | Message at the bottom of the form |
| 404, record not found | «Станцію … не знайдено» with a link back |
| No answer from the server | «Сервер недоступний. Перевірте, що API запущено» |
| Loading | «Завантаження…»; when switching pages the old rows stay dimmed |