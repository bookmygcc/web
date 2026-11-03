// bookmyGCC Worker: serves the static site from ./public and handles POST /api/lead.
// Secrets (set in Cloudflare, never in this repo):
//   TURNSTILE_SECRET   Turnstile secret key for the "bookmyGCC website" widget
//   LEADS_WEBHOOK      (optional) Google Apps Script web app URL that logs to the Leads Sheet and emails hello@
//   LEADS_WEBHOOK_KEY  (optional) shared key sent to the webhook so it can reject other callers

const ALLOWED_HOSTS = ['bookmygcc.com', 'www.bookmygcc.com', 'web.saravanan-a38.workers.dev'];
const MAX_BODY = 16 * 1024;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
// Free webmail domains are not accepted: we ask for a work email so the founder can place the request.
const FREE_MAIL = new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.in','yahoo.co.in','ymail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','proton.me','protonmail.com','rediffmail.com','gmx.com','mail.com','zoho.com','yandex.com']);

const FIELDS = {
  client: { required: ['first_name', 'last_name', 'email', 'company', 'role', 'stage'], optional: ['area', 'message'] },
  partner: { required: ['first_name', 'last_name', 'email', 'company'], optional: ['website', 'type', 'area', 'message'] },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}

function clean(v, max) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

async function verifyTurnstile(token, ip, secret, expectedAction) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  form.append('idempotency_key', crypto.randomUUID());
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await r.json();
  if (!out.success) return false;
  if (out.action && out.action !== expectedAction) return false;
  if (out.hostname && !ALLOWED_HOSTS.includes(out.hostname)) return false;
  return true;
}

async function handleLead(request, env) {
  const origin = request.headers.get('Origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).hostname; } catch { /* ignore */ }
    if (!ALLOWED_HOSTS.includes(host)) return json({ ok: false, error: 'Request not allowed.' }, 403);
  }
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json({ ok: false, error: 'Unsupported request.' }, 415);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'Message is too long.' }, 413);

  let d;
  try { d = JSON.parse(raw); } catch { return json({ ok: false, error: 'Invalid request.' }, 400); }

  const kind = d.kind === 'partner' ? 'partner' : d.kind === 'client' ? 'client' : null;
  if (!kind) return json({ ok: false, error: 'Invalid request.' }, 400);

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (clean(d.company_url, 200)) return json({ ok: true, stored: false });

  const spec = FIELDS[kind];
  const lead = { kind };
  for (const f of [...spec.required, ...spec.optional]) lead[f] = clean(d[f], f === 'message' ? 2000 : 200);
  for (const f of spec.required) if (!lead[f]) return json({ ok: false, error: 'Please fill in all required fields.' }, 400);
  if (!EMAIL_RE.test(lead.email)) return json({ ok: false, error: 'Please enter a valid work email.' }, 400);
  if (FREE_MAIL.has(lead.email.split('@')[1].toLowerCase())) return json({ ok: false, error: 'Please use your work email, not a personal one such as Gmail.' }, 400);
  if (d.consent !== true) return json({ ok: false, error: 'Please tick the consent box.' }, 400);

  if (!env.TURNSTILE_SECRET) return json({ ok: false, error: 'Form is not configured yet.' }, 503);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const human = await verifyTurnstile(clean(d.token, 2048), ip, env.TURNSTILE_SECRET, kind);
  if (!human) return json({ ok: false, error: 'Security check failed. Please refresh the page and try again.' }, 403);

  lead.consent = true;
  lead.submitted_at = new Date().toISOString();
  lead.country = request.cf?.country || '';
  lead.page = new URL(request.url).hostname;

  if (!env.LEADS_WEBHOOK) {
    // Preview mode: nothing is stored until the Leads Sheet webhook is connected.
    console.log(JSON.stringify({ event: 'lead_received_not_stored', kind, at: lead.submitted_at }));
    return json({ ok: true, stored: false });
  }

  const r = await fetch(env.LEADS_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: env.LEADS_WEBHOOK_KEY || '', lead }),
    redirect: 'follow',
  });
  let saved = false;
  if (r.ok) { try { saved = (await r.json()).ok === true; } catch { saved = false; } }
  if (!saved) {
    console.error(JSON.stringify({ event: 'lead_webhook_failed', status: r.status, kind }));
    return json({ ok: false, error: 'We could not save your request right now.' }, 502);
  }
  return json({ ok: true, stored: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead') {
      if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
      try { return await handleLead(request, env); } catch (e) {
        console.error(JSON.stringify({ event: 'lead_error', message: String(e) }));
        return json({ ok: false, error: 'Something went wrong.' }, 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
