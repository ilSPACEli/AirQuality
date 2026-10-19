import { useState } from 'react';
import { Link } from 'react-router-dom';
import { stationsApi } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import StationForm from '../components/StationForm.jsx';
import { ErrorMessage, Flash, Loader } from '../components/Status.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useFlash } from '../hooks/useFlash.js';
import { cleanParams, fieldLabel } from '../utils/format.js';

const PAGE_SIZE = 20;

function StationsPage() {
  const [cityInput, setCityInput] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // { station? } — відкрита форма
  const [deleting, setDeleting] = useState(null);
  const [flash, showFlash] = useFlash();

  const city = useDebounce(cityInput.trim());
  const params = cleanParams({ city, active, page, limit: PAGE_SIZE });

  const { data, meta, loading, error, reload } = useApi(
    signal => stationsApi.list(params, signal),
    [JSON.stringify(params)]
  );

  const afterChange = message => {
    setEditing(null);
    setDeleting(null);
    showFlash(message);
    reload();
  };

  const handleSave = async payload => {
    if (editing.station) {
      await stationsApi.replace(editing.station.code, payload);
      afterChange(`Станцію ${editing.station.code} оновлено`);
    } else {
      await stationsApi.create(payload);
      afterChange(`Станцію ${payload.code} створено`);
    }
  };

  const handleDelete = async () => {
    await stationsApi.remove(deleting.code);
    if (data?.length === 1 && page > 1) setPage(page - 1);
    afterChange(`Станцію ${deleting.code} видалено`);
  };

  const toggleActive = async station => {
    try {
      await stationsApi.patch(station.code, { active: !station.active });
      showFlash(`Станцію ${station.code} ${station.active ? 'вимкнено' : 'увімкнено'}`);
      reload();
    } catch (err) {
      showFlash(`Помилка: ${err.message}`);
    }
  };

  const columns = [
    {
      key: 'code',
      title: 'Код',
      render: s => (
        <Link to={`/stations/${s.code}`} className="mono">
          {s.code}
        </Link>
      )
    },
    { key: 'name', title: 'Назва' },
    { key: 'city', title: 'Місто' },
    {
      key: 'coords',
      title: 'Координати',
      render: s => (
        <span className="mono small">
          {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}
        </span>
      )
    },
    {
      key: 'measurement_types',
      title: 'Показники',
      render: s =>
        s.measurement_types?.length ? (
          <div className="tags">
            {s.measurement_types.map(t => (
              <span key={t} className="tag">
                {fieldLabel(t)}
              </span>
            ))}
          </div>
        ) : (
          <span className="muted">—</span>
        )
    },
    {
      key: 'active',
      title: 'Статус',
      render: s => (
        <button
          className={`badge badge-button ${s.active ? 'badge-ok' : 'badge-off'}`}
          onClick={() => toggleActive(s)}
          title="Натисніть, щоб змінити"
        >
          {s.active ? 'активна' : 'вимкнена'}
        </button>
      )
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: s => (
        <div className="row-actions">
          <button className="btn btn-small" onClick={() => setEditing({ station: s })}>
            Змінити
          </button>
          <button className="btn btn-small btn-danger-ghost" onClick={() => setDeleting(s)}>
            Видалити
          </button>
        </div>
      )
    }
  ];

  const hasFilters = Boolean(cityInput || active);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Станції моніторингу</h1>
          <p className="muted">Пункти спостереження за якістю атмосферного повітря</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          + Додати станцію
        </button>
      </div>

      <section className="card">
        <div className="filters">
          <label className="filter">
            <span>Місто</span>
            <input
              value={cityInput}
              onChange={e => {
                setCityInput(e.target.value);
                setPage(1);
              }}
              placeholder="Точна назва міста"
            />
          </label>
          <label className="filter">
            <span>Статус</span>
            <select
              value={active}
              onChange={e => {
                setActive(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Усі</option>
              <option value="true">Активні</option>
              <option value="false">Вимкнені</option>
            </select>
          </label>
          {hasFilters && (
            <button
              className="btn btn-link"
              onClick={() => {
                setCityInput('');
                setActive('');
                setPage(1);
              }}
            >
              Скинути
            </button>
          )}
        </div>

        {error ? (
          <ErrorMessage message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loader />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={data ?? []}
              rowKey={s => s.code}
              loading={loading}
              emptyText={hasFilters ? 'Станцій за цими умовами не знайдено' : 'Станцій ще немає'}
            />
            <Pagination meta={meta} onPageChange={setPage} />
          </>
        )}
      </section>

      {editing && (
        <Modal
          title={editing.station ? `Редагування станції ${editing.station.code}` : 'Нова станція'}
          onClose={() => setEditing(null)}
        >
          <StationForm station={editing.station} onSubmit={handleSave} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Видалити станцію ${deleting.code}?`}
          message="Разом зі станцією буде видалено всі її вимірювання. Дію не можна скасувати."
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Flash message={flash} />
    </>
  );
}

export default StationsPage;
