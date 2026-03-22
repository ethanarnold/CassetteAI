/**
 * Generate a short chat name from the first prompt.
 * Returns the name string, or null on error.
 */
export async function generateChatName(prompt) {
  try {
    const res = await fetch('/api/chat-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.name || null
  } catch {
    return null
  }
}

/**
 * Send a chat message and async-iterate over parsed SSE events.
 *
 * Yielded event shapes (mirrors backend/orchestrator.py):
 *   { type: "thought", stage: string, message: string }
 *   { type: "message", stage: string, message: string }
 *   { type: "results", data: { generation, scoring, interpretation, cassette } }
 *   { type: "error",  message: string }
 */
export async function* sendChatMessage(prompt, history = [], signal) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    yield {
      type: 'error',
      message: `Connection failed: ${err.message}. Is the backend running on port 8000?`,
    };
    return;
  }

  if (!response.ok) {
    yield {
      type: 'error',
      message: `Server error ${response.status}: ${response.statusText}`,
    };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are delimited by double newlines
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? ''; // keep incomplete tail

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.slice(6));
            } catch {
              // malformed event — skip
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
