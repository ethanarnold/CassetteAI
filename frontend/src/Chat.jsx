import { useState, useRef, useEffect, useCallback } from 'react'
import Lottie from 'lottie-react'
import { sendChatMessage } from './api.js'
import dnaHelixAnimation from './assets/dna-helix.json'
import dnaHelixThickAnimation from './assets/dna-helix-thick.json'

// ---------------------------------------------------------------------------
// Dwell times (ms) — minimum display time before revealing the next item.
// On live runs, natural API latency fills most of this.
// ---------------------------------------------------------------------------
const THOUGHT_DWELL = {
  parsing: 5000,
  designing: 10000,
  generating: 20000,
  scoring: 20000,
  interpreting: 10000,
}
const MESSAGE_DWELL = 800

// ---------------------------------------------------------------------------
// useMessageQueue — queues backend events and reveals them with dwell timers.
// Operates directly on the parent's setMessages so state survives remounts
// (Chat remounts when transitioning from landing → active layout).
// ---------------------------------------------------------------------------
function useMessageQueue(setMessages) {
  const queueRef = useRef([])
  const timerRef = useRef(null)
  const drainingRef = useRef(false)

  const drain = useCallback(() => {
    if (queueRef.current.length === 0) {
      drainingRef.current = false
      return
    }
    drainingRef.current = true

    const next = queueRef.current.shift()

    // Fire side-effect callback if present (e.g. showing plots)
    if (next.onShow) next.onShow()

    // Resolve the previous thought's spinner, then append the new item
    const item = { ...next }
    delete item.onShow
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.type === 'thought' && !m.resolved ? { ...m, resolved: true } : m
      )
      return [...updated, item]
    })

    // Determine dwell for this item before showing the next
    let dwell = 0
    if (next.type === 'thought') {
      dwell = THOUGHT_DWELL[next.stage] || 3000
    } else if (next.type === 'message') {
      dwell = MESSAGE_DWELL
    }

    timerRef.current = setTimeout(drain, dwell)
  }, [setMessages])

  const enqueue = useCallback(
    (event) => {
      queueRef.current.push(event)
      if (!drainingRef.current) {
        drain()
      }
    },
    [drain]
  )

  const addDirect = useCallback(
    (item) => {
      // Bypass queue — immediate display (user messages, errors)
      setMessages((prev) => [...prev, item])
    },
    [setMessages]
  )

  const isIdle = useCallback(() => {
    return queueRef.current.length === 0 && !drainingRef.current
  }, [])

  const flush = useCallback(() => {
    // Resolve any remaining thoughts and clear timer
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    drainingRef.current = false
    queueRef.current = []
    setMessages((prev) =>
      prev.map((m) =>
        m.type === 'thought' && !m.resolved ? { ...m, resolved: true } : m
      )
    )
  }, [setMessages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { enqueue, addDirect, isIdle, flush }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function DnaSpinner({ static: isStatic } = {}) {
  return (
    <div style={{ width: 72, height: 72 }}>
      <Lottie
        animationData={dnaHelixAnimation}
        loop={!isStatic}
        autoplay={!isStatic}
        style={{ width: 72, height: 72 }}
      />
    </div>
  )
}

function ThoughtBubble({ message, resolvedMessage, isActive }) {
  return (
    <div className="flex justify-start">
      <div
        className={`thought-line text-sm whitespace-pre-wrap flex items-start${isActive ? ' thought-shimmer' : ''}`}
        style={{
          color: '#6b7280',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        <span>{isActive ? message : (resolvedMessage || message)}</span>
      </div>
    </div>
  )
}

function MessageBubble({ message, showDna }) {
  return (
    <div className="flex justify-start">
      <div
        className="text-sm whitespace-pre-wrap"
        style={{
          color: '#1a1a1a',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        {message}
        {showDna && (
          <div style={{ marginTop: 4 }}>
            <DnaSpinner static />
          </div>
        )}
      </div>
    </div>
  )
}

function StreamingBubble({ message }) {
  return (
    <div className="flex justify-start">
      <div
        className="text-sm whitespace-pre-wrap"
        style={{
          color: '#1a1a1a',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        {message}
      </div>
    </div>
  )
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-4/5 rounded-2xl px-4 py-2 text-sm"
        style={{
          background: '#ffffff',
          color: '#1a1a1a',
          border: '1px solid #e5e7eb',
          maxWidth: '80%',
        }}
      >
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ content, isError }) {
  return (
    <div className="flex justify-start">
      <div
        className="text-sm whitespace-pre-wrap"
        style={{
          color: isError ? '#dc2626' : '#1a1a1a',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        {content}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export default function Chat({ onResults, hasStarted, onStart, messages, setMessages, loading, setLoading }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const streamingRef = useRef({ active: false, text: '' })
  const rafRef = useRef(null)
  const logoLottieRef = useRef(null)
  const { enqueue, addDirect, isIdle, flush } = useMessageQueue(setMessages)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const prompt = input.trim()
      if (!prompt || loading) return

      if (!hasStarted && onStart) onStart()

      setInput('')
      setLoading(true)

      // User message — immediate display
      addDirect({ type: 'user', content: prompt })

      // Build conversation history for backend context
      const history = messages
        .filter((m) => m.type === 'user' || m.type === 'message')
        .map((m) => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.type === 'user' ? m.content : m.message,
        }))

      try {
        for await (const event of sendChatMessage(prompt, history)) {
          if (event.type === 'stream_start') {
            flush()
            streamingRef.current = { active: true, text: '' }
            addDirect({ type: 'streaming', message: '' })
          } else if (event.type === 'stream_delta') {
            streamingRef.current.text += event.delta
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null
                const txt = streamingRef.current.text
                setMessages((prev) => {
                  const last = prev[prev.length - 1]
                  if (last && last.type === 'streaming') {
                    return [...prev.slice(0, -1), { ...last, message: txt }]
                  }
                  return prev
                })
              })
            }
          } else if (event.type === 'stream_end') {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current)
              rafRef.current = null
            }
            const finalText = streamingRef.current.text
            const stage = event.stage || 'conversation'
            streamingRef.current = { active: false, text: '' }
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.type === 'streaming') {
                return [...prev.slice(0, -1), { type: 'message', stage, message: finalText }]
              }
              return prev
            })
          } else if (event.type === 'thought') {
            enqueue({ type: 'thought', stage: event.stage, message: event.message, resolvedMessage: event.resolvedMessage, resolved: false })
          } else if (event.type === 'message') {
            enqueue({ type: 'message', stage: event.stage, message: event.message })
          } else if (event.type === 'results') {
            onResults(event.data)
          } else if (event.type === 'error') {
            // Errors bypass queue and resolve any active thought
            flush()
            addDirect({ type: 'error', content: event.message })
          }
        }
      } catch (err) {
        flush()
        addDirect({ type: 'error', content: err.message })
      }

      // Wait for queue to fully drain and streaming to finish before clearing loading
      const waitForDrain = () => {
        if (isIdle() && !streamingRef.current.active) {
          flush() // resolve final thought spinner
          setLoading(false)
          inputRef.current?.focus()
        } else {
          setTimeout(waitForDrain, 200)
        }
      }
      waitForDrain()
    },
    [input, loading, messages, onResults, hasStarted, onStart, enqueue, addDirect, isIdle, flush]
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e)
    }
  }

  /* -- Landing mode: centered input with title -- */
  if (!hasStarted) {
    return (
      <div style={{ width: '100%', maxWidth: 696 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
          <Lottie
            lottieRef={logoLottieRef}
            animationData={dnaHelixThickAnimation}
            loop={false}
            autoplay={false}
            style={{ width: 56, height: 56, cursor: 'pointer' }}
            onMouseEnter={() => logoLottieRef.current?.play()}
            onMouseLeave={() => logoLottieRef.current?.stop()}
          />
          <h1
            style={{
              fontSize: 60,
              fontWeight: 900,
              color: '#000000',
              letterSpacing: '0.04em',
              margin: 0,
            }}
          >
            CassetteAI
          </h1>
        </div>
        <div style={{ marginBottom: 32 }} />

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '10px 10px 10px 24px',
              alignItems: 'center',
              background: '#f0f0f0',
              borderRadius: 9999,
              border: 'none',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Design a liver-specific enhancer for AAV delivery..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 18,
                color: '#1a1a1a',
                padding: '10px 0',
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? '#d4d4d4' : '#333333',
                color: loading || !input.trim() ? '#9ca3af' : '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '12px 24px',
                fontSize: 17,
                fontWeight: 600,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  /* -- Active mode: full chat panel -- */
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => {
          if (msg.type === 'user') return <UserBubble key={i} content={msg.content} />
          if (msg.type === 'thought')
            return (
              <ThoughtBubble
                key={i}
                message={msg.message}
                resolvedMessage={msg.resolvedMessage}
                isActive={!msg.resolved}
              />
            )
          if (msg.type === 'message') {
            // Show static DNA only on the very last message in the list, and only when not loading
            const isLast = i === messages.length - 1 && !loading
            return <MessageBubble key={i} message={msg.message} showDna={isLast} />
          }
          if (msg.type === 'streaming') return <StreamingBubble key={i} message={msg.message} />
          if (msg.type === 'error')
            return <AssistantBubble key={i} content={msg.content} isError />
          return null
        })}

        {loading && (
          <div className="flex justify-start">
            <DnaSpinner />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '6px 6px 6px 20px',
            alignItems: 'center',
            background: '#f0f0f0',
            borderRadius: 9999,
            border: 'none',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Ask a follow-up or start a new design..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: '#1a1a1a',
              padding: '8px 0',
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? '#d4d4d4' : '#333333',
              color: loading || !input.trim() ? '#9ca3af' : '#ffffff',
              border: 'none',
              borderRadius: 9999,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 200ms ease',
            }}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
