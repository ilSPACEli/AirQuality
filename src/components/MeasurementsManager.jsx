import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllStations, measurementsApi, stationsApi } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useFlash } from '../hooks/useFlash.js';
import {
  MEASUREMENT_FIELDS,
  PM25_LIMIT,
  POLLUTANTS,
  SOURCE_LABELS,
  cleanParams,
  dayEnd,
  dayStart,
  formatDateTime,
  formatValue
} from '../utils/format.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import DataTable from './DataTable.jsx';
import MeasurementForm from './MeasurementForm.jsx';
import Modal from './Modal.jsx';
import Pagination from './Pagination.jsx';
import { ErrorMessage, Flash, Loader } from './Status.jsx';

const EMPTY_FILTERS = { station: '', city: '', pollutant: '', from: '', to: '' };
const DEFAULT_SORT = '-measured_at';


function MeasurementsManager({ station, onDataChange }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [editing, setEditing] = useState(null); // { measurement? } — відкрита форма
  const [deleting, setDeleting] = useState(null); // вимірювання для видалення
  const [flash, showFlash] = useFlash();

  const city = useDebounce(filters.city.trim());

  const params = cleanParams({
    station: station ? undefined : filters.station,
    city: station ? undefined : city,
    pollutant: filters.pollutant,
    from: dayStart(filters.from),
    to: dayEnd(filters.to),
    sort,
    page,
    limit
  });

  const measurements = useApi(
    signal =>
      station
        ? stationsApi.measurements(station, params, signal)
        : measurementsApi.list(params, signal),
    [station, JSON.stringify(params)]
  );

  // Список станцій потрібен лише для фільтра і форми на загальній сторінці
  const stations = useApi(
    signal => (station ? Promise.resolve({ data: [], meta: null }) : fetchAllStations(signal)),
    [station]
  );
  const stationOptions = stations.data ?? [];

  const updateFilter = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1); // нові умови — починаємо з першої сторінки
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSort(DEFAULT_SORT);
    setPage(1);
  };

  const afterChange = message => {
    setEditing(null);
    setDeleting(null);
    showFlash(message);
    measurements.reload();
    onDataChange?.();
  };

  const handleSave = async payload => {
    if (editing.measurement) {
      await measurementsApi.replace(editing.measurement.id, payload);
      afterChange('Вимірювання оновлено');
    } else if (station) {
      const { station_id: _ignored, ...body } = payload;
      await stationsApi.addMeasurement(station, body);
      afterChange('Вимірювання додано');
    } else {
      await measurementsApi.create(payload);
      afterChange('Вимірювання додано');
    }
  };

  const handleDelete = async () => {
    await measurementsApi.remove(deleting.id);
    // Якщо видалили останній запис на сторінці — повертаємось на попередню
    if (measurements.data?.length === 1 && page > 1) setPage(page - 1);
    afterChange('Вимірювання видалено');
  };

  const columns = [
    {
      key: 'measured_at',
      title: 'Час',
      sortKey: 'measured_at',
      render: m => <span className="nowrap">{formatDateTime(m.measured_at)}</span>
    },
    !station && {
      key: 'station_id',
      title: 'Станція',
      sortKey: 'station_id',
      render: m => <Link to={`/stations/${m.station_id}`}>{m.station_id}</Link>
    },
    ...MEASUREMENT_FIELDS.map(f => ({
      key: f.key,
      title: (
        <>
          {f.label}
          <span className="unit">{f.unit}</span>
        </>
      ),
      align: 'right',
      sortKey: f.key === 'pm25' || f.key === 'pm10' ? f.key : undefined,
      render: m =>
        f.key === 'pm25' && m.pm25 > PM25_LIMIT ? (
          <span className="badge badge-danger" title={`Вище за норму ${PM25_LIMIT} мкг/м³`}>
            {formatValue(m.pm25)}
          </span>
        ) : (
          <span className={m[f.key] === null ? 'muted' : undefined}>{formatValue(m[f.key])}</span>
        )
    })),
    {
      key: 'source',
      title: 'Джерело',
      render: m => <span className="muted small">{SOURCE_LABELS[m.source] ?? m.source}</span>
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: m => (
        <div className="row-actions">
          <button className="btn btn-small" onClick={() => setEditing({ measurement: m })}>
            Змінити
          </button>
          <button className="btn btn-small btn-danger-ghost" onClick={() => setDeleting(m)}>
            Видалити
          </button>
        </div>
      )
    }
  ].filter(Boolean);

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) || sort !== DEFAULT_SORT;

  return (
    <section className="card">
      <div className="card-header">
        <h2>Вимірювання</h2>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          + Додати вимірювання
        </button>
      </div>

      <div className="filters">
        {!station && (
          <>
            <label className="filter">
              <span>Станція</span>
              <select value={filters.station} onChange={e => updateFilter('station', e.target.value)}>
                <option value="">Усі станції</option>
                {stationOptions.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>Місто</span>
              <input
                value={filters.city}
                onChange={e => updateFilter('city', e.target.value)}
                placeholder="Точна назва міста"
              />
            </label>
          </>
        )}
        <label className="filter">
          <span>Показник</span>
          <select value={filters.pollutant} onChange={e => updateFilter('pollutant', e.target.value)}>
            <option value="">Будь-який</option>
            {POLLUTANTS.map(p => (
              <option key={p.key} value={p.key}>
                є {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>З дати</span>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={e => updateFilter('from', e.target.value)} />
        </label>
        <label className="filter">
          <span>По дату</span>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={e => updateFilter('to', e.target.value)} />
        </label>
        <label className="filter">
          <span>На сторінці</span>
          <select
            value={limit}
            onChange={e => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            {[20, 50, 100, 200].map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {hasFilters && (
          <button className="btn btn-link" onClick={resetFilters}>
            Скинути
          </button>
        )}
      </div>

      {measurements.error ? (
        <ErrorMessage message={measurements.error} onRetry={measurements.reload} />
      ) : measurements.loading && !measurements.data ? (
        <Loader />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={measurements.data ?? []}
            sort={sort}
            onSortChange={next => {
              setSort(next);
              setPage(1);
            }}
            rowClassName={m => (m.pm25 > PM25_LIMIT ? 'row-warning' : undefined)}
            loading={measurements.loading}
            emptyText={hasFilters ? 'Немає вимірювань за цими умовами' : 'Вимірювань ще немає'}
          />
          <Pagination meta={measurements.meta} onPageChange={setPage} />
        </>
      )}

      {editing && (
        <Modal title={editing.measurement ? 'Редагування вимірювання' : 'Нове вимірювання'} onClose={() => setEditing(null)} width={720}>
          <MeasurementForm
            measurement={editing.measurement}
            stations={stationOptions}
            fixedStation={station}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Видалити вимірювання?"
          message={`Вимірювання станції ${deleting.station_id} за ${formatDateTime(deleting.measured_at)} буде видалено назавжди.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Flash message={flash} />
    </section>
  );
}

export default MeasurementsManager;
