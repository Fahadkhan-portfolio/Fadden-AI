// api/chat.js
// Vercel Edge Function — proxies chat requests to OpenRouter and streams
// plain text back to the client (script.js reads this via a ReadableStream).

export const config = { runtime: 'edge' };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

// ---------------------------------------------------------------------
// System prompt: casual, direct, and helpful — not preachy, not padded
// with unnecessary disclaimers, and willing to engage with mature or
// edgy-but-legal topics in a matter-of-fact way. It still exercises real
// judgment: it won't help with things like building weapons, malware,
// or content that sexualizes minors, no matter how the request is framed.
// That judgment is a feature, not a bug — a "say yes to literally
// anything" system prompt isn't something I'll wire in here, but this
// keeps things as loose and human as safely possible.
// ---------------------------------------------------------------------
const SYSTEM_PROMPT = `You are FaddenAI — a direct, sharp, conversational assistant.

Tone:
- Talk like a smart, candid friend, not a corporate support agent.
- Skip filler like "As an AI language model" or "I cannot provide medical/legal/financial advice" unless it's genuinely load-bearing — give the actual answer first.
- Don't moralize or add unsolicited warnings/disclaimers to ordinary requests. Trust the user is an adult who can handle a direct answer.
- It's fine to have a point of view, use humor, and be blunt when bluntness is useful.
- Keep answers as short or as long as the question actually needs — no padding, no forced bullet lists unless they help.
- Engage naturally with mature, edgy, or controversial topics discussed for legitimate creative, educational, or conversational purposes.

Judgment (kept quiet, not lectured about):
- You still use real judgment. You don't help with things like building weapons or malware, generating sexual content involving minors, or other clearly harmful requests — but you decline briefly and move on rather than delivering a lecture.
- For everything else, default to being genuinely useful over being cautious.`;

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

  const { messages = [], webSearch = false, image = null } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array is required', { status: 400 });
  }

  // Build OpenRouter-formatted messages
  const orMessages = [{ role: 'system', content: SYSTEM_PROMPT }];

  messages.forEach((m, idx) => {
    const isLastUser = idx === messages.length - 1 && m.role === 'user';
    if (isLastUser && image) {
      // Multimodal content array for the most recent user turn with an image
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

  // Optionally request OpenRouter's built-in web plugin for grounded answers
  const modelId = webSearch ? `${MODEL}:online` : MODEL;

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'https://faddenai.app',
        'X-Title': 'FaddenAI',
      },
      body: JSON.stringify({
        model: modelId,
        messages: orMessages,
        stream: true,
        temperature: 0.8,
      }),
    });
  } catch (err) {
    return new Response('Could not reach OpenRouter: ' + err.message, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => 'Unknown upstream error');
    return new Response('OpenRouter error: ' + errText, { status: upstream.status || 502 });
  }

  // Transform OpenRouter's SSE stream into a plain text token stream
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
              // ignore malformed / keep-alive lines
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
