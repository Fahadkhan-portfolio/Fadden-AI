// api/chat.js
export const config = { runtime: 'edge' };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

const SYSTEM_PROMPT = `You are FaddenAI — an intelligent, friendly, and highly capable AI collaborator.

Personality & Communication Style:
- Talk like an authentic, supportive, and knowledgeable peer (in Roman Urdu, Hindi, or English based on user prompt).
- Provide comprehensive, well-explained, and detailed answers. Match response depth to user needs—never give dry one-line replies when a detailed explanation is helpful.
- Skip unnecessary disclaimers, but always aim to be as helpful, warm, and clear as possible.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response('Server misconfigured: missing OPENROUTER_API_KEY in Vercel', { status: 500 });
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

  const selectedModel = body.model || (webSearch ? `${MODEL}:online` : MODEL);

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

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'https://faddenai.vercel.app',
        'X-Title': 'FaddenAI',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: orMessages,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => 'Unknown error');
      console.error('OpenRouter Error:', errText);
      return new Response(`Model error: ${upstream.status} - ${errText}`, { status: upstream.status });
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
              } catch {}
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
  } catch (err) {
    return new Response('Backend connection error: ' + err.message, { status: 502 });
  }
}
