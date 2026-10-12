import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { API_PREFIX } from './config/constants.js';
import { env } from './config/env.js';
import { swaggerSpec } from './docs/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import apiRouter from './routes/index.js';

// Тільки складання додатку, без запуску: app можна імпортувати в тестах без порту
const app = express();

app.use(helmet()); // заголовки безпеки першими
app.use(
  cors({
    origin: env.corsOrigins, // явний whitelist походжень
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['Location']
  })
);
app.use(express.json({ limit: '1mb' })); // до маршрутів, що читають req.body
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

app.use(API_PREFIX, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
