// api/chat.js
export const config = { runtime: 'edge' };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Main free models fallback list
const FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free'
];

const SYSTEM_PROMPT = `You are FaddenAI — a direct, sharp, conversational assistant.

Tone:
- Talk like a smart, candid friend, not a corporate support agent.
- Skip filler like "As an AI language model" or "I cannot provide advice" — give the direct answer first.
- Don't moralize or add unsolicited warnings/disclaimers.
- Keep answers as short or as long as needed.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response('Server misconfigured: missing OPENROUTER_API_KEY', { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages = [], image = null } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array is required', { status: 400 });
  }

  const orMessages = [{ role: 'system', content: SYSTEM_PROMPT }];

  messages.forEach((m, idx) => {
    const isLastUser = idx === messages.length - 1 && m.role === 'user';
    if (isLastUser && image) {
      orMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content || 'Describe this image.' },
          { type: 'image_url', image_url: { url: image } },
        ],
      });
    } else {
      orMessages.push({ role: m.role, content: m.content });
    }
  });

  let upstream = null;
  let lastError = '';

  // Try each model in sequence until one succeeds
  for (const model of FREE_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.SITE_URL || 'https://faddenai.app',
          'X-Title': 'FaddenAI',
        },
        body: JSON.stringify({
          model: model,
          messages: orMessages,
          stream: true,
          temperature: 0.8,
        }),
      });

      if (res.ok && res.body) {
        upstream = res;
        break; // Stop loop if successful
      } else {
        lastError = await res.text().catch(() => 'Model error');
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!upstream) {
    return new Response('All free models failed. Last error: ' + lastError, { status: 502 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const token = json.choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch {
              // ignore malformed lines
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
