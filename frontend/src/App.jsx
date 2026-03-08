import { useState, useCallback } from 'react'
import Chat from './Chat.jsx'
import Heatmap from './Heatmap.jsx'
import CassetteDiagram from './CassetteDiagram.jsx'

function DnaIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M8 4 C8 10 20 10 20 16 C20 22 8 22 8 28"
        stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round"
      />
      <path
        d="M20 4 C20 10 8 10 8 16 C8 22 20 22 20 28"
        stroke="#0891b2" strokeWidth="2" fill="none" strokeLinecap="round"
      />
      <line x1="10" y1="10" x2="18" y2="10" stroke="#94a3b8" strokeWidth="1.5" />
      <line x1="10" y1="16" x2="18" y2="16" stroke="#94a3b8" strokeWidth="1.5" />
    </svg>
  )
}

export default function App() {
  const [results, setResults] = useState(null)
  const handleResults = useCallback((data) => setResults(data), [])

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f1117',
        color: '#e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 20px',
          background: '#0b0f1a',
          borderBottom: '1px solid #1a2235',
        }}
      >
        <DnaIcon />
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#22d3ee',
              letterSpacing: '0.07em',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            CassetteAI
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            AI-Powered Gene Therapy Cassette Design
          </p>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '11px',
            color: '#334155',
          }}
        >
          <span>Claude</span>
          <span style={{ color: '#1a2235' }}>·</span>
          <span>Modal</span>
          <span style={{ color: '#1a2235' }}>·</span>
          <span>DNA-Diffusion</span>
          <span style={{ color: '#1a2235' }}>·</span>
          <span>Sei</span>
        </div>
      </header>

      {/* ── Main panels ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — Chat (40% width) */}
        <div
          style={{
            width: '40%',
            flexShrink: 0,
            borderRight: '1px solid #1a2235',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Chat onResults={handleResults} />
        </div>

        {/* Right — Heatmap (top) + Cassette (bottom) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Top: Heatmap */}
          <div
            style={{
              flex: 1,
              borderBottom: '1px solid #1a2235',
              overflow: 'auto',
            }}
          >
            <Heatmap
              scoringData={results?.scoring}
              interpretationData={results?.interpretation}
            />
          </div>

          {/* Bottom: Cassette Diagram */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CassetteDiagram data={results?.cassette} />
          </div>
        </div>
      </div>
    </div>
  )
}
