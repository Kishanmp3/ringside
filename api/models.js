// Public OpenRouter model catalog, trimmed and cached at the edge for 10 minutes.
export const config = { runtime: 'edge' };
export default async function handler() {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    const j = await r.json();
    const models = (j.data || [])
      .filter(m => (m.architecture?.output_modalities || ['text']).includes('text') && !/embed|moderation|router/i.test(m.id))
      .map(m => ({ id: m.id, name: m.name, created: m.created, ctx: m.context_length, inP: Number(m.pricing?.prompt || 0), outP: Number(m.pricing?.completion || 0) }))
      .sort((a, b) => b.created - a.created);
    return new Response(JSON.stringify({ models }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
  } catch (e) {
    return new Response(JSON.stringify({ models: [], error: String(e) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}
