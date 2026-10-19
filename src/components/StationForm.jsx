import { useState } from 'react';
import { MEASUREMENT_FIELDS } from '../utils/format.js';
import { splitApiError } from '../utils/apiErrors.js';
import FormField from './FormField.jsx';

const FIELD_NAMES = ['code', 'name', 'city', 'latitude', 'longitude', 'active', 'measurement_types'];

function toFormState(station) {
  return {
    code: station?.code ?? '',
    name: station?.name ?? '',
    city: station?.city ?? '',
    latitude: station?.latitude ?? '',
    longitude: station?.longitude ?? '',
    active: station?.active ?? true,
    measurement_types: station?.measurement_types ?? ['pm25', 'pm10']
  };
}

// Форма створення та редагування станції.
// station: існуюча станція (режим редагування) або undefined (створення).
// onSubmit(payload) повертає Promise; помилки валідації з бекенду показуються під полями.
function StationForm({ station, onSubmit, onCancel }) {
  const isEdit = Boolean(station);
  const [form, setForm] = useState(() => toFormState(station));
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const toggleType = key => {
    const types = form.measurement_types.includes(key)
      ? form.measurement_types.filter(t => t !== key)
      : [...form.measurement_types, key];
    setField('measurement_types', types);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setGeneralError(null);

    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      active: form.active,
      measurement_types: MEASUREMENT_FIELDS.map(f => f.key).filter(k => form.measurement_types.includes(k))
    };
    if (!isEdit) payload.code = form.code.trim().toUpperCase();

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
        <FormField label="Код станції" error={errors.code} hint="Наприклад KYIV-01: A–Z, 0–9, «-», «_»">
          <input
            value={form.code}
            onChange={e => setField('code', e.target.value.toUpperCase())}
            disabled={isEdit}
            required
            maxLength={40}
            autoFocus={!isEdit}
          />
        </FormField>
        <FormField label="Місто" error={errors.city}>
          <input value={form.city} onChange={e => setField('city', e.target.value)} required maxLength={60} />
        </FormField>
      </div>

      <FormField label="Назва" error={errors.name}>
        <input
          value={form.name}
          onChange={e => setField('name', e.target.value)}
          required
          maxLength={120}
          autoFocus={isEdit}
        />
      </FormField>

      <div className="form-grid">
        <FormField label="Широта" error={errors.latitude} hint="44.0 – 52.5">
          <input
            type="number"
            step="any"
            value={form.latitude}
            onChange={e => setField('latitude', e.target.value)}
            required
          />
        </FormField>
        <FormField label="Довгота" error={errors.longitude} hint="22.0 – 40.5">
          <input
            type="number"
            step="any"
            value={form.longitude}
            onChange={e => setField('longitude', e.target.value)}
            required
          />
        </FormField>
      </div>

      <fieldset className="field">
        <legend className="field-label">Що вимірює станція</legend>
        <div className="checkbox-group">
          {MEASUREMENT_FIELDS.map(f => (
            <label key={f.key} className="checkbox">
              <input
                type="checkbox"
                checked={form.measurement_types.includes(f.key)}
                onChange={() => toggleType(f.key)}
              />
              {f.label}
            </label>
          ))}
        </div>
        {errors.measurement_types && <span className="field-error">{errors.measurement_types}</span>}
      </fieldset>

      <label className="checkbox">
        <input type="checkbox" checked={form.active} onChange={e => setField('active', e.target.checked)} />
        Станція активна
      </label>

      {generalError && <p className="form-error">{generalError}</p>}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Збереження…' : isEdit ? 'Зберегти' : 'Створити'}
        </button>
      </div>
    </form>
  );
}

export default StationForm;
