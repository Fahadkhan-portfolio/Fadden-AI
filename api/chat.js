// api/chat.js
export const config = { runtime: 'edge' };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
  'google/gemma-2-9b-it:free'
];

const SYSTEM_PROMPT = `You are FaddenAI — a direct, sharp, conversational assistant.`;

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

  const { messages = [] } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array is required', { status: 400 });
  }

  const orMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  let upstream = null;
  let lastError = '';

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
        break;
      } else {
        const errText = await res.text().catch(() => 'Unknown error');
        lastError = `[${model}] Status ${res.status}: ${errText}`;
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!upstream) {
    return new Response('Error: ' + lastError, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
