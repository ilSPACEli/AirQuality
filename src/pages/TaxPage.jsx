import { useState } from 'react';
import { taxApi } from '../api/client.js';
import DataTable from '../components/DataTable.jsx';
import Passport from '../components/eco/Passport.jsx';
import { ErrorMessage, Loader } from '../components/Status.jsx';
import { useApi } from '../hooks/useApi.js';

const EXAMPLE = {
  enterprise: { name: 'ТОВ «АСТОР ІНВЕСТ» (ЄДРПОУ 41571920)', region: 'Одеська область, м. Одеса' },
  year: 2026,
  quarter: 4,
  emissions: [
    { code: 'NOX', mass_t: '0.21175' },
    { code: 'CO', mass_t: '0.121' },
    { code: 'SOLIDS', mass_t: '0.231' },
    { code: 'HC', mass_t: '0.00175' },
    { code: 'HC', mass_t: '0.0015' },
    { code: '__class', name: 'Азоту (1) оксид N2O (немає ГДКм.р. і ОБРВ, п. 243.5)', hazard_class: 'I', mass_t: '0.00075' },
    { code: 'CO2', mass_t: '41.305', annual_mass_t: '165.22' }
  ],
  discharges: [],
  waste: []
};

const EMPTY = {
  emissions: { code: 'NOX', mass_t: '' },
  discharges: { code: 'NH4', mass_t: '', receiver: 'river' },
  waste: { name: '', hazard_class: 'IV', mass_t: '', within_settlement: false, unprotected_dump: false }
};

const RECEIVERS = { river: 'Річка', pond_lake: 'Ставок / озеро (×1,5)', other: 'Інше' };
const WASTE_CLASSES = ['I', 'II', 'III', 'IV', 'IV_MINING', 'NONE'];
const num = v => (v === '' || v === undefined ? undefined : Number(v));

// POST /eco/tax/quarter
function toPayload(form) {
  return {
    enterprise: { name: form.enterprise.name, region: form.enterprise.region || undefined },
    year: Number(form.year),
    quarter: Number(form.quarter),
    emissions: form.emissions.map(e =>
      e.code === '__class'
        ? { name: e.name, hazard_class: e.hazard_class, mass_t: num(e.mass_t) }
        : { code: e.code, mass_t: num(e.mass_t), annual_mass_t: e.code === 'CO2' ? num(e.annual_mass_t) : undefined }
    ),
    discharges: form.discharges.map(d => ({ code: d.code, mass_t: num(d.mass_t), receiver: d.receiver })),
    waste: form.waste.map(w => ({
      name: w.name || undefined,
      hazard_class: w.hazard_class,
      mass_t: num(w.mass_t),
      within_settlement: w.within_settlement,
      unprotected_dump: w.unprotected_dump
    }))
  };
}

function groupErrors(details) {
  const byRow = {};
  for (const { field, message } of details) {
    const key = field.split('.').slice(0, 2).join('.');
    (byRow[key] ??= []).push(message);
  }
  return byRow;
}

function RowError({ errors, id }) {
  return errors[id] ? <div className="row-error">{errors[id].join('; ')}</div> : null;
}

function TaxPage() {
  const rates = useApi(signal => taxApi.rates(signal), []);
  const [form, setForm] = useState(EXAMPLE);
  const [state, setState] = useState({ status: 'idle', result: null, passport: null, error: null, details: [] });

  const update = (section, i, patch) =>
    setForm(f => ({ ...f, [section]: f[section].map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  const add = section => setForm(f => ({ ...f, [section]: [...f[section], { ...EMPTY[section] }] }));
  const remove = (section, i) => setForm(f => ({ ...f, [section]: f[section].filter((_, j) => j !== i) }));

  const submit = async e => {
    e.preventDefault();
    setState(s => ({ ...s, status: 'loading', error: null, details: [] }));
    try {
      const { data, passport } = await taxApi.quarter(toPayload(form));
      setState({ status: 'success', result: data, passport, error: null, details: [] });
    } catch (err) {
      setState({ status: 'error', result: null, passport: null, error: err.message, details: err.details ?? [] });
    }
  };

  if (rates.error) return <ErrorMessage message={rates.error} onRetry={rates.reload} />;
  if (!rates.data) return <Loader />;

  const airNamed = rates.data.air.filter(r => r.basis === '243.1' || r.basis === '243.4');
  const waterNamed = rates.data.water.filter(r => r.basis === '245.1');
  const errors = groupErrors(state.details);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Екологічний податок за квартал</h1>
          <p className="muted">
            Варіант 4. ПКУ, ст. 249: Сп = Σ Mᵢ·Нпᵢ; Сс = Σ Mᵢ·Нпᵢ·Кос; Срв = Σ Нпᵢ·Mᵢ·Кт·Ко. Довідник ставок від{' '}
            {rates.data.version}.
          </p>
        </div>
      </div>

      <form className="card form" onSubmit={submit} noValidate>
        <div className="form-grid form-grid-4">
          <label className="field">
            <span className="field-label">Підприємство</span>
            <input
              value={form.enterprise.name}
              onChange={e => setForm(f => ({ ...f, enterprise: { ...f.enterprise, name: e.target.value } }))}
            />
          </label>
          <label className="field">
            <span className="field-label">Регіон</span>
            <input
              value={form.enterprise.region ?? ''}
              onChange={e => setForm(f => ({ ...f, enterprise: { ...f.enterprise, region: e.target.value } }))}
            />
          </label>
          <label className="field">
            <span className="field-label">Рік</span>
            <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
          </label>
          <label className="field">
            <span className="field-label">Квартал</span>
            <select value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))}>
              {[1, 2, 3, 4].map(q => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
        </div>
        <RowError errors={errors} id="enterprise.name" />
        <RowError errors={errors} id="quarter" />
        <RowError errors={errors} id="year" />

        <h3>Викиди в атмосферне повітря (ст. 243)</h3>
        <table className="eco-table">
          <thead>
            <tr>
              <th>Речовина</th>
              <th>Маса за квартал, т</th>
              <th>CO₂ за рік, т</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.emissions.map((row, i) => (
              <tr key={i}>
                <td>
                  <select value={row.code} onChange={e => update('emissions', i, { code: e.target.value })}>
                    {airNamed.map(r => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.rate_uah_per_t} грн/т)
                      </option>
                    ))}
                    <option value="__class">Інша речовина – за класом небезпечності (п. 243.2)</option>
                  </select>
                  {row.code === '__class' && (
                    <div className="inline-fields">
                      <input
                        placeholder="Назва речовини"
                        value={row.name ?? ''}
                        onChange={e => update('emissions', i, { name: e.target.value })}
                      />
                      <select value={row.hazard_class ?? 'III'} onChange={e => update('emissions', i, { hazard_class: e.target.value })}>
                        {['I', 'II', 'III', 'IV'].map(c => (
                          <option key={c} value={c}>
                            клас {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <RowError errors={errors} id={`emissions.${i}`} />
                </td>
                <td>
                  <input type="number" step="any" min="0" value={row.mass_t} onChange={e => update('emissions', i, { mass_t: e.target.value })} />
                </td>
                <td>
                  {row.code === 'CO2' && (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={row.annual_mass_t ?? ''}
                      onChange={e => update('emissions', i, { annual_mass_t: e.target.value })}
                    />
                  )}
                </td>
                <td>
                  <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => remove('emissions', i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-small" onClick={() => add('emissions')}>
          + Речовина
        </button>

        <h3>Скиди у водні об’єкти (ст. 245)</h3>
        <table className="eco-table">
          <thead>
            <tr>
              <th>Речовина</th>
              <th>Маса за квартал, т</th>
              <th>Водний об’єкт</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.discharges.map((row, i) => (
              <tr key={i}>
                <td>
                  <select value={row.code} onChange={e => update('discharges', i, { code: e.target.value })}>
                    {waterNamed.map(r => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.rate_uah_per_t} грн/т)
                      </option>
                    ))}
                  </select>
                  <RowError errors={errors} id={`discharges.${i}`} />
                </td>
                <td>
                  <input type="number" step="any" min="0" value={row.mass_t} onChange={e => update('discharges', i, { mass_t: e.target.value })} />
                </td>
                <td>
                  <select value={row.receiver} onChange={e => update('discharges', i, { receiver: e.target.value })}>
                    {Object.entries(RECEIVERS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => remove('discharges', i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-small" onClick={() => add('discharges')}>
          + Речовина
        </button>

        <h3>Розміщення відходів (ст. 246)</h3>
        <table className="eco-table">
          <thead>
            <tr>
              <th>Відходи</th>
              <th>Клас</th>
              <th>Маса, т</th>
              <th>У межах нас. пункту / ближче 3 км (Кт = 3)</th>
              <th>Незахищене звалище (Ко = 3)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.waste.map((row, i) => (
              <tr key={i}>
                <td>
                  <input value={row.name} onChange={e => update('waste', i, { name: e.target.value })} />
                  <RowError errors={errors} id={`waste.${i}`} />
                </td>
                <td>
                  <select value={row.hazard_class} onChange={e => update('waste', i, { hazard_class: e.target.value })}>
                    {WASTE_CLASSES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="number" step="any" min="0" value={row.mass_t} onChange={e => update('waste', i, { mass_t: e.target.value })} />
                </td>
                <td className="center">
                  <input type="checkbox" checked={row.within_settlement} onChange={e => update('waste', i, { within_settlement: e.target.checked })} />
                </td>
                <td className="center">
                  <input type="checkbox" checked={row.unprotected_dump} onChange={e => update('waste', i, { unprotected_dump: e.target.checked })} />
                </td>
                <td>
                  <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => remove('waste', i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-small" onClick={() => add('waste')}>
          + Відходи
        </button>

        {state.status === 'error' && (
          <div className="status status-error" role="alert">
            <div>
              <strong>{state.error}</strong>
              {state.details.length > 0 && (
                <ul>
                  {state.details.map((d, i) => (
                    <li key={i}>
                      <span className="mono">{d.field}</span>: {d.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => setForm(EXAMPLE)}>
            Дані підприємства
          </button>
          <button type="submit" className="btn btn-primary" disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Розрахунок…' : 'Розрахувати податок'}
          </button>
        </div>
      </form>

      {state.status === 'loading' && <Loader text="Розрахунок…" />}
      {state.status === 'success' && <TaxResult result={state.result} passport={state.passport} />}
    </>
  );
}

const money = v => Number(v).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TaxResult({ result, passport }) {
  const base = [
    { key: 'no', title: '№', align: 'right' },
    { key: 'name', title: 'Найменування', render: r => <>{r.name}{r.note && <div className="muted small">{r.note}</div>}</> },
    { key: 'basis', title: 'Підстава', render: r => <span className="muted">{r.basis}</span> },
    { key: 'mass_t', title: 'Маса, т', align: 'right' },
    { key: 'rate', title: 'Ставка, грн/т', align: 'right', render: r => money(r.rate_uah_per_t) }
  ];
  const taxCol = { key: 'tax', title: 'Податок, грн', align: 'right', render: r => <strong>{money(r.tax_uah)}</strong> };
  const tables = [
    { title: 'Додаток 1. Викиди в атмосферне повітря', part: result.appendix1_emissions, columns: [...base, taxCol] },
    {
      title: 'Додаток 2. Скиди у водні об’єкти',
      part: result.appendix2_discharges,
      columns: [...base, { key: 'k_os', title: 'Кос', align: 'right' }, taxCol]
    },
    {
      title: 'Додаток 3. Розміщення відходів',
      part: result.appendix3_waste,
      columns: [...base, { key: 'k_t', title: 'Кт', align: 'right' }, { key: 'k_o', title: 'Ко', align: 'right' }, taxCol]
    }
  ];

  return (
    <>
      <section className="card">
        <h2>
          Податок за {result.period.quarter} квартал {result.period.year} року
        </h2>
        <div className="stat-tiles">
          {result.summary.map(s => (
            <div className="stat-tile" key={s.direction}>
              <span className="stat-label">{s.direction}</span>
              <span className="stat-value">{money(s.tax_uah)} грн</span>
            </div>
          ))}
          <div className="stat-tile stat-tile-total">
            <span className="stat-label">Разом</span>
            <span className="stat-value">{money(result.total_uah)} грн</span>
          </div>
        </div>
        {tables.map(t => (
          <div key={t.title}>
            <h3>{t.title}</h3>
            {t.part.rows.length === 0 ? (
              <p className="muted">Позицій немає.</p>
            ) : (
              <>
                <DataTable columns={t.columns} data={t.part.rows.map(r => ({ ...r, id: `${t.title}-${r.no}` }))} />
                <p className="right">
                  Усього: <strong>{money(t.part.total_uah)} грн</strong>
                </p>
              </>
            )}
          </div>
        ))}
      </section>

      <Passport passport={passport}>
        <dl className="passport-list">
          <dt>Методика</dt>
          <dd>{passport.method}</dd>
          <dt>Формули</dt>
          <dd>
            {Object.values(passport.formulas).map(f => (
              <div key={f} className="mono">
                {f}
              </div>
            ))}
          </dd>
          <dt>Дата ставок</dt>
          <dd>{passport.rates_date} (перший день кварталу)</dd>
          <dt>Ставки</dt>
          <dd>
            {passport.rates_used.map(r => (
              <div key={r.code}>
                <span className="mono">{r.code}</span> – {r.rate_uah_per_t} грн/т · {r.source} · з {r.valid_from}
              </div>
            ))}
          </dd>
          <dt>Коефіцієнти</dt>
          <dd>
            {passport.coefficients.map(c => (
              <div key={c.code}>
                <span className="mono">{c.code}</span> = {c.value} · {c.source}
              </div>
            ))}
          </dd>
          <dt>Округлення</dt>
          <dd>{passport.rounding}</dd>
          <dt>Версія довідника</dt>
          <dd>{passport.norms_version}</dd>
        </dl>
      </Passport>
    </>
  );
}

export default TaxPage;
