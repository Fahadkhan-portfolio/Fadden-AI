// /api/chat.js
// Vercel serverless function. Deploy as-is — Vercel auto-detects anything
// under /api as a function. This is the ONLY place the OpenRouter key is
// used, and it's read from an environment variable, never hardcoded, so
// it never ends up in your git history or trips GitHub's secret scanner.
//
// Setup on Vercel:
//   Project Settings → Environment Variables → add OPENROUTER_API_KEY
//   (get a free key at https://openrouter.ai/keys)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server is missing OPENROUTER_API_KEY. Add it in Vercel → Settings → Environment Variables.",
    });
  }

  const { model, messages } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Request must include { model, messages[] }." });
  }

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter asks for these two for attribution — safe to keep or edit.
        "HTTP-Referer": "https://faddenai.vercel.app",
        "X-Title": "FaddenAI",
      },
      body: JSON.stringify({ model, messages }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || "OpenRouter request failed.",
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
}
