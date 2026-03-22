import { useState, useRef, useEffect, useCallback } from 'react'
import { LightBulbIcon, PencilIcon, XMarkIcon, ArrowUpIcon } from '@heroicons/react/24/outline'
import { StopIcon } from '@heroicons/react/24/solid'
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
  const [expandedPill, setExpandedPill] = useState(null)
  const [hoverPlaceholder, setHoverPlaceholder] = useState(null)
  const [cascadeKey, setCascadeKey] = useState(0)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const streamingRef = useRef({ active: false, text: '' })
  const rafRef = useRef(null)
  const abortRef = useRef(null)
  const logoLottieRef = useRef(null)
  const wasTypingRef = useRef(false)
  const { enqueue, addDirect, isIdle, flush } = useMessageQueue(setMessages)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset expanded pill after fade-out when user types
  useEffect(() => {
    if (input.trim()) {
      const t = setTimeout(() => { setExpandedPill(null); setHoverPlaceholder(null) }, 200)
      return () => clearTimeout(t)
    }
  }, [input])

  // Replay pill cascade animation when input is cleared
  useEffect(() => {
    const typing = input.trim().length > 0
    if (wasTypingRef.current && !typing) {
      setCascadeKey((k) => k + 1)
    }
    wasTypingRef.current = typing
  }, [input])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // Finalize any in-progress streaming message
    if (streamingRef.current.active) {
      const finalText = streamingRef.current.text
      streamingRef.current = { active: false, text: '' }
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.type === 'streaming') {
          return [...prev.slice(0, -1), { type: 'message', stage: 'conversation', message: finalText }]
        }
        return prev
      })
    }
    flush()
    setLoading(false)
  }, [flush, setMessages, setLoading])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const prompt = input.trim()
      if (!prompt || loading) return

      if (!hasStarted && onStart) onStart()

      setInput('')
      setLoading(true)

      const controller = new AbortController()
      abortRef.current = controller

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
        for await (const event of sendChatMessage(prompt, history, controller.signal)) {
          if (controller.signal.aborted) break
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
        if (err.name === 'AbortError') {
          // User clicked stop — handled by handleStop, no error to show
          return
        }
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
            style={{ width: 68, height: 68, cursor: 'pointer' }}
            onMouseEnter={() => logoLottieRef.current?.play()}
            onMouseLeave={() => logoLottieRef.current?.stop()}
          />
          <h1
            style={{
              fontSize: 60,
              fontWeight: 500,
              color: '#333333',
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
              position: 'relative',
              padding: '10px 15px 6px',
              background: '#f0f0f0',
              borderRadius: 16,
              border: '1px solid #e0e0e0',
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder={hoverPlaceholder || 'How can I help you today?'}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 16,
                color: '#1a1a1a',
                padding: '5px 0',
                paddingRight: 48,
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />
            {loading ? (
              <button
                type="button"
                onClick={handleStop}
                style={{
                  position: 'absolute',
                  right: 12,
                  bottom: 12,
                  background: '#ffffff',
                  border: '1px solid #d4d4d4',
                  borderRadius: 10,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                }}
              >
                <StopIcon style={{ width: 14, height: 14, color: '#1a1a1a' }} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                style={{
                  position: 'absolute',
                  right: 12,
                  bottom: 12,
                  background: !input.trim() ? '#d4d4d4' : '#002FA7',
                  color: !input.trim() ? '#9ca3af' : '#ffffff',
                  border: 'none',
                  borderRadius: 10,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  cursor: !input.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 200ms ease',
                }}
              >
                <ArrowUpIcon style={{ width: 18, height: 18 }} />
              </button>
            )}
          </div>
        </form>
        {!loading && (() => {
          const isTyping = input.trim().length > 0
          const suggestions = {
            'What does this tool do?': [
              'What do you do?',
              'How are you different from a regular LLM?',
              'Who are your target users?',
            ],
            Design: [
              'Design an enhancer for blood cells.',
              'Generate a liver-specific enhancer.',
              'Create a cassette for immune cells.',
            ],
          }
          const previewPrompts = {
            'What do you do?':
              "Hi CassetteAI! I'm wondering what you do. What's your target use case, and what problems do you solve?",
            'How are you different from a regular LLM?':
              "How is CassetteAI different from just asking ChatGPT about genomics? What can you do that a regular LLM can't?",
            'Who are your target users?':
              'Who is CassetteAI built for? What kind of researchers or teams would benefit most from using it?',
'Design an enhancer for blood cells.':
              'Design a synthetic enhancer sequence optimized for activity in blood cells (hematopoietic/myeloid lineage).',
            'Generate a liver-specific enhancer.':
              'Generate a novel enhancer sequence with strong predicted activity in hepatocytes / liver tissue.',
            'Create a cassette for immune cells.':
              'Create a gene-regulatory cassette designed to drive expression specifically in immune / lymphoid cells.',
          }
          const pillIcons = {
            'What does this tool do?': LightBulbIcon,
            Design: PencilIcon,
          }
          const pills = Object.keys(suggestions)

          const submitPrompt = (text) => {
            setExpandedPill(null)
            setHoverPlaceholder(null)
            setInput(previewPrompts[text] || text)
            setTimeout(() => {
              const form = document.querySelector('form')
              if (form) form.requestSubmit()
            }, 0)
          }

          return (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, position: 'relative', opacity: isTyping ? 0 : 1, pointerEvents: isTyping ? 'none' : 'auto', transition: 'opacity 200ms ease' }}>
              {/* Always render pills to maintain stable height */}
              <div key={cascadeKey} style={{ display: 'flex', gap: 10, opacity: expandedPill ? 0 : 1, transition: 'opacity 350ms ease' }}>
                {pills.map((label, idx) => {
                  const Icon = pillIcons[label]
                  return (
                    <button
                      key={label}
                      className="pill-cascade"
                      onClick={() => setExpandedPill(label)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: label === 'Design' ? '#002FA7' : '#f0f0f0',
                        border: '1px solid #e0e0e0',
                        borderRadius: 16,
                        padding: '8px 18px',
                        fontSize: 14,
                        fontWeight: 400,
                        color: label === 'Design' ? '#fff' : '#555',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        animationDelay: `${idx * 120}ms`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = label === 'Design' ? '#0038C7' : '#e5e5e5')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = label === 'Design' ? '#002FA7' : '#f0f0f0')}
                    >
                      <Icon style={{ width: 16, height: 16 }} />
                      {label}
                    </button>
                  )
                })}
              </div>
              {expandedPill && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    width: '90%',
                    background: '#f0f0f0',
                    border: '1px solid #e0e0e0',
                    borderRadius: 16,
                    padding: '8px 6px',
                    animation: 'fadeIn 150ms ease-out',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px 8px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, color: '#555' }}>
                      {(() => { const Icon = pillIcons[expandedPill]; return Icon ? <Icon style={{ width: 16, height: 16 }} /> : null })()}
                      {expandedPill}
                    </span>
                    <button
                      onClick={() => { setExpandedPill(null); setHoverPlaceholder(null) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 18,
                        color: '#999',
                        cursor: 'pointer',
                        padding: '0 0',
                        lineHeight: 1,
                      }}
                    >
                      <XMarkIcon style={{ width: 21, height: 21 }} />
                    </button>
                  </div>
                  {suggestions[expandedPill].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => submitPrompt(prompt)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 12px',
                        margin: 0,
                        borderRadius: 8,
                        fontSize: 14,
                        color: '#555',
                        cursor: 'pointer',
                        transition: 'background 150ms ease',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e5e5e5'
                        setHoverPlaceholder(previewPrompts[prompt] || prompt)
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        setHoverPlaceholder(null)
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
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

        {!loading && messages.length > 0 && messages[messages.length - 1]?.type !== 'message' && (
          <div className="flex justify-start">
            <DnaSpinner static />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: 16 }}>
        <div
          style={{
            position: 'relative',
            padding: '6px 10px',
            background: '#f0f0f0',
            borderRadius: 16,
            border: '1px solid #e0e0e0',
          }}
        >
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Ask a follow-up or start a new design..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: '#1a1a1a',
              padding: '4px 0',
              paddingRight: 40,
              resize: 'none',
              boxSizing: 'border-box',
            }}
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                background: '#ffffff',
                border: '1px solid #d4d4d4',
                borderRadius: 10,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              <StopIcon style={{ width: 12, height: 12, color: '#1a1a1a' }} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                background: !input.trim() ? '#d4d4d4' : '#002FA7',
                color: !input.trim() ? '#9ca3af' : '#ffffff',
                border: 'none',
                borderRadius: 10,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                cursor: !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              <ArrowUpIcon style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
