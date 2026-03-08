/** Pure SVG rendering of the AAV cassette design.
 *
 * Layout (proportional to bp / aav_limit_bp so unused capacity is visible):
 *   5'ITR ── Enhancer ── minTBG ── Transgene ── bGH polyA ── 3'ITR
 *                 ← designed element highlighted →
 *
 * Progress bar shows total cassette length vs 4,700 bp AAV limit.
 */

const ELEMENT_COLORS = {
  "5'ITR":      '#94a3b8',
  "3'ITR":      '#94a3b8',
  enhancer:     '#0891b2',
  minTBG:       '#3b82f6',
  minCMV:       '#3b82f6',
  transgene:    '#7c3aed',
  bGH_polyA:    '#d97706',
}

const ELEMENT_LABELS = {
  "5'ITR":    "5' ITR",
  "3'ITR":    "3' ITR",
  enhancer:   'Enhancer',
  minTBG:     'minTBG',
  minCMV:     'minCMV',
  transgene:  'Transgene',
  bGH_polyA:  'bGH polyA',
}

const LEGEND_ITEMS = [
  { color: '#94a3b8', label: 'ITRs' },
  { color: '#0891b2', label: 'Enhancer (designed)' },
  { color: '#3b82f6', label: 'Minimal promoter' },
  { color: '#7c3aed', label: 'Transgene' },
  { color: '#d97706', label: 'bGH polyA' },
]

function getColor(name) {
  return ELEMENT_COLORS[name] ?? '#9ca3af'
}

function getLabel(name) {
  return ELEMENT_LABELS[name] ?? name
}

const SVG_W = 860
// Y constants
const LABEL_Y    = 42   // centre of element name labels
const RECT_Y     = 52   // top of coloured rectangles
const RECT_H     = 50
const RECT_BOT   = RECT_Y + RECT_H          // 102
const BP_Y       = RECT_BOT + 14            // 116
const BAR_Y      = BP_Y + 14               // 130
const BAR_H      = 12
const BAR_TEXT_Y = BAR_Y + BAR_H + 14      // 156
const SVG_H      = BAR_TEXT_Y + 10         // 166

const DRAW_X = 16
const DRAW_W = SVG_W - 32

export default function CassetteDiagram({ data }) {
  /* No data → render nothing (blank cream space) */
  if (!data) return null

  const {
    elements = [],
    lengths_bp = [],
    total_bp = 0,
    aav_limit_bp = 4700,
    headroom_bp = 0,
    warning,
    enhancer_sequence,
  } = data

  // Compute each element's x position and width proportional to aav_limit_bp
  let xCur = DRAW_X
  const rects = elements.map((name, i) => {
    const bp = lengths_bp[i] ?? 0
    const w = Math.max(2, (bp / aav_limit_bp) * DRAW_W)
    const r = { name, bp, x: xCur, w, cx: xCur + w / 2 }
    xCur += w
    return r
  })

  const progressW = Math.min(1, total_bp / aav_limit_bp) * DRAW_W
  const isOverLimit = headroom_bp < 0

  // Detect narrow rects (< 48px) — omit inline text for those
  const WIDE_THRESHOLD = 48

  return (
    <div className="p-4 h-full overflow-auto flex flex-col gap-3 fade-in">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold" style={{ color: '#6b7280' }}>
          AAV Cassette Design
        </h2>
        <span className="text-xs" style={{ color: '#9ca3af' }}>
          5'ITR — Enhancer — Promoter — Transgene — polyA — 3'ITR
        </span>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', overflow: 'visible' }}
        aria-label="AAV cassette diagram"
      >
        <defs>
          {/* Glow filter for the designed enhancer element */}
          <filter id="enhancer-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {rects.map((r, i) => {
          const isEnhancer = r.name === 'enhancer'
          const isWide = r.w >= WIDE_THRESHOLD
          const color = getColor(r.name)
          const label = getLabel(r.name)

          return (
            <g key={i}>
              {/* Element name — inside wide rects, above narrow ones */}
              {isWide ? (
                <text
                  x={r.cx}
                  y={RECT_Y + RECT_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fontWeight={isEnhancer ? 'bold' : 'normal'}
                  fill={isEnhancer ? '#fff' : 'rgba(255,255,255,0.9)'}
                  style={{ userSelect: 'none' }}
                >
                  {label}
                </text>
              ) : (
                <>
                  {/* Tick line from label to rect */}
                  <line
                    x1={r.cx}
                    y1={LABEL_Y + 7}
                    x2={r.cx}
                    y2={RECT_Y - 1}
                    stroke="#d4d4d4"
                    strokeWidth="0.8"
                  />
                  <text
                    x={r.cx}
                    y={LABEL_Y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill={isEnhancer ? '#0891b2' : '#6b7280'}
                    fontWeight={isEnhancer ? 'bold' : 'normal'}
                    style={{ userSelect: 'none' }}
                  >
                    {label}
                  </text>
                </>
              )}

              {/* Coloured rectangle */}
              <rect
                x={r.x}
                y={RECT_Y}
                width={r.w}
                height={RECT_H}
                fill={color}
                rx="3"
                filter={isEnhancer ? 'url(#enhancer-glow)' : undefined}
              />

              {/* Thin separator line between adjacent rects */}
              {i > 0 && (
                <line
                  x1={r.x}
                  y1={RECT_Y}
                  x2={r.x}
                  y2={RECT_BOT}
                  stroke="#FAF9F6"
                  strokeWidth="1.5"
                />
              )}

              {/* bp label below */}
              <text
                x={r.cx}
                y={BP_Y}
                textAnchor="middle"
                fontSize="9"
                fill="#9ca3af"
                style={{ userSelect: 'none' }}
              >
                {r.bp} bp
              </text>
            </g>
          )
        })}

        {/* AAV limit bracket — dashed outline of remaining capacity */}
        <rect
          x={DRAW_X}
          y={RECT_Y}
          width={DRAW_W}
          height={RECT_H}
          fill="none"
          stroke="#d4d4d4"
          strokeWidth="1"
          strokeDasharray="4 3"
          rx="3"
        />

        {/* Progress bar track */}
        <rect x={DRAW_X} y={BAR_Y} width={DRAW_W} height={BAR_H} fill="#e5e7eb" rx="6" />
        {/* Progress fill */}
        <rect
          x={DRAW_X}
          y={BAR_Y}
          width={progressW}
          height={BAR_H}
          fill={isOverLimit ? '#ef4444' : '#16a34a'}
          rx="6"
        />

        {/* Progress label */}
        <text
          x={SVG_W / 2}
          y={BAR_TEXT_Y}
          textAnchor="middle"
          fontSize="11"
          fill={isOverLimit ? '#dc2626' : '#16a34a'}
        >
          Total: {total_bp.toLocaleString()} bp / {aav_limit_bp.toLocaleString()} bp AAV limit
          {!isOverLimit
            ? `  ·  ${headroom_bp.toLocaleString()} bp headroom`
            : `  ·  ⚠️ ${Math.abs(headroom_bp).toLocaleString()} bp over limit`}
        </text>
      </svg>

      {/* Warning message */}
      {warning && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
        >
          ⚠️ {warning}
        </div>
      )}

      {/* Color legend — glass card */}
      <div
        className="glass flex flex-wrap gap-4 text-xs"
        style={{ color: '#6b7280', padding: '8px 14px', borderRadius: 12 }}
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="rounded-sm shrink-0"
              style={{ width: 12, height: 12, background: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Enhancer sequence preview — glass card */}
      {enhancer_sequence && (
        <div
          className="glass rounded-lg p-2 text-xs font-mono"
          style={{ color: '#0891b2', borderRadius: 12 }}
        >
          <span style={{ color: '#9ca3af' }}>Enhancer: </span>
          {enhancer_sequence.slice(0, 30)}
          <span style={{ color: '#9ca3af' }}>…</span>
          {enhancer_sequence.slice(-10)}
          <span className="ml-2" style={{ color: '#9ca3af' }}>
            ({enhancer_sequence.length} bp)
          </span>
        </div>
      )}
    </div>
  )
}
