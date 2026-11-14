// OpenRouter chat proxy (Vercel Edge). One key reaches every model.
export const config = { runtime: 'edge' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  const env = (typeof process !== 'undefined' && process.env) || {};
  if (req.method === 'GET') return json({ configured: !!env.OPENROUTER_API_KEY, accessCode: !!env.ACCESS_CODE });
  if (req.method !== 'POST') return json({ error: { message: 'Use POST' } }, 405);
  const userKey = req.headers.get('x-user-key');
  if (!userKey && env.ACCESS_CODE && req.headers.get('x-access-code') !== env.ACCESS_CODE) return json({ error: { message: 'This arena needs an access code. Add it in Settings.' } }, 401);
  const key = userKey || env.OPENROUTER_API_KEY;
  if (!key) return json({ error: { message: 'No OpenRouter key yet. Set OPENROUTER_API_KEY or paste a key in Settings.' } }, 401);
  const body = await req.json();
  const payload = { model: body.model, messages: body.messages, stream: body.stream !== false, max_tokens: Math.min(body.max_tokens || 2048, 8192), usage: { include: true } };
  if (body.temperature != null) payload.temperature = body.temperature;
  if (body.response_format) payload.response_format = body.response_format;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': env.SITE_URL || 'https://ringside.kpatel.me', 'X-Title': 'Ringside' },
    body: JSON.stringify(payload),
  });
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
}
