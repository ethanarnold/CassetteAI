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
  immune:      ['E5 B-cell-like', 'E11 T-cell', 'E7 Monocyte / Macrophage'],
  'stem cell': ['E1 Stem cell', 'PC4 Polycomb / Bivalent stem cell Enh'],
}

const HIGHLIGHT_BORDER = '#000000'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="glass"
      style={{
        padding: '8px 12px',
        color: '#1a1a1a',
        fontSize: 12,
        maxWidth: 260,
        borderRadius: 10,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.fullName}</div>
      <div>
        Score: <span style={{ color: '#0891b2', fontWeight: 600 }}>{d.score.toFixed(4)}</span>
      </div>
      {d.isTarget && (
        <div style={{ color: '#0891b2', fontSize: 11, marginTop: 2 }}>
          ★ on-target class
        </div>
      )}
    </div>
  )
}

export default function Heatmap({ tissue, scoringData, interpretationData, isMobile }) {
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

  /* No data → render nothing (blank cream space) */
  if (!barData) return null

  const specRatio = interpretationData?.ranking?.[0]?.specificity_ratio

  return (
    <div className={`${isMobile ? 'p-0' : 'p-4'} h-full flex flex-col fade-in`}>
      <div className="flex items-baseline gap-3 mb-3" style={isMobile ? { padding: '8px 8px 0' } : undefined}>
        <h2 className="font-semibold" style={{ color: '#000', fontSize: 18 }}>
          Tissue Specificity
        </h2>
        {specRatio != null && (
          <span style={{ color: '#9ca3af', fontSize: isMobile ? 12 : 16 }}>
            <span style={{ color: '#0891b2' }}>★</span> specificity{' '}
            <span style={{ color: '#6b7280' }}>{specRatio.toFixed(2)}x</span>
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowX: isMobile ? 'auto' : 'hidden', overflowY: 'hidden' }}>
        <div style={{ width: isMobile ? 700 : '100%', height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              margin={{ top: 8, right: 8, bottom: 10, left: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: '#6b7280', fontSize: 9 }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={60}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="score" radius={[2, 2, 0, 0]} maxBarSize={20} shape={(props) => {
                const { x, y, width, height, index } = props
                const entry = barData[index]
                const fill = CATEGORY_COLORS[entry.category]
                const op = entry.isTarget ? 1 : 0.6
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={fill} opacity={op} rx={2} ry={2} />
                    {entry.isTarget && (
                      <path
                        d={`M${x},${y + height} L${x},${y + 2} Q${x},${y} ${x + 2},${y} L${x + width - 2},${y} Q${x + width},${y} ${x + width},${y + 2} L${x + width},${y + height}`}
                        fill="none"
                        stroke={HIGHLIGHT_BORDER}
                        strokeWidth={2}
                      />
                    )}
                  </g>
                )
              }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
