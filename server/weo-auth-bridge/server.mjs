/**
 * Weo auth bridge.
 *
 * A small, dependency-free service deployed next to New API on the VPS. It
 * gives the Weo CLI two things New API does not expose directly:
 *
 *   1. An OAuth-style device-authorization flow so users can sign in from the
 *      terminal by approving in a browser on the Weo platform.
 *   2. A normalized account/quota endpoint (remaining / used) so the terminal
 *      can show the user's shared-quota balance.
 *
 * It talks to the New API instance server-side using the user's own API token
 * (OpenAI-compatible billing endpoints), so no admin secret is handed to
 * clients. Device-code state is kept in memory — fine for a single instance;
 * front with Redis if you run multiple replicas.
 *
 * Env:
 *   PORT                 (default 8787)
 *   NEW_API_BASE_URL     base URL of the New API instance (e.g. https://api.weo.asia)
 *   PUBLIC_BASE_URL      public URL of THIS bridge (for verification_uri)
 *   DEVICE_CODE_TTL_SEC  (default 600)
 *   POLL_INTERVAL_SEC    (default 5)
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT || 8787)
const NEW_API_BASE_URL = stripSlash(
  process.env.NEW_API_BASE_URL || 'https://api.weo.asia',
)
const PUBLIC_BASE_URL = stripSlash(
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`,
)
const DEVICE_CODE_TTL_SEC = Number(process.env.DEVICE_CODE_TTL_SEC || 600)
const POLL_INTERVAL_SEC = Number(process.env.POLL_INTERVAL_SEC || 5)

/** device_code -> { userCode, status, token, user, expiresAt } */
const devices = new Map()

function stripSlash(u) {
  return String(u).replace(/\/+$/, '')
}

function json(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data),
  })
  res.end(data)
}

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

function randomCode(bytes) {
  return randomBytes(bytes).toString('hex')
}

function userCode() {
  // Human-friendly: XXXX-XXXX
  const s = randomBytes(4).toString('hex').toUpperCase()
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`
}

function prune() {
  const now = Date.now()
  for (const [k, v] of devices) if (v.expiresAt < now) devices.delete(k)
}

/** Validate a New API token and fetch the account's quota via billing endpoints. */
async function fetchAccount(token) {
  const headers = { Authorization: `Bearer ${token}` }
  const subRes = await fetch(
    `${NEW_API_BASE_URL}/v1/dashboard/billing/subscription`,
    { headers },
  )
  if (!subRes.ok) return null
  const sub = await subRes.json()

  // Usage window: last ~100 days is plenty for a running balance.
  const end = new Date()
  const start = new Date(end.getTime() - 100 * 24 * 3600 * 1000)
  const fmt = d => d.toISOString().slice(0, 10)
  let usedUsd = 0
  try {
    const usageRes = await fetch(
      `${NEW_API_BASE_URL}/v1/dashboard/billing/usage?start_date=${fmt(start)}&end_date=${fmt(end)}`,
      { headers },
    )
    if (usageRes.ok) {
      const usage = await usageRes.json()
      usedUsd = (Number(usage.total_usage) || 0) / 100 // cents → USD
    }
  } catch {
    // usage is best-effort
  }

  const totalUsd = Number(sub.hard_limit_usd ?? sub.system_hard_limit_usd ?? 0)
  return {
    username: sub.account ?? undefined,
    group: undefined,
    // Values are already USD; unit_per_dollar = 1 keeps the CLI formatter exact.
    quota_remaining: Math.max(totalUsd - usedUsd, 0),
    quota_used: usedUsd,
    unit_per_dollar: 1,
    expires_at: undefined,
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

// ── New API integration (account/password SSO) ──────────────────────────────

/** Build a `Cookie` header value from an array of Set-Cookie strings. */
function cookieHeaderFrom(setCookies) {
  return (setCookies || [])
    .map(c => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

/** Log a user into New API with username/password; returns the session cookie. */
async function newApiLogin(username, password) {
  const res = await fetch(`${NEW_API_BASE_URL}/api/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // fall through to error handling
  }
  if (!res.ok || data.success === false) {
    return { ok: false, message: data.message || `Login failed (HTTP ${res.status}).` }
  }
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')]
        : []
  const user = data.data || {}
  return {
    ok: true,
    cookie: cookieHeaderFrom(setCookies),
    userId: user.id,
    username: user.username || username,
  }
}

/**
 * Create an API token under the logged-in user's session and return the usable
 * key (`sk-...`). New API requires the `New-Api-User` header alongside the
 * session cookie. Field/response shapes vary by version, so this is defensive:
 * it reads the key from the create response if present, otherwise lists tokens
 * and matches by name.
 */
async function newApiCreateToken(cookie, userId, name) {
  const headers = {
    'content-type': 'application/json',
    cookie,
    'New-Api-User': String(userId ?? ''),
  }
  const createRes = await fetch(`${NEW_API_BASE_URL}/api/token/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      remain_quota: -1,
      expired_time: -1,
      unlimited_quota: true,
    }),
  })
  let created = {}
  try {
    created = await createRes.json()
  } catch {
    // fall through
  }
  if (!createRes.ok || created.success === false) {
    return { ok: false, message: created.message || `Token creation failed (HTTP ${createRes.status}).` }
  }
  if (created?.data?.key) {
    return { ok: true, key: `sk-${created.data.key}` }
  }

  const listRes = await fetch(`${NEW_API_BASE_URL}/api/token/?p=0&size=50`, { headers })
  let list = {}
  try {
    list = await listRes.json()
  } catch {
    // fall through
  }
  const items = Array.isArray(list?.data)
    ? list.data
    : Array.isArray(list?.data?.records)
      ? list.data.records
      : []
  const byNewest = (a, b) => (b.id || 0) - (a.id || 0)
  const match =
    items.filter(t => t.name === name).sort(byNewest)[0] ??
    items.slice().sort(byNewest)[0]
  if (match?.key) {
    return { ok: true, key: `sk-${match.key}`, username: undefined }
  }
  return {
    ok: false,
    message: 'Token created but its key could not be read (check New API version).',
  }
}

function loginPage(code, message) {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Sign in to Weo</title>
<style>body{font-family:system-ui;max-width:30rem;margin:4rem auto;padding:0 1rem}
input{width:100%;padding:.6rem;margin:.4rem 0;box-sizing:border-box}
button{padding:.6rem 1rem}</style></head><body>
<h1>Sign in to Weo</h1>
<p>Log in with your Weo account to authorize device code
<b>${escapeHtml(code)}</b>.</p>
${message ? `<p style="color:#b00">${escapeHtml(message)}</p>` : ''}
<form method="POST" action="/activate">
<input type="hidden" name="user_code" value="${escapeHtml(code)}"/>
<label>Username</label>
<input name="username" autocomplete="username"/>
<label>Password</label>
<input name="password" type="password" autocomplete="current-password"/>
<button type="submit">Sign in</button>
</form></body></html>`
}

const server = createServer(async (req, res) => {
  prune()
  const url = new URL(req.url, PUBLIC_BASE_URL)
  const path = url.pathname

  try {
    // 1) CLI requests a device + user code.
    if (req.method === 'POST' && path === '/oauth/device/code') {
      const deviceCode = randomCode(32)
      const uCode = userCode()
      devices.set(deviceCode, {
        userCode: uCode,
        status: 'pending',
        token: null,
        user: null,
        expiresAt: Date.now() + DEVICE_CODE_TTL_SEC * 1000,
      })
      const verificationUri = `${PUBLIC_BASE_URL}/activate`
      return json(res, 200, {
        device_code: deviceCode,
        user_code: uCode,
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(uCode)}`,
        interval: POLL_INTERVAL_SEC,
        expires_in: DEVICE_CODE_TTL_SEC,
      })
    }

    // 2) Browser login page (Weo account = New API account).
    if (req.method === 'GET' && path === '/activate') {
      const code = url.searchParams.get('user_code') || ''
      return html(res, 200, loginPage(code, ''))
    }

    // 3) Browser submits account credentials → log into New API, mint a token,
    //    and bind it to the device code. SSO: the user never handles a token.
    if (req.method === 'POST' && path === '/activate') {
      const body = await readBody(req)
      const params = new URLSearchParams(body)
      const code = (params.get('user_code') || '').trim()
      const username = (params.get('username') || '').trim()
      const password = params.get('password') || ''
      const entry = [...devices.values()].find(d => d.userCode === code)
      if (!entry) return html(res, 400, loginPage(code, 'Unknown or expired code.'))

      const login = await newApiLogin(username, password)
      if (!login.ok) {
        return html(res, 401, loginPage(code, login.message))
      }
      const minted = await newApiCreateToken(
        login.cookie,
        login.userId,
        `weo-cli-${code}`,
      )
      if (!minted.ok) {
        return html(res, 502, loginPage(code, minted.message))
      }

      entry.status = 'approved'
      entry.token = minted.key
      entry.user = { username: login.username, id: login.userId }
      return html(res, 200, '<!doctype html><p>Signed in. You can return to the terminal.</p>')
    }

    // 4) CLI polls for the token.
    if (req.method === 'POST' && path === '/oauth/device/token') {
      const body = await readBody(req)
      let deviceCode = ''
      try {
        deviceCode = (JSON.parse(body || '{}').device_code || '').trim()
      } catch {
        deviceCode = (new URLSearchParams(body).get('device_code') || '').trim()
      }
      const entry = devices.get(deviceCode)
      if (!entry) return json(res, 400, { error: 'expired_token' })
      if (entry.status === 'approved') {
        devices.delete(deviceCode)
        return json(res, 200, {
          access_token: entry.token,
          user: entry.user,
        })
      }
      return json(res, 200, { error: 'authorization_pending' })
    }

    // 5) Normalized account/quota for the signed-in CLI token.
    if (req.method === 'GET' && path === '/weo/account') {
      const auth = req.headers['authorization'] || ''
      const token = auth.replace(/^Bearer\s+/i, '').trim()
      if (!token) return json(res, 401, { error: 'missing_token' })
      const account = await fetchAccount(token)
      if (!account) return json(res, 401, { error: 'invalid_token' })
      return json(res, 200, account)
    }

    if (path === '/healthz') return json(res, 200, { ok: true })
    return json(res, 404, { error: 'not_found' })
  } catch (err) {
    return json(res, 500, { error: 'internal', message: String(err?.message || err) })
  }
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`weo-auth-bridge listening on :${PORT} → New API ${NEW_API_BASE_URL}`)
})
