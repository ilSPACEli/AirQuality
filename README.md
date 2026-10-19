# Air Quality Monitoring

*Інформаційна система моніторингу якості атмосферного повітря*

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

Laboratory works for the course on server information systems for environmental monitoring. Together they build one system: it collects air-quality readings from monitoring stations in Ukraine, stores them in MongoDB and shows them in a web interface.

## Branches

Each part of the system lives in its own branch. This `main` branch holds only the overview.

| Branch | Laboratory work | What it contains |
|---|---|---|
| [`backend`](https://github.com/ilSPACEli/AirQuality/tree/backend) | 1. Server side with Express and MongoDB | REST API for stations and measurements: CRUD, filters, pagination, statistics, validation, import from SaveEcoBot, Swagger, tests |
| [`frontend`](https://github.com/ilSPACEli/AirQuality/tree/frontend) | 2. React frontend for data visualization | Web client: stations and measurements tables, CRUD, filters, sorting, station statistics |

Each branch has its own README with the details.

## Architecture

```
SaveEcoBot API ──(npm run import)──┐
                                   ▼
Browser ──► frontend ──HTTP──► backend ──► MongoDB Atlas
            React, :5173       Express, :3000/api/v1
```

- The **backend** is the only part that works with the database. It checks every request and returns JSON in one format.
- The **frontend** gets all data through the backend API. The backend allows it in CORS by its address, `http://localhost:5173`.

## How to run

Requirements: Node.js 20.19+ or 22.12+ and a MongoDB database (Atlas or local).

Clone each branch into its own folder:

```bash
git clone -b backend https://github.com/ilSPACEli/AirQuality.git AirQuality-backend
git clone -b frontend https://github.com/ilSPACEli/AirQuality.git AirQuality-frontend
```

Start the backend:

```bash
cd AirQuality-backend
npm install
cp .env.example .env   # put your MongoDB connection string into MONGODB_URI
npm run seed           # demo data, or npm run import for real SaveEcoBot data
npm run dev
```

Start the frontend in another terminal:

```bash
cd AirQuality-frontend
npm install
npm run dev
```

- Application: <http://localhost:5173>
- API: <http://localhost:3000/api/v1>
- API documentation: <http://localhost:3000/api/docs>
