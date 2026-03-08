import { useState, useMemo } from 'react'

/**
 * Sei sequence classes to show as columns, grouped by tissue/function.
 * Ordered so biologically related classes are adjacent.
 */
const DISPLAY_CLASSES = [
  { key: 'E9 Liver / Intestine',      group: 'Liver',    label: 'Liver'    },
  { key: 'E3 Brain / Melanocyte',     group: 'Brain',    label: 'Brain'    },
  { key: 'E10 Brain',                 group: 'Brain',    label: 'Brain 2'  },
  { key: 'E5 B-cell-like',            group: 'Blood',    label: 'B-cell'   },
  { key: 'E7 Monocyte / Macrophage',  group: 'Blood',    label: 'Mono.'    },
  { key: 'E11 T-cell',                group: 'Blood',    label: 'T-cell'   },
  { key: 'E12 Erythroblast-like',     group: 'Blood',    label: 'Erythro.' },
  { key: 'E1 Stem cell',              group: 'Stem',     label: 'Stem'     },
  { key: 'P Promoter',                group: 'Promoter', label: 'Promoter' },
]

/**
 * Hardcoded mapping from tissue key (from orchestrator) to the Sei class
 * used for sorting and highlighting.
 */
const TISSUE_SORT_CLASS = {
  liver:   'E9 Liver / Intestine',
  cardiac: 'E5 B-cell-like',        // K562 proxy — best blood/cardiac marker
  neural:  'E3 Brain / Melanocyte',
  blood:   'E5 B-cell-like',
}

const GROUP_COLORS = {
  Liver:    '#0891b2',
  Brain:    '#7c3aed',
  Blood:    '#dc2626',
  Stem:     '#d97706',
  Promoter: '#64748b',
  Target:   '#22d3ee',
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Map a normalized score t ∈ [0,1] to a color.
 * Palette: dark blue (silent) → near-black (mid) → dark red (active).
 * Chosen to pop on a very dark background.
 */
function scoreToColor(t) {
  const c = Math.max(0, Math.min(1, t))
  let r, g, b
  if (c < 0.5) {
    const u = c * 2
    // rgb(0,40,160) → rgb(10,10,10)
    r = Math.round(lerp(0, 10, u))
    g = Math.round(lerp(40, 10, u))
    b = Math.round(lerp(160, 10, u))
  } else {
    const u = (c - 0.5) * 2
    // rgb(10,10,10) → rgb(210,30,30)
    r = Math.round(lerp(10, 210, u))
    g = Math.round(lerp(10, 30, u))
    b = Math.round(lerp(10, 30, u))
  }
  return `rgb(${r},${g},${b})`
}

const CELL_W = 42
const CELL_H = 26

export default function Heatmap({ tissue, scoringData, interpretationData }) {
  const [tooltip, setTooltip] = useState(null)

  const { top10, displayClasses, normalize, sortClass, highlightClass } = useMemo(() => {
    if (!scoringData || scoringData.length === 0) {
      return { top10: [], displayClasses: DISPLAY_CLASSES, normalize: () => 0.5, sortClass: null, highlightClass: null }
    }

    // Use hardcoded tissue → Sei class mapping for sorting and highlighting
    const highlightClass = TISSUE_SORT_CLASS[tissue] || 'E9 Liver / Intestine'
    const sortClass = highlightClass

    // Keep column order as defined — no reordering
    const displayClasses = DISPLAY_CLASSES

    // Sort all candidates by dominant class score, take top 10
    const sorted = [...scoringData].sort(
      (a, b) =>
        (b.sei_scores?.[sortClass] ?? 0) - (a.sei_scores?.[sortClass] ?? 0)
    )
    const top10 = sorted.slice(0, 10)

    // Global min/max across the displayed cells for normalization
    const allVals = top10.flatMap((d) =>
      displayClasses.map((c) => d.sei_scores?.[c.key] ?? 0)
    )
    const minVal = Math.min(...allVals)
    const maxVal = Math.max(...allVals)
    const range = maxVal - minVal || 1
    const normalize = (v) => (v - minVal) / range

    return { top10, displayClasses, normalize, sortClass, highlightClass }
  }, [tissue, scoringData])

  if (!scoringData || scoringData.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center text-center p-8"
        style={{ color: '#475569' }}
      >
        <div>
          <div className="text-5xl mb-4">📊</div>
          <p className="text-base font-semibold mb-1" style={{ color: '#64748b' }}>
            Tissue Specificity Scores
          </p>
          <p className="text-sm">
            Submit a design prompt to see tissue specificity scores
          </p>
        </div>
      </div>
    )
  }

  // Group headers spanning their columns
  const groups = []
  displayClasses.forEach((c) => {
    const last = groups[groups.length - 1]
    if (last && last.group === c.group) {
      last.count++
    } else {
      groups.push({ group: c.group, count: 1 })
    }
  })

  return (
    <div className="p-4 h-full overflow-auto relative">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: '#94a3b8' }}>
          Tissue Specificity Scores
        </h2>
        <span className="text-xs" style={{ color: '#475569' }}>
          top 10 of {scoringData.length} candidates · sorted by {sortClass}
        </span>
      </div>

      {/* Fixed tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y - 56,
            transform: 'translateX(-50%)',
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#e2e8f0',
            minWidth: '160px',
          }}
        >
          <div className="font-bold mb-0.5">Candidate {tooltip.ri + 1}</div>
          <div style={{ color: '#94a3b8', fontSize: '10px' }}>{tooltip.classKey}</div>
          <div>
            Score:{' '}
            <span style={{ color: '#22d3ee' }}>{tooltip.score.toFixed(4)}</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
          {/* Group header row */}
          <thead>
            <tr>
              <th style={{ width: '72px' }} />
              {groups.map((g, gi) => (
                <th
                  key={gi}
                  colSpan={g.count}
                  className="text-center pb-1 text-xs font-semibold"
                  style={{
                    color: GROUP_COLORS[g.group] || '#475569',
                    letterSpacing: '0.05em',
                    fontSize: '10px',
                  }}
                >
                  {g.group}
                </th>
              ))}
            </tr>

            {/* Class label row */}
            <tr>
              <th style={{ width: '72px' }} />
              {displayClasses.map((c, ci) => (
                <th
                  key={ci}
                  className="text-center"
                  style={{
                    width: `${CELL_W}px`,
                    fontSize: '9px',
                    color: c.key === highlightClass ? '#22d3ee' : '#64748b',
                    fontWeight: c.key === highlightClass ? 700 : 400,
                    paddingBottom: '4px',
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Data rows */}
          <tbody>
            {top10.map((cand, ri) => (
              <tr key={ri}>
                <td
                  className="text-right pr-2"
                  style={{
                    fontSize: '10px',
                    color: '#475569',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Cand. {ri + 1}
                </td>
                {displayClasses.map((c, ci) => {
                  const score = cand.sei_scores?.[c.key] ?? 0
                  const t = normalize(score)
                  const bg = scoreToColor(t)
                  const isTarget = c.key === highlightClass
                  return (
                    <td
                      key={ci}
                      style={{
                        background: bg,
                        width: `${CELL_W}px`,
                        height: `${CELL_H}px`,
                        border: isTarget
                          ? '1px solid rgba(34,211,238,0.35)'
                          : '1px solid #0f1117',
                        cursor: 'crosshair',
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltip({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          ri,
                          classKey: c.key,
                          score,
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color scale legend */}
      <div className="flex items-center gap-2 mt-4" style={{ maxWidth: '220px' }}>
        <span className="text-xs" style={{ color: '#475569' }}>
          low
        </span>
        <div
          className="flex-1 rounded"
          style={{
            height: '10px',
            background:
              'linear-gradient(to right, rgb(0,40,160), rgb(10,10,10), rgb(210,30,30))',
          }}
        />
        <span className="text-xs" style={{ color: '#475569' }}>
          high
        </span>
      </div>

      {/* Ranking from interpretation */}
      {interpretationData?.ranking?.length > 0 && (
        <div className="mt-4 text-xs" style={{ color: '#475569' }}>
          <span style={{ color: '#22d3ee' }}>★</span> Top candidate specificity ratio:{' '}
          <span style={{ color: '#94a3b8' }}>
            {interpretationData.ranking[0].specificity_ratio?.toFixed(2) ?? '—'}x
          </span>
        </div>
      )}
    </div>
  )
}
