import { useState, useCallback } from 'react'
import Chat from './Chat.jsx'
import Heatmap from './Heatmap.jsx'
import CassetteDiagram from './CassetteDiagram.jsx'

function DnaIcon() {
  return (
    <svg width="50" height="50" viewBox="0 -8 72 72" fill="currentColor" aria-hidden="true">
      <path d="M47.71,24.61a15.61,15.61,0,0,0,2.44.19,11.08,11.08,0,0,0,8-3.11l1.19-1.19a2,2,0,1,0-2.88-2.88l-.29.29L46.09,7.82l.29-.28A2,2,0,0,0,43.5,4.66L42.31,5.85a11,11,0,0,0-3.11,8,16.59,16.59,0,0,0,2.14,8,12.82,12.82,0,0,1,1.62,6,7.73,7.73,0,0,1-1.12,4.14L32,22.16a6.54,6.54,0,0,1,2.1-.88l7.8,7.8a7.12,7.12,0,0,0,.09-1.17,10.69,10.69,0,0,0-.36-2.71l-4.07-4.07a12.88,12.88,0,0,1,2.61.63,18.21,18.21,0,0,1-1.6-4.6A15.61,15.61,0,0,0,36.08,17,10.65,10.65,0,0,0,25,28.08a16.59,16.59,0,0,0,2.14,8,12.82,12.82,0,0,1,1.62,6,7.73,7.73,0,0,1-1.12,4.14l-9.89-9.89a6.59,6.59,0,0,1,2.11-.88l7.79,7.79a6.93,6.93,0,0,0,.09-1.16,10.69,10.69,0,0,0-.36-2.71l-4.06-4.06a12.92,12.92,0,0,1,2.6.62,18.24,18.24,0,0,1-1.61-4.6,15.4,15.4,0,0,0-2.43-.19,11,11,0,0,0-8,3.11L12.66,35.5a2,2,0,0,0,2.88,2.88l.29-.29L25.91,48.17l-.29.29a2,2,0,1,0,2.88,2.88l1.19-1.19a11,11,0,0,0,3.11-8,16.59,16.59,0,0,0-2.14-8,12.82,12.82,0,0,1-1.62-6A7.73,7.73,0,0,1,30.16,24l9.89,9.89a6.54,6.54,0,0,1-2.1.88l-7.8-7.8a7.12,7.12,0,0,0-.09,1.17,10.56,10.56,0,0,0,.36,2.7l4.07,4.08a13.58,13.58,0,0,1-2.61-.63,18.21,18.21,0,0,1,1.6,4.6,15.61,15.61,0,0,0,2.44.19A10.65,10.65,0,0,0,47,27.92a16.59,16.59,0,0,0-2.14-8,12.82,12.82,0,0,1-1.62-6,7.73,7.73,0,0,1,1.12-4.14l9.89,9.89a6.82,6.82,0,0,1-2.11.88l-7.8-7.8a8.31,8.31,0,0,0-.08,1.17,10.69,10.69,0,0,0,.36,2.71l4.06,4.06a12.16,12.16,0,0,1-2.6-.63A18.28,18.28,0,0,1,47.71,24.61Z"/>
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
