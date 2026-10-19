import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { stationsApi } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import MeasurementsManager from '../components/MeasurementsManager.jsx';
import Modal from '../components/Modal.jsx';
import StatisticsPanel from '../components/StatisticsPanel.jsx';
import StationForm from '../components/StationForm.jsx';
import { ErrorMessage, Loader } from '../components/Status.jsx';
import { useApi } from '../hooks/useApi.js';
import { fieldLabel, formatDateTime } from '../utils/format.js';

// Сторінка однієї станції: картка, статистика і її вимірювання
function StationDetailsPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Лічильник змін вимірювань: статистика перезавантажується, коли він зростає
  const [statsKey, setStatsKey] = useState(0);

  const { data: station, error, reload } = useApi(signal => stationsApi.get(code, signal), [code]);

  if (error) {
    return (
      <>
        <Link to="/stations" className="back-link">
          ← До списку станцій
        </Link>
        <ErrorMessage message={error} onRetry={reload} />
      </>
    );
  }
  if (!station || station.code !== code.toUpperCase()) return <Loader />;

  const handleSave = async payload => {
    await stationsApi.replace(station.code, payload);
    setEditing(false);
    reload();
  };

  const handleDelete = async () => {
    await stationsApi.remove(station.code);
    navigate('/stations');
  };

  return (
    <>
      <Link to="/stations" className="back-link">
        ← До списку станцій
      </Link>

      <div className="page-header">
        <div>
          <h1>
            {station.name}{' '}
            <span className={`badge ${station.active ? 'badge-ok' : 'badge-off'}`}>
              {station.active ? 'активна' : 'вимкнена'}
            </span>
          </h1>
          <p className="muted">
            <span className="mono">{station.code}</span> · {station.city} ·{' '}
            <span className="mono">
              {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
            </span>
          </p>
          {station.measurement_types?.length > 0 && (
            <div className="tags">
              {station.measurement_types.map(t => (
                <span key={t} className="tag">
                  {fieldLabel(t)}
                </span>
              ))}
            </div>
          )}
          <p className="muted small">Оновлено: {formatDateTime(station.updated_at)}</p>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => setEditing(true)}>
            Змінити
          </button>
          <button className="btn btn-danger-ghost" onClick={() => setDeleting(true)}>
            Видалити
          </button>
        </div>
      </div>

      <StatisticsPanel station={station.code} reloadKey={statsKey} />

      <MeasurementsManager station={station.code} onDataChange={() => setStatsKey(k => k + 1)} />

      {editing && (
        <Modal title={`Редагування станції ${station.code}`} onClose={() => setEditing(false)}>
          <StationForm station={station} onSubmit={handleSave} onCancel={() => setEditing(false)} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Видалити станцію ${station.code}?`}
          message="Разом зі станцією буде видалено всі її вимірювання. Дію не можна скасувати."
          onConfirm={handleDelete}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}

export default StationDetailsPage;
