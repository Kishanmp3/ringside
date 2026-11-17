// Ringside arena: blind bouts, debates, gauntlets and a personal Elo scorecard.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- markdown (small, safe) ---------- */
export function md(src) {
  const blocks = []; let s = String(src || '');
  s = s.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, l, code) => { blocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of s.split('\n')) {
    const ph = line.match(/^\u0000(\d+)\u0000$/);
    if (ph) { close(); out.push(blocks[+ph[1]]); continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { close(); out.push(`<h3>${inline(m[2])}</h3>`); }
    else if ((m = line.match(/^\s*[-*+]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^>\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (!line.trim()) { close(); }
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
}

/* ---------- state ---------- */
const state = { models: [], live: false, demo: false };
const cfg = { get key() { return LS.get('rs.key', ''); }, get code() { return LS.get('rs.code', ''); }, get max() { return LS.get('rs.max', 1200); } };
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); };

const FALLBACK = [
  ['anthropic/claude-opus-5.5', 'Anthropic: Claude Opus 5.5'], ['anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5'], ['openai/gpt-6', 'OpenAI: GPT-6'],
  ['google/gemini-3.1-pro', 'Google: Gemini 3.1 Pro'], ['moonshotai/kimi-k3.1', 'MoonshotAI: Kimi K3.1'], ['deepseek/deepseek-v4', 'DeepSeek: V4'],
  ['qwen/qwen3.6-27b', 'Qwen: Qwen3.6 27B'], ['x-ai/grok-4.1', 'xAI: Grok 4.1'], ['mistralai/mistral-large', 'Mistral: Large'], ['meta-llama/llama-4-maverick', 'Meta: Llama 4 Maverick'],
].map(([id, name], i) => ({ id, name, created: Date.now() / 1000 - i * 86400 * 6, ctx: 200000, inP: 0.000003, outP: 0.000015 }));

const short = (m) => { const mm = typeof m === 'string' ? state.models.find(x => x.id === m) : m; const n = mm?.name || String(m); return n.includes(':') ? n.split(':').slice(1).join(':').trim() : n; };
const maker = (id) => String(id).split('/')[0];

async function loadModels() {
  try { const r = await fetch('/api/models'); const j = await r.json(); if (!j.models?.length) throw 0; state.models = j.models; }
  catch { state.models = FALLBACK; }
  const opts = state.models.map(m => `<option value="${esc(m.id)}">${esc(short(m))} (${esc(maker(m.id))})</option>`).join('');
  for (const id of ['boutA', 'boutB', 'debA', 'debB', 'debJ']) $('#' + id).innerHTML = opts;
  $('#gAdd').innerHTML = '<option value="">Choose a model</option>' + opts;
  const pref = (re, d) => (state.models.find(m => re.test(m.id)) || state.models[d] || state.models[0]).id;
  $('#boutA').value = pref(/claude/, 0); $('#boutB').value = pref(/openai\/gpt/, 1);
  $('#debA').value = pref(/claude/, 0); $('#debB').value = pref(/gemini|openai/, 1); $('#debJ').value = (state.models.find(m => /deepseek|qwen|kimi|moonshot/.test(m.id) && m.id !== $('#debA').value && m.id !== $('#debB').value) || state.models[2] || state.models[0]).id;
}

let serverCfg = null;
async function checkKey() {
  if (!serverCfg) { try { const r = await fetch('/api/chat'); serverCfg = await r.json(); } catch { serverCfg = {}; } }
  const configured = !!serverCfg.configured;
  $('#openSettings').textContent = cfg.key ? 'API key added' : configured ? 'API key' : 'Add API key';
  $('#openSettings').classList.toggle('needs-key', !configured && !cfg.key);
  $('#sCodeRow').hidden = !serverCfg.accessCode || !!cfg.key;
  state.live = configured || !!cfg.key; state.demo = !state.live;
  const p = $('#status'); p.className = 'pill ' + (state.live ? 'live' : 'demo');
  p.textContent = state.live ? (cfg.key ? 'Your key' : 'Live') : 'Demo mode';
  $$('.banner').forEach(b => b.remove());
  if (state.demo) {
    const b = document.createElement('div'); b.className = 'banner';
    b.innerHTML = `<span>Demo mode: these are practice answers. Add your own OpenRouter key to fight real models. It stays in your browser.</span><button>Add your key</button>`;
    b.querySelector('button').onclick = openSettings; $('main').prepend(b);
  }
}

/* ---------- streaming ---------- */
const DEMO_LINES = [
  "Here's the short version, then the detail.\n\n**The core idea:** break the problem into the parts you can measure, then attack the slowest one first.\n\n1. Name the constraint out loud.\n2. Find the cheapest experiment that tests it.\n3. Ship the smallest change that moves the number.\n\n```js\nconst win = attempts.filter(a => a.ok).length / attempts.length;\n```\n\nThat's usually enough to see which way the fight is going.",
  "Good question. I'd push back on the framing a little.\n\nMost people treat this as a single decision, but it's really two:\n\n- **What you believe is true**, which is about evidence.\n- **What you'll do about it**, which is about tradeoffs.\n\nSeparate those and the answer gets a lot clearer. If you only have five minutes, spend four on the first one.",
  "Let me answer directly: yes, with one big caveat.\n\n> It works until the inputs stop looking like your training set.\n\nSo the practical move is to log every case where the output surprised you. After a week you'll have a test set that's worth more than any benchmark.",
];
async function* demoStream(seed) {
  const text = DEMO_LINES[(Math.abs(seed) + (Math.random() * 3 | 0)) % DEMO_LINES.length];
  await new Promise(r => setTimeout(r, 250 + Math.random() * 600));
  for (const w of text.match(/\S+\s*/g)) { await new Promise(r => setTimeout(r, 14 + Math.random() * 40)); yield { delta: w }; }
  yield { usage: { prompt_tokens: 40, completion_tokens: Math.round(text.length / 4) } };
}
async function* orStream(model, messages, opts = {}, signal) {
  if (state.demo) { yield* demoStream(model.length + messages.length + (opts.seed || 0)); return; }
  const payload = { model, messages, max_tokens: opts.max || cfg.max, temperature: opts.temperature, stream: true, usage: { include: true } };
  let r;
  if (cfg.key) r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}`, 'HTTP-Referer': location.origin, 'X-Title': 'Ringside' }, body: JSON.stringify(payload), signal });
  else { const h = { 'content-type': 'application/json' }; if (cfg.code) h['x-access-code'] = cfg.code; r = await fetch('/api/chat', { method: 'POST', headers: h, body: JSON.stringify(payload), signal }); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(r.status === 401 ? 'OpenRouter rejected the key. Check it in your API key settings.' : r.status === 402 ? 'Your OpenRouter account is out of credits.' : j.error?.message || `${model} refused the fight (${r.status})`); }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') return;
      try { const j = JSON.parse(d); if (j.error) throw new Error(j.error.message); const t = j.choices?.[0]?.delta?.content; if (t) yield { delta: t }; if (j.usage) yield { usage: j.usage }; } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
    }
  }
}
/** Streams a model into an element; returns stats. */
async function fight(model, messages, el, metaEl, opts = {}) {
  const t0 = performance.now(); let first = 0, text = '', usage = null;
  el.innerHTML = '<span class="cursor"></span>';
  try {
    for await (const ev of orStream(model, messages, opts)) {
      if (ev.delta) { if (!first) first = performance.now(); text += ev.delta; el.innerHTML = md(text); el.lastElementChild?.classList.add('cursor'); }
      if (ev.usage) usage = ev.usage;
      if (metaEl && first) metaEl.textContent = `${((performance.now() - first) / 1000).toFixed(1)}s`;
    }
  } catch (e) { text = text || ''; el.innerHTML = md(text) + `<p><strong>Knocked out:</strong> ${esc(e.message)}</p>`; return { model, text, error: e.message, ttft: 0, tps: 0, out: 0, cost: 0 }; }
  el.innerHTML = md(text);
  const end = performance.now();
  const out = usage?.completion_tokens || Math.round(text.length / 4), inp = usage?.prompt_tokens || Math.round(JSON.stringify(messages).length / 4);
  const m = state.models.find(x => x.id === model) || {};
  const cost = usage?.cost ?? (inp * (m.inP || 0) + out * (m.outP || 0));
  const stats = { model, text, ttft: first ? (first - t0) / 1000 : 0, tps: first ? out / Math.max(.05, (end - first) / 1000) : 0, out, inp, cost };
  if (metaEl) metaEl.textContent = `${stats.ttft.toFixed(2)}s first token, ${stats.tps.toFixed(0)} tok/s`;
  return stats;
}

/* ---------- Elo ---------- */
const board = () => LS.get('rs.elo', {});
const hist = () => LS.get('rs.hist', []);
function rate(a, b, score /* 1 a wins, 0 b wins, .5 draw, -1 both lose */) {
  const e = board(); const K = 24;
  for (const id of [a, b]) e[id] ||= { r: 1500, w: 0, l: 0, d: 0 };
  const before = [e[a].r, e[b].r];
  if (score === -1) { e[a].r -= 8; e[b].r -= 8; e[a].l++; e[b].l++; }
  else {
    const ea = 1 / (1 + 10 ** ((e[b].r - e[a].r) / 400));
    e[a].r += K * (score - ea); e[b].r += K * ((1 - score) - (1 - ea));
    if (score === 1) { e[a].w++; e[b].l++; } else if (score === 0) { e[b].w++; e[a].l++; } else { e[a].d++; e[b].d++; }
  }
  LS.set('rs.elo', e);
  return [e[a].r - before[0], e[b].r - before[1]];
}
function logFight(entry) { const h = hist(); h.unshift({ ...entry, at: Date.now() }); LS.set('rs.hist', h.slice(0, 300)); }

/* ---------- views ---------- */
const views = ['bout', 'debate', 'gauntlet', 'scorecard'];
function route() {
  const v = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'bout';
  for (const n of views) $('#view-' + n).hidden = n !== v;
  $$('.tabs a').forEach(a => a.dataset.view === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (v === 'scorecard') renderScore();
}
addEventListener('hashchange', route);

/* Bout */
const PROMPTS = ['Write a haiku about a database migration that went wrong.', 'Explain how HTTPS works using only a pizza delivery analogy.', 'Give me a brutally honest critique of the startup idea: Uber for dog walking, but the walkers are robots.', 'Write a Python function that finds the longest palindromic substring, then explain its complexity.', 'I have 3 days in Tokyo and hate crowds. Plan it.', 'What is the strongest argument against your own last answer to any question?', 'Write the opening paragraph of a noir detective novel set inside a GPU.', 'A bat and a ball cost $1.10. The bat costs $1 more than the ball. Explain the answer like a sports commentator.'];
let bout = null;
$('#boutSuggest').onclick = () => { $('#boutPrompt').value = PROMPTS[Math.random() * PROMPTS.length | 0]; };
$('#boutRandom').onchange = (e) => { $('#boutA').disabled = $('#boutB').disabled = e.target.checked; };
$('#boutA').disabled = $('#boutB').disabled = true;
$('#boutGo').onclick = async () => {
  const prompt = $('#boutPrompt').value.trim() || $('#boutPrompt').placeholder;
  let a = $('#boutA').value, b = $('#boutB').value;
  if ($('#boutRandom').checked) { const pool = state.models.slice(0, 40); a = pool[Math.random() * pool.length | 0].id; do { b = pool[Math.random() * pool.length | 0].id; } while (b === a && pool.length > 1); }
  if (Math.random() < .5) [a, b] = [b, a];
  bout = { a, b, prompt, done: 0 };
  $('#boutRing').hidden = false; $('#boutVerdict').hidden = true; $('#boutReveal').hidden = true;
  $('#whoA').textContent = 'Red corner'; $('#whoB').textContent = 'Blue corner'; $('#metaA').textContent = $('#metaB').textContent = 'Warming up';
  $('#boutGo').disabled = true;
  const msgs = [{ role: 'user', content: prompt }];
  const [sa, sb] = await Promise.all([fight(a, msgs, $('#outA'), $('#metaA'), { seed: 1 }), fight(b, msgs, $('#outB'), $('#metaB'), { seed: 2 })]);
  bout.sa = sa; bout.sb = sb; $('#boutGo').disabled = false; $('#boutVerdict').hidden = false;
  $('#boutVerdict').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
$$('#boutVerdict button').forEach(btn => btn.onclick = () => {
  if (!bout) return; const v = btn.dataset.v; const score = { a: 1, b: 0, t: .5, x: -1 }[v];
  const [da, db] = rate(bout.a, bout.b, score);
  logFight({ kind: 'Bout', a: bout.a, b: bout.b, result: v, prompt: bout.prompt });
  $('#boutVerdict').hidden = true;
  const r = $('#boutReveal'); r.hidden = false;
  const fmt = d => `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d.toFixed(1)} rating</span>`;
  r.innerHTML = `<div class="side stamp"><span>Red corner was</span><span class="nm ${v === 'a' ? 'win' : ''}">${esc(short(bout.a))}</span><span>${esc(maker(bout.a))}</span>${fmt(da)}</div>
    <div class="mid">${{ a: 'Red takes it', b: 'Blue takes it', t: 'Split decision', x: 'No contest' }[v]}</div>
    <div class="side stamp"><span>Blue corner was</span><span class="nm ${v === 'b' ? 'win' : ''}">${esc(short(bout.b))}</span><span>${esc(maker(bout.b))}</span>${fmt(db)}</div>
    <button class="big" id="again">Next bout</button>`;
  $('#whoA').textContent = short(bout.a); $('#whoB').textContent = short(bout.b);
  $('#again').onclick = () => { $('#boutPrompt').value = ''; $('#boutPrompt').focus(); scrollTo({ top: 0, behavior: 'smooth' }); };
  bout = null;
});

/* Debate */
const MOTIONS = ['This house believes AI agents should be allowed to spend money on your behalf.', 'This house would replace all technical interviews with paid trial projects.', 'This house believes open-weight models are better for the world than closed ones.', 'This house believes remote work makes better engineers.', 'This house would ban homework.', 'This house believes pineapple belongs on pizza.'];
$('#motionSuggest').onclick = () => { $('#motion').value = MOTIONS[Math.random() * MOTIONS.length | 0]; };
$('#debGo').onclick = async () => {
  const motion = $('#motion').value.trim() || $('#motion').placeholder;
  const A = $('#debA').value, B = $('#debB').value, J = $('#debJ').value, R = +$('#debR').value;
  const out = $('#debOut'); out.innerHTML = ''; $('#debGo').disabled = true;
  const transcript = [];
  const sys = (side) => `You are in a formal competitive debate. Motion: "${motion}". You argue ${side === 'pro' ? 'FOR' : 'AGAINST'} the motion. Be sharp, specific and persuasive. Use evidence and vivid examples. Directly rebut your opponent's latest points when there are any. Max 170 words. No headings.`;
  const addTurn = (cls, label, model) => { const t = document.createElement('div'); t.className = 'turn ' + cls; t.innerHTML = `<div class="side"><b>${label}</b><span>${esc(short(model))}</span></div><div class="out md"></div>`; out.append(t); return t.querySelector('.out'); };
  const bell = (txt) => { const b = document.createElement('div'); b.className = 'bell'; b.textContent = txt; out.append(b); };
  for (let r = 1; r <= R; r++) {
    bell(r === 1 ? 'Round 1: openings' : `Round ${r}: rebuttals`);
    for (const [side, model] of [['pro', A], ['con', B]]) {
      const history = transcript.map(t => `${t.side === 'pro' ? 'FOR' : 'AGAINST'}: ${t.text}`).join('\n\n');
      const msgs = [{ role: 'system', content: sys(side) }, { role: 'user', content: history ? `Debate so far:\n\n${history}\n\nYour turn.` : 'Give your opening argument.' }];
      const el = addTurn(side, side === 'pro' ? 'For' : 'Against', model);
      const s = await fight(model, msgs, el, null, { max: 420, seed: r * 3 + (side === 'pro' ? 0 : 1) });
      transcript.push({ side, text: s.text });
    }
  }
  bell('The judge');
  const judgeEl = addTurn('judge', 'Judge', J);
  const jmsgs = [{ role: 'system', content: 'You are an impartial debate judge. Score each side 1-10 on argument quality, rebuttal and persuasion. Reply with a short verdict paragraph, then on the last line exactly: SCORES FOR=<n> AGAINST=<n>' }, { role: 'user', content: `Motion: ${motion}\n\n` + transcript.map(t => `${t.side === 'pro' ? 'FOR' : 'AGAINST'}: ${t.text}`).join('\n\n') }];
  const js = await fight(J, jmsgs, judgeEl, null, { max: 400, seed: 7 });
  const m = js.text.match(/FOR\s*=\s*(\d+(?:\.\d)?)\D+AGAINST\s*=\s*(\d+(?:\.\d)?)/i);
  const pf = m ? +m[1] : 7, pa = m ? +m[2] : 6;
  judgeEl.innerHTML = md(js.text.replace(/SCORES.*$/i, '')) + `<div class="cards"><span class="sc">For ${pf}</span><span class="sc">Against ${pa}</span></div>
   <p style="margin-top:14px"><strong>Your call?</strong> <button class="ghost" data-d="1">For wins</button> <button class="ghost" data-d=".5">Draw</button> <button class="ghost" data-d="0">Against wins</button></p>`;
  $$('button[data-d]', judgeEl).forEach(b => b.onclick = () => { const sc = +b.dataset.d; rate(A, B, sc); logFight({ kind: 'Debate', a: A, b: B, result: sc === 1 ? 'a' : sc === 0 ? 'b' : 't', prompt: motion }); b.parentElement.innerHTML = '<strong>Scored.</strong> Your verdict is on the scorecard.'; toast('Debate scored'); });
  $('#debGo').disabled = false;
};

/* Gauntlet */
let roster = LS.get('rs.roster', []);
const drawChips = () => { $('#gChips').innerHTML = roster.map(id => `<span class="chip">${esc(short(id))}<button aria-label="Remove ${esc(short(id))}" data-id="${esc(id)}">×</button></span>`).join(''); $$('#gChips button').forEach(b => b.onclick = () => { roster = roster.filter(x => x !== b.dataset.id); LS.set('rs.roster', roster); drawChips(); }); };
$('#gAdd').onchange = (e) => { const v = e.target.value; if (v && !roster.includes(v)) { if (roster.length >= 6) toast('Six fighters max'); else roster.push(v); } e.target.value = ''; LS.set('rs.roster', roster); drawChips(); };
$('#gFill').onclick = () => { roster = state.models.slice(0, 4).map(m => m.id); LS.set('rs.roster', roster); drawChips(); };
$('#gGo').onclick = async () => {
  if (roster.length < 2) { toast('Add at least two fighters'); return; }
  const prompt = $('#gPrompt').value.trim() || $('#gPrompt').placeholder;
  $('#gBoard').hidden = false; $('#gGo').disabled = true;
  const grid = $('#gGrid'); grid.innerHTML = '';
  const cells = roster.map((id, i) => { const c = document.createElement('div'); c.className = 'gcell'; c.innerHTML = `<header><b>${esc(short(id))}</b><button hidden>Crown</button></header><div class="out md"></div>`; grid.append(c); return c; });
  $('#gRows').innerHTML = roster.map(id => `<tr><td><b>${esc(short(id))}</b></td><td class="num">…</td><td class="num">…</td><td class="num">…</td><td class="num">…</td><td></td></tr>`).join('');
  const results = await Promise.all(roster.map((id, i) => fight(id, [{ role: 'user', content: prompt }], cells[i].querySelector('.out'), null, { seed: i })));
  const maxTps = Math.max(...results.map(r => r.tps), 1);
  const fastest = results.reduce((a, b) => (b.ttft && (!a.ttft || b.ttft < a.ttft) ? b : a));
  $('#gRows').innerHTML = results.map(r => `<tr class="${r === fastest ? 'best' : ''}"><td><b>${esc(short(r.model))}</b>${r.error ? ' <em>(out)</em>' : ''}</td><td class="num">${r.ttft.toFixed(2)}s</td><td class="num">${r.tps.toFixed(0)} tok/s<span class="bar" style="width:${(r.tps / maxTps * 120) | 0}px"></span></td><td class="num">${r.out}</td><td class="num">$${r.cost.toFixed(5)}</td><td>${r === fastest ? 'Fastest' : ''}</td></tr>`).join('');
  cells.forEach((c, i) => { const b = c.querySelector('button'); b.hidden = false; b.onclick = () => {
    for (let j = 0; j < roster.length; j++) if (j !== i) rate(roster[i], roster[j], 1);
    logFight({ kind: 'Gauntlet', a: roster[i], b: `${roster.length - 1} others`, result: 'a', prompt });
    $$('.gcell').forEach(x => x.classList.remove('crowned')); c.classList.add('crowned'); $$('.gcell header button').forEach(x => x.hidden = true); toast(`${short(roster[i])} wins the gauntlet`);
  }; });
  $('#gGo').disabled = false;
};

/* Scorecard */
function renderScore() {
  const e = board(); const rows = Object.entries(e).sort((a, b) => b[1].r - a[1].r);
  if (!rows.length) { $('#belt').innerHTML = '<div class="plate">?</div><div><div class="t">Title vacant</div><p>Score your first fight to crown a champion.</p></div>'; $('#rankRows').innerHTML = ''; }
  else {
    const [cid, c] = rows[0];
    $('#belt').innerHTML = `<div class="plate">1</div><div><div class="t">${esc(short(cid))}</div><p>Your champion at ${c.r.toFixed(0)}, with a record of ${c.w}-${c.l}-${c.d}.</p></div>`;
    $('#rankRows').innerHTML = rows.map(([id, s], i) => { const n = s.w + s.l + s.d; return `<tr><td>${i + 1}</td><td><b>${esc(short(id))}</b> <span style="color:var(--mute)">${esc(maker(id))}</span></td><td>${s.r.toFixed(0)}</td><td>${s.w}</td><td>${s.l}</td><td>${s.d}</td><td>${n ? Math.round(s.w / n * 100) : 0}%</td></tr>`; }).join('');
  }
  const h = hist();
  $('#history').innerHTML = h.length ? h.slice(0, 60).map(f => `<li><span class="k">${esc(f.kind)}</span><span><b>${esc(short(f.a))}</b> vs <b>${esc(f.b.includes('/') ? short(f.b) : f.b)}</b>: ${{ a: `${esc(short(f.a))} won`, b: `${esc(f.b.includes('/') ? short(f.b) : f.b)} won`, t: 'draw', x: 'both lost' }[f.result]}<br><span class="p">${esc(f.prompt)}</span></span><span class="p">${new Date(f.at).toLocaleDateString()}</span></li>`).join('') : '<li class="empty">No fights yet. Head to Blind bout and ring the bell.</li>';
}
$('#resetScore').onclick = () => { if ($('#resetScore').dataset.armed) { LS.set('rs.elo', {}); LS.set('rs.hist', []); renderScore(); toast('Scorecard reset'); delete $('#resetScore').dataset.armed; $('#resetScore').textContent = 'Reset'; } else { $('#resetScore').dataset.armed = 1; $('#resetScore').textContent = 'Click again to reset'; setTimeout(() => { delete $('#resetScore').dataset.armed; $('#resetScore').textContent = 'Reset'; }, 3000); } };
$('#copyScore').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify({ ratings: board(), history: hist() }, null, 2)); toast('Scorecard copied'); } catch { toast('Copy blocked by the browser'); } };

/* Settings */
function openSettings(reason) { $('#sKey').value = cfg.key; $('#sCode').value = cfg.code; $('#sMax').value = cfg.max; const st = $('#sStatus'); st.textContent = typeof reason === 'string' ? reason : ''; st.dataset.kind = ''; $('#settings').showModal(); setTimeout(() => $('#sKey').focus(), 50); }
$('#openSettings').onclick = () => openSettings();
async function testOpenRouter(key) { try { const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${key}` } }); if (r.ok) return { ok: true }; return { ok: false, message: r.status === 401 ? 'OpenRouter rejected that key. Copy it again from openrouter.ai/keys.' : `OpenRouter answered ${r.status}.` }; } catch (e) { return { ok: false, message: `Couldn't reach OpenRouter: ${e.message}` }; } }
$('#sSave').onclick = async (e) => {
  e.preventDefault(); const key = $('#sKey').value.trim(); const st = $('#sStatus');
  LS.set('rs.code', $('#sCode').value.trim()); LS.set('rs.max', Math.max(128, Math.min(8192, +$('#sMax').value || 1200)));
  if (key && key !== cfg.key) { $('#sSave').disabled = true; st.textContent = 'Checking the key with OpenRouter'; st.dataset.kind = ''; const t = await testOpenRouter(key); $('#sSave').disabled = false; if (!t.ok) { st.textContent = t.message; st.dataset.kind = 'error'; return; } }
  LS.set('rs.key', key); $('#settings').close(); toast(key ? 'Key saved in this browser' : 'Settings saved'); checkKey();
};
$('#sForget').onclick = () => { LS.set('rs.key', ''); $('#settings').close(); toast('Key removed from this browser'); checkKey(); };

/* keyboard: Cmd/Ctrl+Enter fires the current view */
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { const v = location.hash.slice(1) || 'bout'; ({ bout: '#boutGo', debate: '#debGo', gauntlet: '#gGo' }[v] && $({ bout: '#boutGo', debate: '#debGo', gauntlet: '#gGo' }[v]).click()); } });

route(); drawChips();
await loadModels(); await checkKey();
