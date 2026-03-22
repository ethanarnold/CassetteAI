import { useState, useCallback, useEffect, useRef } from 'react'
import { Switch, Route, useLocation, useParams, useRoute, Redirect } from 'wouter'
import Chat from './Chat.jsx'
import Heatmap from './Heatmap.jsx'
import CassetteDiagram from './CassetteDiagram.jsx'
import Sidebar from './Sidebar.jsx'
import { saveChat, loadChat, deleteChat } from './storage.js'
import { loadChatIndex, addChatToIndex, updateChatName, removeChatFromIndex } from './chatIndex.js'
import { generateChatName } from './api.js'

const PENDING_PROMPT_KEY = 'cassette-pending-prompt'
const SIDEBAR_KEY = 'cassette-sidebar-open'

// ---------------------------------------------------------------------------
// LandingPage — renders at /
// ---------------------------------------------------------------------------
function LandingPage({ onNewChat }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  const handleResults = useCallback(() => {}, [])

  const handleStart = useCallback(
    (prompt) => {
      const chatId = crypto.randomUUID()
      sessionStorage.setItem(PENDING_PROMPT_KEY, prompt)
      onNewChat(chatId)
    },
    [onNewChat],
  )

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#FAF9F6',
        color: '#1a1a1a',
        overflow: 'hidden',
      }}
    >
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
function ChatPage({ refreshIndex }) {
  const { chatId } = useParams()
  const [, navigate] = useLocation()

  // Load persisted state or start fresh
  const stored = useRef(loadChat(chatId))
  const [results, setResults] = useState(stored.current?.results ?? null)
  const [messages, setMessages] = useState(stored.current?.messages ?? [])
  const [loading, setLoading] = useState(false)
  const nameGenerated = useRef(false)

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

  // Generate chat name after first user message appears
  useEffect(() => {
    if (nameGenerated.current || shouldRedirect) return
    const firstUserMsg = messages.find((m) => m.role === 'user')
    if (!firstUserMsg) return
    nameGenerated.current = true
    const prompt = firstUserMsg.content || initialPrompt
    if (!prompt) return
    generateChatName(prompt).then((name) => {
      if (name) {
        updateChatName(chatId, name)
        refreshIndex()
      }
    })
  }, [messages, chatId, initialPrompt, shouldRedirect, refreshIndex])

  if (shouldRedirect) return null

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#FAF9F6',
        color: '#1a1a1a',
        overflow: 'hidden',
      }}
    >
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
// App — root with sidebar + routes
// ---------------------------------------------------------------------------
export default function App() {
  const [, navigate] = useLocation()
  const [, routeParams] = useRoute('/chat/:chatId')
  const activeChatId = routeParams?.chatId ?? null

  // Sidebar open state — persisted to localStorage, default closed
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Chat index state
  const [chatIndex, setChatIndex] = useState(() => loadChatIndex())

  const refreshIndex = useCallback(() => {
    setChatIndex(loadChatIndex())
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next))
      } catch {}
      return next
    })
  }, [])

  const handleNewChat = useCallback(
    (chatId) => {
      // If called with a chatId (from LandingPage), add to index and navigate
      if (chatId) {
        setChatIndex(addChatToIndex(chatId))
        navigate(`/chat/${chatId}`)
        return
      }
      // Otherwise, navigate to landing
      navigate('/')
    },
    [navigate],
  )

  const handleSelectChat = useCallback(
    (chatId) => {
      navigate(`/chat/${chatId}`)
    },
    [navigate],
  )

  const handleDeleteChat = useCallback(
    (chatId) => {
      deleteChat(chatId)
      setChatIndex(removeChatFromIndex(chatId))
      if (activeChatId === chatId) {
        navigate('/')
      }
    },
    [activeChatId, navigate],
  )

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={handleToggleSidebar}
        chats={chatIndex}
        activeChatId={activeChatId}
        onNewChat={() => handleNewChat()}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Switch>
          <Route path="/">
            <LandingPage onNewChat={handleNewChat} />
          </Route>
          <Route path="/chat/:chatId">
            <ChatPage refreshIndex={refreshIndex} />
          </Route>
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </div>
    </div>
  )
}
