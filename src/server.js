import app from './app.js';
import { API_PREFIX } from './config/constants.js';
import { connectDB, disconnectDB } from './config/database.js';
import { env } from './config/env.js';

// Запуск і життєвий цикл процесу
try {
  await connectDB();
  console.log('MongoDB підключено');
} catch (err) {
  console.error(`Не вдалося підключитися до MongoDB: ${err.message}`);
  process.exit(1);
}

const server = app.listen(env.port, () => {
  console.log(`API:     http://localhost:${env.port}${API_PREFIX}`);
  console.log(`Swagger: http://localhost:${env.port}/api/docs`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${env.port} вже зайнятий`);
    process.exit(1);
  }
  throw err;
});

function shutdown(signal) {
  console.log(`${signal}: завершення роботи`);
  server.close(async () => {
    // нові з'єднання не приймаються, поточні запити завершено
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker, хостинг
