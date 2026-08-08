// Vercel Edge Function — proxies chat requests to OpenRouter, falling back
// across a list of free models if one is unavailable, and streams plain
// text back to the client (no SSE/JSON framing leaks through).

export const config = { runtime: 'edge' };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Fully tested & currently working OpenRouter free model slugs
const FALLBACK_TEXT_MODELS = [
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
  'openrouter/auto' // Ultimate fallback: automatically routes to any working free/cheap model
];

// Vision-capable models
const FALLBACK_VISION_MODELS = [
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'openrouter/auto'
];

const BASE_PERSONA = `You are FaddenAI — a direct, sharp, conversational assistant.

- Talk like a smart, candid friend, not a corporate support agent.
- Skip filler like "As an AI language model" unless it's genuinely load-bearing — give the actual answer first.
- Don't moralize or add unsolicited warnings to ordinary requests.
- Keep answers as short or as long as the question actually needs.
- You still use real judgment: you don't help with things like building weapons, malware, or content that sexualizes minors — but you decline briefly and move on rather than lecturing.`;

function buildSystemPrompt(customPersona) {
  const persona = (customPersona || '').trim();
  if (!persona) return BASE_PERSONA;
  return `${BASE_PERSONA}\n\nAdditional persona instructions from the user, follow these for tone/style/role:\n${persona}`;
}

function getModelList(baseList, webSearch) {
  return baseList.map(m => {
    if (!webSearch || m === 'openrouter/auto') return m;
    if (m.endsWith(':free')) {
      return m.replace(':free', ':online:free');
    }
    return `${m}:online`;
  });
}

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

  const {
    messages = [],
    webSearch = false,
    image = null,
    persona = '',
    temperature = 0.8,
  } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array is required', { status: 400 });
  }

  const safeTemperature = Math.min(1.0, Math.max(0.1, Number(temperature) || 0.8));

  const orMessages = [{ role: 'system', content: buildSystemPrompt(persona) }];

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

  const baseModels = image ? FALLBACK_VISION_MODELS : FALLBACK_TEXT_MODELS;
  const modelsToTry = getModelList(baseModels, webSearch);

  let upstream = null;
  let lastError = '';

  for (const modelId of modelsToTry) {
    try {
      const attempt = await fetch(OPENROUTER_URL, {
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
          temperature: safeTemperature,
        }),
      });

      if (attempt.ok && attempt.body) {
        upstream = attempt;
        break;
      } else {
        lastError = `${modelId} -> ${attempt.status}: ${await attempt.text().catch(() => 'unknown error')}`;
      }
    } catch (err) {
      lastError = `${modelId} -> network error: ${err.message}`;
    }
  }

  if (!upstream) {
    return new Response(
      'All models are currently unavailable. Last error: ' + lastError,
      { status: 502 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = '';

      const processLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return false;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return true;
        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content;
          if (token) controller.enqueue(encoder.encode(token));
        } catch {
          // ignore parsing errors
        }
        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const isDone = processLine(line);
            if (isDone) {
              controller.close();
              return;
            }
          }
        }

        if (buffer.trim()) {
          processLine(buffer);
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
