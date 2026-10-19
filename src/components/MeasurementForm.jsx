import { useState } from 'react';
import { MEASUREMENT_FIELDS, fromLocalInput, toLocalInput } from '../utils/format.js';
import { splitApiError } from '../utils/apiErrors.js';
import FormField from './FormField.jsx';

const FIELD_NAMES = ['station_id', 'measured_at', ...MEASUREMENT_FIELDS.map(f => f.key)];

function toFormState(measurement, fixedStation) {
  const values = Object.fromEntries(
    MEASUREMENT_FIELDS.map(f => [f.key, measurement?.[f.key] ?? ''])
  );
  return {
    station_id: fixedStation ?? measurement?.station_id ?? '',
    measured_at: toLocalInput(measurement?.measured_at),
    ...values
  };
}

function MeasurementForm({ measurement, stations = [], fixedStation, onSubmit, onCancel }) {
  const isEdit = Boolean(measurement);
  const [form, setForm] = useState(() => toFormState(measurement, fixedStation));
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setGeneralError(null);

    if (!form.measured_at) {
      setErrors(prev => ({ ...prev, measured_at: 'Вкажіть час вимірювання' }));
      return;
    }

    const timeUnchanged = isEdit && form.measured_at === toLocalInput(measurement.measured_at);
    const payload = {
      station_id: form.station_id,
      measured_at: timeUnchanged ? measurement.measured_at : fromLocalInput(form.measured_at)
    };
    for (const f of MEASUREMENT_FIELDS) {
      const raw = String(form[f.key]).trim();
      payload[f.key] = raw === '' ? null : Number(raw.replace(',', '.'));
    }

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      const { fieldErrors, general } = splitApiError(err, FIELD_NAMES);
      setErrors(fieldErrors);
      setGeneralError(general);
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <FormField label="Станція" error={errors.station_id}>
          {fixedStation ? (
            <input value={fixedStation} disabled />
          ) : (
            <select value={form.station_id} onChange={e => setField('station_id', e.target.value)} required>
              <option value="">Оберіть станцію…</option>
              {stations.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.city}, {s.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Час вимірювання" error={errors.measured_at} hint="Місцевий час">
          <input
            type="datetime-local"
            value={form.measured_at}
            max={toLocalInput()}
            onChange={e => setField('measured_at', e.target.value)}
            required
          />
        </FormField>
      </div>

      <p className="muted small">Залиште поле порожнім, якщо сенсор не передав значення.</p>

      <div className="form-grid form-grid-4">
        {MEASUREMENT_FIELDS.map(f => (
          <FormField key={f.key} label={`${f.label}, ${f.unit}`} error={errors[f.key]}>
            <input
              type="number"
              step="any"
              min={f.min}
              max={f.max}
              value={form[f.key]}
              onChange={e => setField(f.key, e.target.value)}
              placeholder="—"
            />
          </FormField>
        ))}
      </div>

      {generalError && <p className="form-error">{generalError}</p>}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Збереження…' : isEdit ? 'Зберегти' : 'Додати'}
        </button>
      </div>
    </form>
  );
}

export default MeasurementForm;
