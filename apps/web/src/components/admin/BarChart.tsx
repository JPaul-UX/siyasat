import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Chevron } from '../bits';

export interface ChartSeries {
  key: string;
  /** What one unit is called, for the legend and tooltip, e.g. "Lookups". */
  label: string;
  color: string;
}

interface Props {
  /** What the chart shows, e.g. "Sign-ups per day". Its accessible name. */
  title: string;
  /** YYYY-MM-DD, oldest first. */
  days: string[];
  /** Stacked bottom to top in this order. */
  series: ChartSeries[];
  value: (dayIndex: number, key: string) => number;
  height?: number;
}

/** The two series colours, checked for colour-blind separation against the white card surface. */
export const SERIES_COLORS = { primary: '#941a1e', secondary: '#d4a72c' } as const;

const fmt = (n: number) => n.toLocaleString();
const dayDate = (day: string) => new Date(day + 'T00:00:00');
const shortDay = (day: string) => dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const longDay = (day: string) => dayDate(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** A top for the axis at a round number, and the ticks up to it. Counts, so steps are whole. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough)!);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t);
  return { top, ticks };
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : fmt(n));

/** A column with a rounded top and a square foot. */
function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Columns per day, stacked when there is more than one series. Hover or arrow keys show a day's numbers;
 * every number is also in the table view underneath.
 */
export function BarChart({ title, days, series, value, height = 230 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(Math.max(260, Math.floor(el.clientWidth)));
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const totals = days.map((_, i) => series.reduce((sum, s) => sum + value(i, s.key), 0));
  const max = Math.max(0, ...totals);
  const { top, ticks } = niceScale(max);
  const left = Math.max(28, compact(top).length * 7 + 14);
  const M = { top: 22, right: 6, bottom: 28, left };
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(24, slot - 4));
  const baseline = M.top + plotH;
  const scale = (v: number) => (plotH * v) / top;
  const peak = max > 0 ? totals.indexOf(max) : -1;
  const every = plotW < 420 ? 10 : 7;
  const centre = (i: number) => M.left + slot * i + slot / 2;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
  };

  // The tooltip sits beside the column it describes, on the side with more room, so it never covers the bar.
  const tipSide = active !== null && centre(active) > width / 2 ? 'left' : 'right';
  const tipX = active === null ? 0 : centre(active) + (tipSide === 'right' ? 1 : -1) * (slot / 2 + 6);
  const describe = (i: number) =>
    `${longDay(days[i]!)}: ` + series.map((s) => `${fmt(value(i, s.key))} ${s.label.toLowerCase()}`).join(', ');

  return (
    <div className="chart">
      {series.length > 1 && (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.key}>
              <i style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={wrap}
        className="chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <svg width={width} height={height} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={width - M.right} y1={baseline - scale(t)} y2={baseline - scale(t)} />
              <text className="ytick" x={M.left - 8} y={baseline - scale(t)} dy="0.32em" textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {active !== null && <rect className="band" x={M.left + slot * active} y={M.top - 6} width={slot} height={plotH + 6} rx={6} />}
          {days.map((day, i) => {
            const x = centre(i) - barW / 2;
            let stacked = 0;
            const segments = series.map((s) => ({ s, v: value(i, s.key) })).filter((seg) => seg.v > 0);
            return (
              <g key={day}>
                {segments.map(({ s, v }, k) => {
                  // A 2px gap in the surface colour separates stacked segments; it comes out of the upper one.
                  const gap = k > 0 ? 2 : 0;
                  const h = Math.max(2, scale(v) - gap);
                  const y = baseline - stacked - gap - h;
                  stacked += gap + h;
                  const isTop = k === segments.length - 1;
                  return isTop ? (
                    <path key={s.key} d={topRounded(x, y, barW, h)} fill={s.color} />
                  ) : (
                    <rect key={s.key} x={x} y={y} width={barW} height={h} fill={s.color} />
                  );
                })}
              </g>
            );
          })}
          {peak >= 0 && active === null && (
            <text className="peak" x={centre(peak)} y={baseline - scale(max) - 7} textAnchor="middle">
              {fmt(max)}
            </text>
          )}
          {days.map((day, i) => {
            if ((n - 1 - i) % every !== 0) return null;
            const x = centre(i);
            const anchor = x + 26 > width ? 'end' : x - 26 < M.left ? 'start' : 'middle';
            return (
              <text key={day} className="xtick" x={x} y={height - 8} textAnchor={anchor}>
                {i === n - 1 ? 'Today' : shortDay(day)}
              </text>
            );
          })}
          {/* Each day's whole column is its hover target, not just the painted bar. */}
          {days.map((day, i) => (
            <rect key={day} className="hit" x={M.left + slot * i} y={M.top - 6} width={slot} height={plotH + 6} onPointerEnter={() => setActive(i)} />
          ))}
        </svg>
        {active !== null && (
          <div className={`chart-tip ${tipSide}`} style={{ left: tipX, top: M.top }}>
            <b>{longDay(days[active]!)}</b>
            {series.map((s) => (
              <span key={s.key} className="row">
                <i style={{ background: s.color }} aria-hidden="true" />
                <strong>{fmt(value(active, s.key))}</strong> {s.label.toLowerCase()}
              </span>
            ))}
          </div>
        )}
        <span className="sr" aria-live="polite">
          {active !== null ? describe(active) : ''}
        </span>
      </div>
      <details className="tview">
        <summary>
          <Chevron /> Show as a table
        </summary>
        <div className="tview-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {series.map((s) => (
                  <th scope="col" key={s.key}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days
                .map((day, i) => (
                  <tr key={day}>
                    <th scope="row">{longDay(day)}</th>
                    {series.map((s) => (
                      <td key={s.key}>{fmt(value(i, s.key))}</td>
                    ))}
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
