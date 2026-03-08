import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

/**
 * Tissue groups: each maps to one or more Sei sequence classes.
 * The bar value = max score across that group's classes for the top candidate.
 */
const TISSUE_GROUPS = [
  { name: 'Liver',        keys: ['E9 Liver / Intestine'] },
  { name: 'Brain',        keys: ['E3 Brain / Melanocyte', 'E10 Brain'] },
  { name: 'Blood/Immune', keys: ['E5 B-cell-like', 'E7 Monocyte / Macrophage', 'E11 T-cell', 'E12 Erythroblast-like'] },
  { name: 'Stem',         keys: ['E1 Stem cell'] },
  { name: 'Promoter',     keys: ['P Promoter'] },
  { name: 'Multi-tissue', keys: ['E2 Multi-tissue', 'E4 Multi-tissue'] },
]

/** Map tissue key → which bar group to highlight */
const TISSUE_HIGHLIGHT = {
  liver:   'Liver',
  cardiac: 'Blood/Immune',
  neural:  'Brain',
  blood:   'Blood/Immune',
}

const BAR_COLOR = '#334155'
const HIGHLIGHT_COLOR = '#22d3ee'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '6px',
        padding: '8px 12px',
        color: '#e2e8f0',
        fontSize: '12px',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.name}</div>
      <div>
        Score: <span style={{ color: '#22d3ee' }}>{d.score.toFixed(4)}</span>
      </div>
    </div>
  )
}

export default function Heatmap({ tissue, scoringData, interpretationData }) {
  const barData = useMemo(() => {
    if (!scoringData || scoringData.length === 0) return null

    // Find the top candidate: match ranking[0].sequence against scoringData,
    // or fall back to first candidate sorted by specificity_ratio
    let topCandidate = null
    const topSeq = interpretationData?.ranking?.[0]?.sequence
    if (topSeq) {
      topCandidate = scoringData.find((d) => d.sequence === topSeq)
    }
    if (!topCandidate) {
      // Fallback: pick highest specificity_ratio from scoring data
      topCandidate = [...scoringData].sort(
        (a, b) => (b.specificity_ratio ?? 0) - (a.specificity_ratio ?? 0)
      )[0]
    }

    const scores = topCandidate?.sei_scores ?? {}
    const highlightGroup = TISSUE_HIGHLIGHT[tissue] || 'Liver'

    return TISSUE_GROUPS.map((group) => {
      const maxScore = Math.max(
        ...group.keys.map((k) => scores[k] ?? 0),
        0
      )
      return {
        name: group.name,
        score: maxScore,
        isTarget: group.name === highlightGroup,
      }
    })
  }, [tissue, scoringData, interpretationData])

  if (!barData) {
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

  const specRatio = interpretationData?.ranking?.[0]?.specificity_ratio

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: '#94a3b8' }}>
          Tissue Specificity — Top Candidate
        </h2>
        {specRatio != null && (
          <span className="text-xs" style={{ color: '#475569' }}>
            <span style={{ color: '#22d3ee' }}>★</span> specificity{' '}
            <span style={{ color: '#94a3b8' }}>{specRatio.toFixed(2)}x</span>
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={barData}
            margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.isTarget ? HIGHLIGHT_COLOR : BAR_COLOR}
                  opacity={entry.isTarget ? 1 : 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
