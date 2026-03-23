import { useState, useCallback, useEffect, useRef } from 'react'
import { Switch, Route, useLocation, useParams, useRoute, Redirect } from 'wouter'
import { ChartBarSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import Chat from './Chat.jsx'
import Heatmap from './Heatmap.jsx'
import CassetteDiagram from './CassetteDiagram.jsx'
import Sidebar from './Sidebar.jsx'
import { saveChat, loadChat, deleteChat } from './storage.js'
import { loadChatIndex, addChatToIndex, updateChatName, removeChatFromIndex } from './chatIndex.js'
import { generateChatName } from './api.js'
import { useMediaQuery } from './useMediaQuery.js'

const PENDING_PROMPT_KEY = 'cassette-pending-prompt'
const SIDEBAR_KEY = 'cassette-sidebar-open'

// ---------------------------------------------------------------------------
// LandingPage — renders at /
// ---------------------------------------------------------------------------
function LandingPage({ onNewChat, isNarrow }) {
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
          isNarrow={isNarrow}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatPage — renders at /chat/:chatId
// ---------------------------------------------------------------------------
function ChatPage({ refreshIndex, chatIndex, isMobile }) {
  const { chatId } = useParams()
  const [, navigate] = useLocation()

  // Load persisted state or start fresh
  const stored = useRef(loadChat(chatId))
  const [results, setResults] = useState(stored.current?.results ?? null)
  const [messages, setMessages] = useState(stored.current?.messages ?? [])
  const [loading, setLoading] = useState(false)
  // Skip name generation if the chat already has a name
  const nameGenerated = useRef(
    !!chatIndex.find((c) => c.id === chatId)?.name
  )

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

  // --- Mobile graph panel overlay ---
  const [graphPanelOpen, setGraphPanelOpen] = useState(false)
  const prevResultsRef = useRef(stored.current?.results ?? null)

  // Auto-open graph panel when results transition from null → truthy on mobile
  useEffect(() => {
    if (isMobile && !prevResultsRef.current && results) {
      setGraphPanelOpen(true)
    }
    prevResultsRef.current = results
  }, [results, isMobile])

  const handleToggleGraphPanel = useCallback(() => {
    setGraphPanelOpen((prev) => !prev)
  }, [])

  // Lock body scroll when mobile graph panel is open
  useEffect(() => {
    if (isMobile && graphPanelOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isMobile, graphPanelOpen])

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
    const firstUserMsg = messages.find((m) => m.type === 'user')
    if (!firstUserMsg) {
      console.log('[chat-name] no user message yet, skipping')
      return
    }
    nameGenerated.current = true
    const prompt = firstUserMsg.content || initialPrompt
    console.log('[chat-name] first user msg found, content:', firstUserMsg.content?.slice(0, 80), '| initialPrompt:', initialPrompt?.slice(0, 80), '| resolved prompt:', prompt?.slice(0, 80))
    if (!prompt) {
      console.warn('[chat-name] prompt is falsy, skipping API call')
      return
    }
    generateChatName(prompt).then((name) => {
      console.log('[chat-name] result:', name)
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
        {/* Chat panel — full-width on mobile, 40% on desktop */}
        <div
          className="fade-in"
          style={{
            width: isMobile ? '100%' : '40%',
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

        {/* Graph panel — slide-in overlay on mobile, inline on desktop */}
        {isMobile ? (
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '100%',
              height: '100dvh',
              zIndex: 40,
              background: '#FAF9F6',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transform: graphPanelOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 200ms ease',
            }}
          >
            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'calc(8px + env(safe-area-inset-top, 0px)) 8px 8px' }}>
              <button
                onClick={() => setGraphPanelOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background: 'rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <XMarkIcon style={{ width: 20, height: 20, color: '#1a1a1a' }} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Heatmap
                tissue={results?.tissue}
                scoringData={results?.scoring}
                interpretationData={results?.interpretation}
                isMobile={isMobile}
              />
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <CassetteDiagram data={results?.cassette} isMobile={isMobile} />
            </div>
          </div>
        ) : (
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
                isMobile={isMobile}
              />
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <CassetteDiagram data={results?.cassette} isMobile={isMobile} />
            </div>
          </div>
        )}
      </div>

      {/* Floating graph toggle — mobile only, when results exist and panel closed */}
      {isMobile && results && !graphPanelOpen && (
        <button
          onClick={handleToggleGraphPanel}
          style={{
            position: 'fixed',
            top: 'calc(8px + env(safe-area-inset-top, 0px))',
            right: 'calc(8px + env(safe-area-inset-right, 0px))',
            zIndex: 50,
            width: 36,
            height: 36,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(255,255,255,0.8)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChartBarSquareIcon style={{ width: 20, height: 20, color: '#1a1a1a' }} />
        </button>
      )}

      {/* Backdrop for mobile graph panel overlay */}
      {isMobile && (
        <div
          onClick={() => setGraphPanelOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 39,
            opacity: graphPanelOpen ? 1 : 0,
            pointerEvents: graphPanelOpen ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
          }}
        />
      )}
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

  const isMobile = useMediaQuery('(max-width: 1023px)')
  const isNarrow = useMediaQuery('(max-width: 767px)')

  // Sidebar open state — persisted to localStorage, default closed
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.removeProperty('overflow')
    }
    return () => { document.body.style.removeProperty('overflow') }
  }, [isMobile, sidebarOpen])

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
      if (isMobile) setSidebarOpen(false)
      // If called with a chatId (from LandingPage), add to index and navigate
      if (chatId) {
        setChatIndex(addChatToIndex(chatId))
        navigate(`/chat/${chatId}`)
        return
      }
      // Otherwise, navigate to landing
      navigate('/')
    },
    [navigate, isMobile],
  )

  const handleSelectChat = useCallback(
    (chatId) => {
      if (isMobile) setSidebarOpen(false)
      navigate(`/chat/${chatId}`)
    },
    [navigate, isMobile],
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
        isMobile={isMobile}
      />
      {/* Backdrop tap target for closing mobile sidebar (no visual overlay) */}
      {isMobile && (
        <div
          onClick={handleToggleSidebar}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 44,
            pointerEvents: sidebarOpen ? 'auto' : 'none',
          }}
        />
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Switch>
          <Route path="/">
            <LandingPage onNewChat={handleNewChat} isNarrow={isNarrow} />
          </Route>
          <Route path="/chat/:chatId">
            <ChatPage key={activeChatId} refreshIndex={refreshIndex} chatIndex={chatIndex} isMobile={isMobile} />
          </Route>
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </div>
    </div>
  )
}
