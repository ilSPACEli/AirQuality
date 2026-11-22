import { useMemo, useState } from 'react';
import { formatValue } from '../../utils/format.js';

const W = 820;
const H = 280;
const PAD = { left: 52, right: 16, top: 16, bottom: 30 };
const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

function niceTicks(max, count = 5) {
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function DailyChart({ points, norm, unit, label }) {
  const [hover, setHover] = useState(null);

  const { path, x, y, ticks, months } = useMemo(() => {
    const values = points.map(p => p.value).filter(v => v !== null);
    const top = Math.max(...values, norm ?? 0, 1) * 1.1;
    const ticks = niceTicks(top);
    const yMax = ticks.at(-1);
    const n = Math.max(points.length - 1, 1);
    const x = i => PAD.left + (i / n) * (W - PAD.left - PAD.right);
    const y = v => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);

    let path = '';
    let pen = false;
    points.forEach((p, i) => {
      if (p.value === null) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      pen = true;
    });

    const months = points
      .map((p, i) => ({ i, month: Number(p.date.slice(5, 7)), day: p.date.slice(8) }))
      .filter(m => m.day === '01');
    return { path, x, y, ticks, months };
  }, [points, norm]);

  if (points.length === 0) return <p className="muted">Добових агрегатів немає: обробіть рік.</p>;

  const onMove = e => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(i >= 0 && i < points.length ? i : null);
  };

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Добові середні ${label}, ${unit}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map(t => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {formatValue(t, 2)}
            </text>
          </g>
        ))}
        {months.map(m => (
          <text key={m.i} className="chart-axis" x={x(m.i)} y={H - 10} textAnchor="start">
            {MONTHS[m.month - 1]}
          </text>
        ))}
        <path className="chart-line" d={path} />
        {norm !== null && norm !== undefined && (
          <g>
            <line className="chart-norm" x1={PAD.left} x2={W - PAD.right} y1={y(norm)} y2={y(norm)} />
            <text className="chart-norm-label" x={W - PAD.right - 4} y={y(norm) - 6} textAnchor="end">
              ГДК с.д. {formatValue(norm, 3)} {unit}
            </text>
          </g>
        )}
        {hovered && (
          <g>
            <line className="chart-cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
            {hovered.value !== null && <circle className="chart-dot" cx={x(hover)} cy={y(hovered.value)} r="4" />}
          </g>
        )}
      </svg>
      <div className="chart-caption">
        {hovered ? (
          <>
            <strong>{hovered.date}</strong>:{' '}
            {hovered.value === null ? 'неповна доба' : `${formatValue(hovered.value, 2)} ${unit}`}
            {hovered.value !== null && norm ? ` (K = ${formatValue(hovered.value / norm, 2)})` : ''}
          </>
        ) : (
          <span className="muted">Наведіть курсор на графік, щоб побачити значення доби</span>
        )}
      </div>
    </div>
  );
}

export default DailyChart;
