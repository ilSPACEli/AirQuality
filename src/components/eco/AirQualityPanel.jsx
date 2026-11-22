import { useState } from 'react';
import { ecoApi } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { POLLUTANTS, fieldLabel, formatValue } from '../../utils/format.js';
import { ErrorMessage, Loader } from '../Status.jsx';
import AnnualTable from './AnnualTable.jsx';
import DailyChart from './DailyChart.jsx';

const DEFAULT_YEAR = 2025;

const METHOD_LABELS = {
  cleaning: 'Очищення',
  daily: 'Добові середні',
  annual_mean: 'Річне середнє',
  percentiles: 'Медіана і перцентилі',
  exceedances: 'Перевищення',
  iza: 'ІЗА'
};

// Паспорт розрахунку річних показників: як і за якими нормативами пораховано
function AnnualPassport({ passport }) {
  if (!passport) return null;
  return (
    <details className="passport-inline">
      <summary>Паспорт розрахунку</summary>
      <dl className="passport-list">
        {Object.entries(passport.method).map(([key, text]) => (
          <div key={key} className="passport-row">
            <dt>{METHOD_LABELS[key] ?? key}</dt>
            <dd>{text}</dd>
          </div>
        ))}
        <div className="passport-row">
          <dt>Повнота</dt>
          <dd>
            доба ≥ {passport.completeness.day_min_hours} год, 8 год ≥ {passport.completeness.max8h_min_hours} год, рік ≥{' '}
            {passport.completeness.year_min_share * 100} % · {passport.completeness.source}
          </dd>
        </div>
        <div className="passport-row">
          <dt>Колекції</dt>
          <dd className="mono">
            {passport.collections.source} → {passport.collections.daily} → {passport.collections.alerts}
          </dd>
        </div>
        <div className="passport-row">
          <dt>Нормативи</dt>
          <dd>
            {Object.entries(passport.norms).map(([p, n]) => (
              <div key={p}>
                <strong>{fieldLabel(p)}</strong>: ГДК с.д. {n.gdk?.gdk_sd ?? '—'}, м.р. {n.gdk?.gdk_mr ?? '—'} {n.unit}
                {n.limits.length > 0 && ` · Порядок 827: ${n.limits.map(l => `${l.period} ${l.value}`).join(', ')}`}
              </div>
            ))}
          </dd>
        </div>
        <div className="passport-row">
          <dt>Версії довідників</dt>
          <dd className="mono">
            {Object.entries(passport.norms_version)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · ')}
          </dd>
        </div>
      </dl>
    </details>
  );
}

// Річні показники станції: таблиця, ІЗА, графік добових середніх із ГДК, обробка року
function AirQualityPanel({ station }) {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [pollutant, setPollutant] = useState('pm10');
  const [version, setVersion] = useState(0);
  const [processing, setProcessing] = useState({ busy: false, error: null, report: null });

  const annual = useApi(signal => ecoApi.annual(station, year, signal), [station, year, version]);
  const daily = useApi(signal => ecoApi.daily(station, { year, pollutant }, signal), [station, year, pollutant, version]);

  const runProcessing = async () => {
    setProcessing({ busy: true, error: null, report: null });
    try {
      const { data } = await ecoApi.process(station, year);
      setProcessing({ busy: false, error: null, report: data });
      setVersion(v => v + 1);
    } catch (err) {
      setProcessing({ busy: false, error: err.message, report: null });
    }
  };

  const points = (daily.data?.data ?? []).map(d => ({ date: d.date, value: d.pollutants[pollutant]?.mean ?? null }));
  const norm = daily.data?.norms?.[pollutant];

  return (
    <section className={`card ${annual.loading ? 'is-loading' : ''}`}>
      <div className="card-header">
        <h2>Річні показники якості повітря</h2>
        <div className="row-actions">
          <label className="field field-inline">
            <span className="field-label">Рік</span>
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={e => setYear(Number(e.target.value) || DEFAULT_YEAR)}
              className="input-year"
            />
          </label>
          <button className="btn" onClick={runProcessing} disabled={processing.busy}>
            {processing.busy ? 'Обробка…' : 'Обробити рік'}
          </button>
        </div>
      </div>

      {processing.error && <ErrorMessage message={processing.error} />}
      {processing.report && (
        <p className="flash">
          Очищено {processing.report.cleaning.records} записів, відкинуто:{' '}
          {Object.entries(processing.report.cleaning.summary)
            .map(([p, s]) => `${fieldLabel(p)} ${s.invalid}`)
            .join(', ')}
          . Діб: {processing.report.daily.days}, перевищень: {processing.report.alerts.total}.
        </p>
      )}

      {annual.error && <ErrorMessage message={annual.error} onRetry={annual.reload} />}
      {!annual.error && !annual.data && <Loader />}
      {annual.data && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-label">Діб з агрегатами</span>
              <span className="stat-value">{annual.data.days}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">ІЗА (річний)</span>
              <span className="stat-value">{formatValue(annual.data.iza.value, 2)}</span>
              {annual.data.iza.excluded.length > 0 && (
                <span className="stat-sub">без {annual.data.iza.excluded.map(fieldLabel).join(', ')}</span>
              )}
            </div>
            <div className="stat-tile">
              <span className="stat-label">Населення</span>
              <span className="stat-value stat-value-small">
                {annual.data.station.population?.toLocaleString('uk-UA') ?? '—'}
              </span>
            </div>
          </div>
          {annual.data.days === 0 ? (
            <p className="muted">
              За {year} рік добових агрегатів немає. Згенеруйте ряд (npm run seed:year) і натисніть «Обробити рік».
            </p>
          ) : (
            <>
              <AnnualTable annual={annual.data} />
              <AnnualPassport passport={annual.data.passport} />
            </>
          )}
        </>
      )}

      <div className="card-header chart-header">
        <h3>Добові середні</h3>
        <select value={pollutant} onChange={e => setPollutant(e.target.value)}>
          {POLLUTANTS.map(p => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {daily.error && <ErrorMessage message={daily.error} onRetry={daily.reload} />}
      {daily.data && <DailyChart points={points} norm={norm?.gdk_sd ?? null} unit={norm?.unit ?? ''} label={fieldLabel(pollutant)} />}
    </section>
  );
}

export default AirQualityPanel;
