import { fieldLabel, formatValue } from '../../utils/format.js';
import DataTable from '../DataTable.jsx';

const PERIOD_LABELS = { hour: 'год', day: 'доба', max8h: '8 год', year: 'рік' };
const pct = v => (v === null || v === undefined ? '—' : `${formatValue(v * 100, 1)} %`);

// Таблиця річних показників з GET /stations/:id/annual
function AnnualTable({ annual }) {
  const rows = Object.entries(annual.pollutants).map(([key, p]) => ({ id: key, key, ...p }));
  const digits = r => (r.key === 'co' ? 3 : 1);

  const columns = [
    { key: 'key', title: 'Речовина', render: r => <strong>{fieldLabel(r.key)}</strong> },
    { key: 'unit', title: 'Од.', render: r => <span className="muted">{r.unit}</span> },
    {
      key: 'coverage',
      title: 'Повнота',
      align: 'right',
      render: r => (
        <span className={r.hourly.complete ? '' : 'text-danger'} title={`${r.hourly.valid} з ${r.hourly.expected_hours} год`}>
          {pct(r.hourly.coverage)}
        </span>
      )
    },
    {
      key: 'invalid',
      title: 'Відкинуто',
      align: 'right',
      render: r => (
        <span title={`suspect: ${r.hourly.suspect}`}>{r.hourly.invalid}</span>
      )
    },
    {
      key: 'mean',
      title: 'Річне середнє',
      align: 'right',
      render: r =>
        r.annual_mean !== null ? (
          <strong>{formatValue(r.annual_mean, digits(r))}</strong>
        ) : (
          <span className="muted" title="Менше 90 % даних: річний показник не визначається">
            ({formatValue(r.annual_mean_raw, digits(r))})
          </span>
        )
    },
    { key: 'median', title: 'Медіана', align: 'right', render: r => formatValue(r.daily.median, digits(r)) },
    { key: 'min', title: 'Мін', align: 'right', render: r => formatValue(r.daily.min, digits(r)) },
    { key: 'max', title: 'Макс', align: 'right', render: r => formatValue(r.daily.max, digits(r)) },
    { key: 'p90', title: 'P90.4', align: 'right', render: r => formatValue(r.daily.p90_4, digits(r)) },
    { key: 'p98', title: 'P98', align: 'right', render: r => formatValue(r.daily.p98, digits(r)) },
    {
      key: 'exceed',
      title: 'Діб > ГДКс.д.',
      align: 'right',
      render: r => (
        <span className={r.daily.exceed_gdk_sd_days > 0 ? 'text-danger' : ''}>
          {r.daily.exceed_gdk_sd_days ?? '—'}
        </span>
      )
    },
    { key: 'gdk', title: 'ГДК с.д.', align: 'right', render: r => formatValue(r.gdk?.gdk_sd, 3) },
    {
      key: 'limits',
      title: 'Граничні величини (Порядок 827)',
      render: r =>
        r.compliance.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          <div className="limits">
            {r.compliance.map(c => (
              <span
                key={c.period}
                className={`badge ${c.ok === false ? 'badge-danger' : c.ok ? 'badge-ok' : 'badge-off'}`}
                title={c.source}
              >
                {PERIOD_LABELS[c.period]} {formatValue(c.limit, 1)}:{' '}
                {c.period === 'year'
                  ? c.value === null
                    ? 'неповний ряд'
                    : formatValue(c.value, 1)
                  : `${c.count}/${c.allowed}`}
              </span>
            ))}
          </div>
        )
    }
  ];

  return (
    <>
      <DataTable columns={columns} data={rows} />
      <p className="muted small">
        Медіана, мін/макс і перцентилі рахуються за добовими середніми повних діб (≥{' '}
        {annual.completeness_rule.day_min_hours} год). Річне середнє – за годинними значеннями, якщо їх ≥{' '}
        {annual.completeness_rule.year_min_share * 100} %; у дужках – середнє неповного ряду. Граничні величини:
        кількість перевищень / допустима кількість.
      </p>
    </>
  );
}

export default AnnualTable;
