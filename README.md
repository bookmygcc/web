# bookmyGCC website (Stage 1 MVP)

One-page site for bookmyGCC, served by the Cloudflare Worker `web` with static assets.

- `public/`: the site (index, privacy, terms, 404, assets, `_headers` security headers)
- `src/worker.js`: serves assets and handles `POST /api/lead` (client and partner forms) with a Turnstile check
- `wrangler.jsonc`: Worker config. Cloudflare Workers Builds deploys every push to `main` with `npx wrangler deploy`.

Secrets are set in Cloudflare (Worker → Settings → Variables and secrets), never committed:
`TURNSTILE_SECRET`, and once the Leads Sheet is wired, `LEADS_WEBHOOK` and `LEADS_WEBHOOK_KEY`.
Until `LEADS_WEBHOOK` is set, forms are validated and spam-checked but nothing is stored.

Local: `npm install`, put a Turnstile test secret in `.dev.vars`, then `npm run dev`.
