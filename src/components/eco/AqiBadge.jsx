import { useState } from 'react';
import { ecoApi } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { fieldLabel, formatDateTime, formatValue, fromLocalInput } from '../../utils/format.js';
import { ErrorMessage, Loader } from '../Status.jsx';

// Темний чи світлий текст на кольоровій плашці
export function textColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1c2630' : '#ffffff';
}

export function CategoryPlaque({ category, title, children }) {
  if (!category) return <div className="aqi-plaque aqi-plaque-empty">{title}: немає даних</div>;
  return (
    <div className="aqi-plaque" style={{ background: category.color, color: textColor(category.color) }}>
      <span className="aqi-plaque-title">{title}</span>
      <span className="aqi-plaque-name">{category.name}</span>
      {children}
    </div>
  );
}

// Плашка індексу якості повітря за наказом № 590: колір і назва категорії з довідника aqi-ua.json
function AqiBadge({ station }) {
  const [at, setAt] = useState('');
  const { data, loading, error, reload } = useApi(
    signal => ecoApi.aqi(station, at ? fromLocalInput(at) : undefined, signal),
    [station, at]
  );

  return (
    <section className={`card ${loading ? 'is-loading' : ''}`}>
      <div className="card-header">
        <h2>Індекс якості повітря (наказ № 590)</h2>
        <label className="field field-inline">
          <span className="field-label">Момент часу</span>
          <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />
        </label>
      </div>

      {error && <ErrorMessage message={error} onRetry={reload} />}
      {!error && !data && <Loader />}
      {!error && data && (
        <>
          <CategoryPlaque category={data.category} title={`Категорія ${data.level ?? '—'} з 6`}>
            <span className="aqi-plaque-sub">
              {formatDateTime(data.measured_at)} · визначає {fieldLabel(data.dominant)}
            </span>
          </CategoryPlaque>
          {!data.complete && (
            <p className="muted small">
              Неповний набір: не вимірювалися {data.missing.map(fieldLabel).join(', ')}.
            </p>
          )}
          <div className="chips">
            {Object.entries(data.subindices).map(([p, s]) => (
              <span
                key={p}
                className="chip"
                style={s.category ? { background: s.category.color, color: textColor(s.category.color) } : undefined}
                title={s.category?.name ?? 'немає даних'}
              >
                {fieldLabel(p)}: {formatValue(s.value, 1)} мкг/м³
              </span>
            ))}
          </div>
          <p className="muted small">{data.source}</p>
        </>
      )}
    </section>
  );
}

export default AqiBadge;
