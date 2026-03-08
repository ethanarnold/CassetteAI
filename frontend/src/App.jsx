import { useState, useCallback } from 'react'
import Chat from './Chat.jsx'
import Heatmap from './Heatmap.jsx'
import CassetteDiagram from './CassetteDiagram.jsx'

function DnaIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M8 4 C8 10 20 10 20 16 C20 22 8 22 8 28"
        stroke="#0891b2" strokeWidth="2" fill="none" strokeLinecap="round"
      />
      <path
        d="M20 4 C20 10 8 10 8 16 C8 22 20 22 20 28"
        stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round"
      />
      <line x1="10" y1="10" x2="18" y2="10" stroke="#94a3b8" strokeWidth="1.5" />
      <line x1="10" y1="16" x2="18" y2="16" stroke="#94a3b8" strokeWidth="1.5" />
    </svg>
  )
}

export default function App() {
  const [results, setResults] = useState(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [messages, setMessages] = useState([])
  const handleResults = useCallback((data) => setResults(data), [])
  const handleStart = useCallback(() => setHasStarted(true), [])

  /* ── Landing: centered chat input ── */
  if (!hasStarted) {
    return (
      <div
        style={{
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          background: '#FAF9F6',
          color: '#1a1a1a',
          overflow: 'hidden',
        }}
      >
        {/* Minimal corner logo */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: 1,
          }}
        >
          <DnaIcon />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#000000' }}>
            CassetteAI
          </span>
        </div>

        {/* Centered content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
          }}
        >
          <Chat
            onResults={handleResults}
            hasStarted={false}
            onStart={handleStart}
            messages={messages}
            setMessages={setMessages}
          />
        </div>
      </div>
    )
  }

  /* ── Active: 3-panel layout ── */
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#FAF9F6',
        color: '#1a1a1a',
        overflow: 'hidden',
      }}
    >
      {/* ── Header (glass) ── */}
      <header
        className="glass fade-in"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          borderRadius: 0,
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <DnaIcon />
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: '#000000',
              letterSpacing: '0.07em',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            CassetteAI
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            AI-Powered Gene Therapy Cassette Design
          </p>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 11,
            color: '#94a3b8',
          }}
        >
          <span>Claude</span>
          <span style={{ color: '#d4d4d4' }}>·</span>
          <span>Modal</span>
          <span style={{ color: '#d4d4d4' }}>·</span>
          <span>DNA-Diffusion</span>
          <span style={{ color: '#d4d4d4' }}>·</span>
          <span>Sei</span>
        </div>
      </header>

      {/* ── Main panels ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — Chat (40% width) */}
        <div
          className="fade-in"
          style={{
            width: '40%',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Chat
            onResults={handleResults}
            hasStarted={true}
            onStart={handleStart}
            messages={messages}
            setMessages={setMessages}
          />
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
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Heatmap
              tissue={results?.tissue}
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
