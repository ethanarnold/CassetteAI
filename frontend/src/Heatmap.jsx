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
 * All 40 named Sei sequence classes (excluding low-signal L1–L7 and unnamed Group-41+).
 * Grouped by category for coloring; each entry is one bar.
 */
const SEI_CLASSES = [
  // Enhancers
  { key: 'E1 Stem cell',              short: 'Stem',        category: 'enhancer' },
  { key: 'E3 Brain / Melanocyte',     short: 'Brain/Mel',   category: 'enhancer' },
  { key: 'E5 B-cell-like',            short: 'B-cell',      category: 'enhancer' },
  { key: 'E7 Monocyte / Macrophage',  short: 'Mono/Mac',    category: 'enhancer' },

  { key: 'E9 Liver / Intestine',      short: 'Liver/Int',   category: 'enhancer' },
  { key: 'E10 Brain',                 short: 'Brain',       category: 'enhancer' },
  { key: 'E11 T-cell',                short: 'T-cell',      category: 'enhancer' },
  { key: 'E12 Erythroblast-like',     short: 'Erythro',     category: 'enhancer' },
  // Promoter / CTCF
  { key: 'P Promoter',                short: 'Promoter',    category: 'promoter' },
  { key: 'CTCF CTCF-Cohesin',         short: 'CTCF',        category: 'promoter' },
  // Transcription factors
  { key: 'TF1 NANOG / FOXA1',         short: 'NANOG/FX',    category: 'tf' },
  { key: 'TF2 CEBPB',                 short: 'CEBPB',       category: 'tf' },
  { key: 'TF3 FOXA1 / AR / ESR1',     short: 'FX/AR/ESR',   category: 'tf' },
  { key: 'TF4 OTX2',                  short: 'OTX2',        category: 'tf' },
  { key: 'TF5 AR',                    short: 'AR',           category: 'tf' },
  // Transcription
  { key: 'TN1 Transcription',         short: 'TN1',         category: 'transcription' },
  { key: 'TN2 Transcription',         short: 'TN2',         category: 'transcription' },
  { key: 'TN3 Transcription',         short: 'TN3',         category: 'transcription' },
  { key: 'TN4 Transcription',         short: 'TN4',         category: 'transcription' },
  // Polycomb
  { key: 'PC1 Polycomb / Heterochromatin', short: 'PC1',    category: 'polycomb' },
  { key: 'PC2 Weak Polycomb',         short: 'PC2',         category: 'polycomb' },
  { key: 'PC3 Polycomb',              short: 'PC3',         category: 'polycomb' },
  { key: 'PC4 Polycomb / Bivalent stem cell Enh', short: 'PC4', category: 'polycomb' },
  // Heterochromatin
  { key: 'HET1 Heterochromatin',      short: 'HET1',        category: 'heterochromatin' },
  { key: 'HET2 Heterochromatin',      short: 'HET2',        category: 'heterochromatin' },
  { key: 'HET3 Heterochromatin',      short: 'HET3',        category: 'heterochromatin' },
  { key: 'HET4 Heterochromatin',      short: 'HET4',        category: 'heterochromatin' },
  { key: 'HET5 Centromere',           short: 'HET5',        category: 'heterochromatin' },
  { key: 'HET6 Centromere',           short: 'HET6',        category: 'heterochromatin' },
]

/** Category colors */
const CATEGORY_COLORS = {
  enhancer:        '#3b82f6', // blue
  promoter:        '#a855f7', // purple
  tf:              '#f59e0b', // amber
  transcription:   '#6b7280', // gray
  polycomb:        '#ef4444', // red
  heterochromatin:  '#64748b', // slate
}

/** Always highlight: promoter/CTCF are desirable for any functional element */
const UNIVERSAL_HIGHLIGHT = [
  'P Promoter',
  'CTCF CTCF-Cohesin',
]

/** Map tissue key → tissue-specific enhancer + TF classes to highlight */
const TISSUE_HIGHLIGHT_KEYS = {
  liver:   ['E9 Liver / Intestine', 'TF1 NANOG / FOXA1', 'TF3 FOXA1 / AR / ESR1'],
  cardiac: ['E12 Erythroblast-like', 'TF2 CEBPB'],
  neural:  ['E3 Brain / Melanocyte', 'E10 Brain', 'TF4 OTX2'],
  blood:   ['E7 Monocyte / Macrophage', 'E11 T-cell', 'E5 B-cell-like', 'E12 Erythroblast-like', 'TF2 CEBPB'],
}

const HIGHLIGHT_BORDER = '#ffffff'

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
        maxWidth: 260,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.fullName}</div>
      <div>
        Score: <span style={{ color: '#22d3ee' }}>{d.score.toFixed(4)}</span>
      </div>
      {d.isTarget && (
        <div style={{ color: '#22d3ee', fontSize: 11, marginTop: 2 }}>
          ★ on-target class
        </div>
      )}
    </div>
  )
}

export default function Heatmap({ tissue, scoringData, interpretationData }) {
  const barData = useMemo(() => {
    if (!scoringData || scoringData.length === 0) return null

    // Find the top candidate
    let topCandidate = null
    const topSeq = interpretationData?.ranking?.[0]?.sequence
    if (topSeq) {
      topCandidate = scoringData.find((d) => d.sequence === topSeq)
    }
    if (!topCandidate) {
      topCandidate = [...scoringData].sort(
        (a, b) => (b.specificity_ratio ?? 0) - (a.specificity_ratio ?? 0)
      )[0]
    }

    const scores = topCandidate?.sei_scores ?? {}
    const highlightKeys = new Set([
      ...UNIVERSAL_HIGHLIGHT,
      ...(TISSUE_HIGHLIGHT_KEYS[tissue] || []),
    ])

    // Build bars and sort within each category by score descending
    const bars = SEI_CLASSES.map((cls) => ({
      name: cls.short,
      fullName: cls.key,
      score: scores[cls.key] ?? 0,
      category: cls.category,
      isTarget: highlightKeys.has(cls.key),
    }))

    // Preserve category order from SEI_CLASSES, sort bars within each category
    const categoryOrder = []
    const categoryBars = {}
    for (const bar of bars) {
      if (!categoryBars[bar.category]) {
        categoryOrder.push(bar.category)
        categoryBars[bar.category] = []
      }
      categoryBars[bar.category].push(bar)
    }
    for (const cat of categoryOrder) {
      categoryBars[cat].sort((a, b) => b.score - a.score)
    }

    return categoryOrder.flatMap((cat) => categoryBars[cat])
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
            margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="score" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={CATEGORY_COLORS[entry.category]}
                  opacity={entry.isTarget ? 1 : 0.6}
                  stroke={entry.isTarget ? HIGHLIGHT_BORDER : 'none'}
                  strokeWidth={entry.isTarget ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
