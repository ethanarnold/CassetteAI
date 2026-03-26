import { useState } from 'react'

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
  enhancer:     '#002FA7',
  minTBG:       '#3b82f6',
  minCMV:       '#3b82f6',
  transgene:    '#7c3aed',
  bGH_polyA:    '#d97706',
}

const ELEMENT_LABELS = {
  "5'ITR":    "5' ITR",
  "3'ITR":    "3' ITR",
  enhancer:   'Enhancer',
  minTBG:     'Promoter',
  minCMV:     'Promoter',
  transgene:  'Transgene',
  bGH_polyA:  'bGH polyA',
}

function getColor(name) {
  return ELEMENT_COLORS[name] ?? '#9ca3af'
}

function getLabel(name) {
  return ELEMENT_LABELS[name] ?? name
}

const SVG_W = 860
// Y constants
const LABEL_Y    = 12   // centre of element name labels
const RECT_Y     = 22   // top of coloured rectangles
const RECT_H     = 50
const RECT_BOT   = RECT_Y + RECT_H          // 102
const BP_Y       = RECT_BOT + 14            // 116
const BAR_Y      = BP_Y + 16               // 132
const BAR_H      = 12
const BAR_TEXT_Y = BAR_Y + BAR_H + 16      // 160
const SVG_H      = BAR_TEXT_Y + 12         // 172

const DRAW_X = 16
const DRAW_W = SVG_W - 32

function EnhancerSequenceBox({ sequence }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(sequence).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="glass rounded-lg p-3 text-xs font-mono"
      style={{ color: '#002FA7', borderRadius: 12, position: 'relative' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: '#9ca3af', fontFamily: 'inherit' }}>
          Enhancer ({sequence.length} bp)
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? '#d1fae5' : '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: '2px 10px',
            fontSize: 11,
            color: copied ? '#059669' : '#6b7280',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div style={{ wordBreak: 'break-all', lineHeight: 1.5 }}>
        {sequence}
      </div>
    </div>
  )
}

export default function CassetteDiagram({ data, isMobile }) {
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
    const w = Math.max(2, (bp / total_bp) * DRAW_W)
    const r = { name, bp, x: xCur, w, cx: xCur + w / 2 }
    xCur += w
    return r
  })

  const progressW = Math.min(1, total_bp / aav_limit_bp) * DRAW_W
  const isOverLimit = headroom_bp < 0


  return (
    <div className="p-4 h-full overflow-auto flex flex-col gap-3 fade-in">
      <div className="flex items-baseline gap-3">
        <h2 className="font-semibold" style={{ color: '#000', fontSize: 18 }}>
          AAV Cassette Design
        </h2>
      </div>

      <div style={{ overflowX: isMobile ? 'auto' : 'hidden' }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', minWidth: isMobile ? 700 : undefined, overflow: 'visible' }}
        aria-label="AAV cassette diagram"
      >

        {rects.map((r, i) => {
          const isEnhancer = r.name === 'enhancer'
          const color = getColor(r.name)
          const label = getLabel(r.name)

          return (
            <g key={i}>
              {/* Element name — centered above */}
              <text
                x={r.cx}
                y={LABEL_Y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="13"
                fill={isEnhancer ? '#002FA7' : '#374151'}
                fontWeight={isEnhancer ? 'bold' : 500}
                style={{ userSelect: 'none' }}
              >
                {label}
              </text>

              {/* Coloured rectangle */}
              <rect
                x={r.x}
                y={RECT_Y}
                width={r.w}
                height={RECT_H}
                fill={color}
                rx="3"
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
                fontSize="13"
                fill="#9ca3af"
                style={{ userSelect: 'none' }}
              >
                {r.bp} bp
              </text>
            </g>
          )
        })}

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
          fontSize={isMobile ? 17 : 13}
          fill={isOverLimit ? '#dc2626' : '#16a34a'}
        >
          Total: {total_bp.toLocaleString()} bp / {aav_limit_bp.toLocaleString()} bp AAV limit
          {!isOverLimit
            ? `  ·  ${headroom_bp.toLocaleString()} bp headroom`
            : `  ·  ⚠️ ${Math.abs(headroom_bp).toLocaleString()} bp over limit`}
        </text>
      </svg>
      </div>

      {/* Warning message */}
      {warning && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
        >
          ⚠️ {warning}
        </div>
      )}


      {/* Enhancer sequence — full with copy button */}
      {enhancer_sequence && (
        <EnhancerSequenceBox sequence={enhancer_sequence} />
      )}
    </div>
  )
}
