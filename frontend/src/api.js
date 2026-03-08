/**
 * Send a chat message and async-iterate over parsed SSE events.
 *
 * Yielded event shapes (mirrors backend/orchestrator.py):
 *   { type: "status", stage: string, message: string, intent?: object }
 *   { type: "results", data: { generation, scoring, interpretation, cassette } }
 *   { type: "error",  message: string }
 */
export async function* sendChatMessage(prompt) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  } catch (err) {
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
