"use client";
import { useEffect, useId, useRef, useState } from "react";
import { money } from "@/lib/sales/domain";
import type { SalesPoint } from "@/lib/sales/dashboard";
import { Select } from "../ui/select";

/** A small SVG time series; exact values are also available by keyboard and table. */
export function SalesChart({ points, granularity, hasSales, timezone }: { points: SalesPoint[]; granularity: string; hasSales: boolean; timezone: string }) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [hasSales]);
  if (!hasSales) return <p className="dashboard-empty">No completed sales in this period.</p>;
  const index = Math.min(selected, points.length - 1), active = points[index];
  const height = 240, left = 74, right = 16, top = 20, bottom = 36;
  const max = Math.max(100, ...points.map(point => point.cents));
  const x = (i: number) => left + i / Math.max(1, points.length - 1) * (width - left - right);
  const y = (value: number) => height - bottom - value / max * (height - top - bottom);
  const path = points.map((point, i) => `${i ? "L" : "M"}${x(i)},${y(point.cents)}`).join(" ");
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const short = (label: string) => label.includes(" · ") ? label.split(" · ")[1] : label.split(" – ")[0].replace(/, \d{4}$/, "");
  const compactMoney = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(value / 100);
  return <>
    <p className="dashboard-chart-caption">{granularity} net sales · {timezone}</p>
    <div className="chart-plot">
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="dashboard-line-chart" role="img" aria-labelledby={`${id}-title ${id}-description`}
      onPointerDown={() => setInspecting(true)} onPointerLeave={() => setInspecting(false)}
      onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const coordinate = (event.clientX - bounds.left) / bounds.width * width;
        setSelected(Math.max(0, Math.min(points.length - 1, Math.round((coordinate - left) / (width - left - right) * (points.length - 1)))));
        setInspecting(true);
      }}>
      <title id={`${id}-title`}>Net Sales performance in PHP</title>
      <desc id={`${id}-description`}>{granularity} sales. Expand View chart data for keyboard inspection and a table of exact values.</desc>
      {[0, 0.5, 1].map(ratio => <g key={ratio}>
        <line x1={left} x2={width - right} y1={y(max * ratio)} y2={y(max * ratio)} className="chart-gridline" />
        <text x={left - 10} y={y(max * ratio) + 4} textAnchor="end">{compactMoney(max * ratio)}</text>
      </g>)}
      <path d={path} className="chart-line" />
      <line x1={x(index)} x2={x(index)} y1={top} y2={height - bottom} className="chart-guide" />
      <circle cx={x(index)} cy={y(active.cents)} r={5} className="chart-point" />
      {ticks.map((i, tick) => <text key={i} x={x(i)} y={height - 12} textAnchor={tick === 0 ? "start" : tick === ticks.length - 1 ? "end" : "middle"}>{short(points[i].label)}</text>)}
    </svg>
    {inspecting && <div role="tooltip" id={`${id}-tooltip`} className="chart-tooltip" style={{ left: Math.max(0, Math.min(width - 192, x(index) - 96)) }}><span>{active.label}</span><strong>{money(active.cents)}</strong></div>}
    </div>
    <details className="chart-details" onToggle={event => { if (!event.currentTarget.open) setInspecting(false); }}><summary>View chart data</summary>
    <div className="chart-inspector">
      <label className="field">Inspect sales period<Select value={String(index)} aria-describedby={inspecting ? `${id}-tooltip` : undefined} onBlur={() => setInspecting(false)} onValueChange={value => { setSelected(Number(value)); setInspecting(true); }} options={points.map((point, i) => ({ value: String(i), label: point.label }))} /></label>
      <output aria-label="Selected period net sales">{money(active.cents)}</output>
    </div>
    <div className="chart-data chart-data-scroll" tabIndex={0} role="region" aria-label="Sales chart data"><table><caption className="sr-only">{granularity} net sales in PHP</caption><thead><tr><th scope="col">Period</th><th scope="col">Net Sales</th></tr></thead><tbody>{points.map(point => <tr key={point.label}><th scope="row">{point.label}</th><td>{money(point.cents)}</td></tr>)}</tbody></table></div></details>
  </>;
}
