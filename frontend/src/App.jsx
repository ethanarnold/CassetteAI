import { useState, useCallback, useEffect, useRef } from 'react'
import { Switch, Route, useLocation, useParams, Redirect } from 'wouter'
import Chat from './Chat.jsx'
import Heatmap from './Heatmap.jsx'
import CassetteDiagram from './CassetteDiagram.jsx'
import { saveChat, loadChat } from './storage.js'

const PENDING_PROMPT_KEY = 'cassette-pending-prompt'

// ---------------------------------------------------------------------------
// LandingPage — renders at /
// ---------------------------------------------------------------------------
function LandingPage() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [, navigate] = useLocation()

  const handleResults = useCallback(() => {}, [])

  const handleStart = useCallback(
    (prompt) => {
      const chatId = crypto.randomUUID()
      sessionStorage.setItem(PENDING_PROMPT_KEY, prompt)
      navigate(`/chat/${chatId}`)
    },
    [navigate],
  )

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
        <span style={{ fontSize: 14, fontWeight: 500, color: '#333333' }}>
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
          loading={loading}
          setLoading={setLoading}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatPage — renders at /chat/:chatId
// ---------------------------------------------------------------------------
function ChatPage() {
  const { chatId } = useParams()
  const [, navigate] = useLocation()

  // Load persisted state or start fresh
  const stored = useRef(loadChat(chatId))
  const [results, setResults] = useState(stored.current?.results ?? null)
  const [messages, setMessages] = useState(stored.current?.messages ?? [])
  const [loading, setLoading] = useState(false)

  // Read pending prompt from sessionStorage (landing → chat handoff)
  const [initialPrompt] = useState(() => {
    const p = sessionStorage.getItem(PENDING_PROMPT_KEY)
    if (p) sessionStorage.removeItem(PENDING_PROMPT_KEY)
    return p
  })

  // Redirect to / if this is a fresh visit with no stored data and no pending prompt
  const shouldRedirect = !stored.current && !initialPrompt
  useEffect(() => {
    if (shouldRedirect) navigate('/', { replace: true })
  }, [shouldRedirect, navigate])

  const handleResults = useCallback((data) => setResults(data), [])

  // Persist messages + results to localStorage on change (skip streaming messages)
  useEffect(() => {
    if (shouldRedirect) return
    const persistable = messages.filter((m) => m.type !== 'streaming')
    if (persistable.length > 0 || results) {
      saveChat(chatId, { messages: persistable, results })
    }
  }, [chatId, messages, results, shouldRedirect])

  if (shouldRedirect) return null

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
      {/* Header (glass) */}
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
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} style={{ textDecoration: 'none' }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: '#333333',
              letterSpacing: '0.07em',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            CassetteAI
          </h1>
          <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
            AI-Powered DNA Cassette Design
          </p>
        </a>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
            color: '#9ca3af',
          }}
        >
          <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Claude</a>
          <span style={{ color: '#d4d4d4' }}>·</span>
          <a href="https://modal.com" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Modal</a>
          <span style={{ color: '#d4d4d4' }}>·</span>
          <a href="https://github.com/pinellolab/DNA-Diffusion" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>DNA-Diffusion</a>
          <span style={{ color: '#d4d4d4' }}>·</span>
          <a href="https://github.com/FunctionLab/sei-framework" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Sei</a>
        </div>
      </header>

      {/* Main panels */}
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
            onStart={() => {}}
            messages={messages}
            setMessages={setMessages}
            loading={loading}
            setLoading={setLoading}
            initialPrompt={initialPrompt}
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
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Heatmap
              tissue={results?.tissue}
              scoringData={results?.scoring}
              interpretationData={results?.interpretation}
            />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CassetteDiagram data={results?.cassette} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App — root with routes
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/chat/:chatId" component={ChatPage} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  )
}
