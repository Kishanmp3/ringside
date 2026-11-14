# Ringside

Blind fights between AI models, judged by you. Every model on OpenRouter, one key.

- **Blind bout**: one prompt, two hidden models streaming side by side. Vote, then the names drop and Elo updates.
- **Debate**: a motion, a For model, an Against model, 1 to 3 rounds, an AI judge, and your override.
- **Gauntlet**: up to six models on one prompt. Time to first token, tokens per second, tokens and cost.
- **Scorecard**: your personal Elo leaderboard and fight history (stored in your browser).

Without a key the arena runs in demo mode with practice answers, so the UI is always explorable.

## Run locally
```bash
cp .env.example .env.local   # add OPENROUTER_API_KEY
node dev-server.mjs          # http://localhost:3000
```

## Deploy (Vercel)
```bash
vercel --prod
vercel env add OPENROUTER_API_KEY   # then redeploy
```
Add a subdomain such as `ringside.kpatel.me` in Vercel and point a CNAME at it in Cloudflare.

## Files
- `index.html`: landing page
- `app.html`, `assets/app.js`, `assets/app.css`: the arena
- `api/chat.js`: streaming proxy to OpenRouter (key stays on the server)
- `api/models.js`: newest-first model catalog, cached 10 minutes
- `dev-server.mjs`: zero-dependency local server that runs the `api/` routes

Keyboard: Ctrl/Cmd + Enter starts the fight on the current tab.
