import { healthApi } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';

// Індикатор стану бекенду (GET /health): сервер і з'єднання з базою даних
function HealthIndicator() {
  const { data, loading, error, reload } = useApi(signal => healthApi.check(signal), []);

  const state = loading ? 'pending' : !error && data?.status === 'ok' ? 'ok' : 'down';
  const text = { pending: 'Перевірка API…', ok: 'API працює', down: 'API недоступний' }[state];

  return (
    <button className={`health health-${state}`} onClick={reload} title={error ?? 'Перевірити ще раз'}>
      <span className="health-dot" aria-hidden="true" />
      {text}
    </button>
  );
}

export default HealthIndicator;
