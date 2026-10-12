import { setTimeout as sleep } from 'node:timers/promises';

// Запит із таймаутом і повторами з експоненційною затримкою та jitter
export async function fetchJson(url, { retries = 3, timeoutMs = 15_000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

      // Сервер сам сказав, скільки чекати
      if (res.status === 429 && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 60);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2 ** attempt * 500 + Math.random() * 300);
    }
  }
}
