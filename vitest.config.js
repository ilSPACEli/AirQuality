import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 600_000, // перший запуск mongodb-memory-server завантажує бінарник MongoDB
    fileParallelism: false // кожен файл піднімає власну базу в пам'яті
  }
});
