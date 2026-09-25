import { useState } from 'react'

// Single-series line chart (speaker scores over time). One series: no legend, the card title names it.
// 2px line, 8px markers with a 2px surface ring, recessive grid, crosshair + tooltip on hover/touch.
export interface LinePoint { value: number; title: string; subtitle?: string }

const W = 640, H = 220, PAD = { l: 36, r: 12, t: 12, b: 24 }

export function ScoreLine({ points, domain, label }: { points: LinePoint[]; domain: [number, number]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [lo, hi] = domain
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1))
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b)
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  // nearest point to the pointer, in chart coordinates
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    let best = 0
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i })
    setHover(best)
  }
  const h = hover !== null ? points[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" role="img" aria-label={label}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted-foreground)">{v}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" />}
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5.5 : 4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
        ))}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}>
          <p className="text-base font-extrabold tabular-nums text-foreground">{h.value.toFixed(1)}</p>
          <p className="font-semibold text-foreground">{h.title}</p>
          {h.subtitle && <p className="text-muted-foreground">{h.subtitle}</p>}
        </div>
      )}
    </div>
  )
}

// Dot plot on a fixed score scale: averages that live in a narrow band (e.g. 60–80) stay comparable,
// which bars starting at zero could not show.
export function DotScale({ rows, domain, empty }: { rows: { label: string; value: number | null; note?: string }[]; domain: [number, number]; empty: string }) {
  const [lo, hi] = domain
  const pos = (v: number) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`
  return (
    <ul className="space-y-3">
      {rows.map(r => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 text-sm" title={r.note}>
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="relative h-2 rounded-full bg-muted">
            {r.value !== null && <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-chart-1" style={{ left: pos(r.value) }} />}
          </span>
          <span className="text-right font-bold tabular-nums">{r.value === null ? <span className="font-normal text-muted-foreground">{empty}</span> : r.value.toFixed(1)}</span>
        </li>
      ))}
      <li className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] gap-3 text-[11px] text-muted-foreground">
        <span />
        <span className="flex justify-between tabular-nums"><span>{lo}</span><span>{(lo + hi) / 2}</span><span>{hi}</span></span>
        <span />
      </li>
    </ul>
  )
}
