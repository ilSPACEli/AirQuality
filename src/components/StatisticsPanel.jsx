import { stationsApi } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { MEASUREMENT_FIELDS, formatDateTime, formatValue } from '../utils/format.js';
import DataTable from './DataTable.jsx';
import { ErrorMessage, Loader } from './Status.jsx';

// Статистика станції з GET /stations/:id/statistics.
// reloadKey змінюється батьком, коли вимірювання додали або видалили.
function StatisticsPanel({ station, reloadKey }) {
  const { data: stats, loading, error, reload } = useApi(
    signal => stationsApi.statistics(station, {}, signal),
    [station, reloadKey]
  );

  if (error) return <ErrorMessage message={error} onRetry={reload} />;
  if (!stats) return <Loader />;

  if (stats.count === 0) {
    return (
      <section className="card">
        <h2>Статистика</h2>
        <p className="muted">Вимірювань ще немає.</p>
      </section>
    );
  }

  // Рядок таблиці на кожен показник, який станція реально передавала
  const rows = MEASUREMENT_FIELDS.filter(f => stats.parameters[f.key]?.count > 0).map(f => ({
    id: f.key,
    label: f.label,
    unit: f.unit,
    ...stats.parameters[f.key]
  }));

  const columns = [
    { key: 'label', title: 'Показник', render: r => <strong>{r.label}</strong> },
    { key: 'unit', title: 'Одиниці', render: r => <span className="muted">{r.unit}</span> },
    { key: 'count', title: 'Записів', align: 'right' },
    { key: 'avg', title: 'Середнє', align: 'right', render: r => formatValue(r.avg, 2) },
    { key: 'min', title: 'Мінімум', align: 'right', render: r => formatValue(r.min, 2) },
    { key: 'max', title: 'Максимум', align: 'right', render: r => formatValue(r.max, 2) }
  ];

  const exceedShare = stats.parameters.pm25?.count
    ? Math.round((stats.pm25_exceedances / stats.parameters.pm25.count) * 100)
    : 0;

  return (
    <section className={`card ${loading ? 'is-loading' : ''}`}>
      <h2>Статистика</h2>
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-label">Усього вимірювань</span>
          <span className="stat-value">{stats.count}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Період</span>
          <span className="stat-value stat-value-small">
            {formatDateTime(stats.period.from)} — {formatDateTime(stats.period.to)}
          </span>
        </div>
        <div className={`stat-tile ${stats.pm25_exceedances > 0 ? 'stat-tile-danger' : ''}`}>
          <span className="stat-label">PM2.5 вище {stats.pm25_limit} мкг/м³</span>
          <span className="stat-value">
            {stats.pm25_exceedances}
            {stats.parameters.pm25?.count > 0 && <span className="stat-sub"> ({exceedShare}%)</span>}
          </span>
        </div>
      </div>
      <DataTable columns={columns} data={rows} />
    </section>
  );
}

export default StatisticsPanel;
