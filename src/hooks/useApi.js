import { useCallback, useEffect, useState } from 'react';

// Завантаження даних з API: стан data / meta / loading / error і функція reload.
// request(signal) має повертати { data, meta }; deps перезапускають запит при зміні.
export function useApi(request, deps) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Попередні дані лишаються на екрані, поки йде новий запит: таблиця не «блимає»
    setState(prev => ({ ...prev, loading: true, error: null }));

    request(controller.signal)
      .then(({ data, meta }) => setState({ data, meta, loading: false, error: null }))
      .catch(err => {
        if (controller.signal.aborted) return; // відповідь застарілого запиту ігноруємо
        setState(prev => ({ ...prev, loading: false, error: err.message }));
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion(v => v + 1), []);

  return { ...state, reload };
}
