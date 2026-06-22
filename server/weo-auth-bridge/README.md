# Weo auth bridge

A small, dependency-free Node service that sits next to your [New API]
instance on the VPS and gives the Weo terminal what New API doesn't expose
directly:

1. **Browser SSO (device flow)** — the CLI gets a `user_code`; the user opens
   a page on the bridge and **logs in with their Weo (New API) account
   (username/password)**. The bridge logs them into New API server-side, mints
   an API token under their account, and hands it back to the terminal. The
   user never sees or pastes a token, and the password never touches the CLI.
   No Anthropic or third-party login is involved.
2. **Account / quota sync** — a normalized `GET /weo/account` endpoint that the
   terminal uses to show remaining and used quota (the `/balance` command and
   the status line).

It only ever uses the **user's own API token** against New API's
OpenAI-compatible billing endpoints, so no admin secret is handed to clients.

## Endpoints

| Method | Path                   | Used by | Purpose |
| ------ | ---------------------- | ------- | ------- |
| POST   | `/oauth/device/code`   | CLI     | Start login; returns `device_code` + `user_code` + `verification_uri`. |
| GET    | `/activate`            | Browser | Login page (Weo account username/password). |
| POST   | `/activate`            | Browser | Logs into New API, mints a token, approves the code. |
| POST   | `/oauth/device/token`  | CLI     | Polled until approved; returns `access_token`. |
| GET    | `/weo/account`         | CLI     | Normalized `{ quota_remaining, quota_used, unit_per_dollar, ... }`. |
| GET    | `/healthz`             | ops     | Liveness. |

Quota is read from New API's `/v1/dashboard/billing/subscription` and
`/v1/dashboard/billing/usage` (values are USD, so `unit_per_dollar` is `1`).

## Run

One-shot on the VPS (starts it, waits for `/healthz`, prints the nginx snippet
and CLI env vars to set):

```bash
./deploy.sh            # Docker (default)
./deploy.sh --node     # plain Node (>=22), backgrounded to bridge.log
```

Or manually:

```bash
cp .env.example .env   # edit NEW_API_BASE_URL + PUBLIC_BASE_URL
node server.mjs
# or
docker compose up -d --build
```

Reverse-proxy it under your platform host (see `nginx.example.conf`). With the
default `/bridge` prefix, point the CLI at it:

```bash
export WEO_BRIDGE_URL=https://api.weo.asia/bridge
```

If the bridge serves `/oauth` and `/weo` at the host root instead, the CLI
needs no override (it defaults `WEO_BRIDGE_URL` to `WEO_BASE_URL`).

## How SSO works

`/activate` posts the account credentials to the bridge, which:
1. `POST /api/user/login` to New API → session cookie + user id.
2. `POST /api/token/` (with the session cookie + `New-Api-User: <id>` header) to
   create a token named `weo-cli-<code>`, then reads its key (`sk-...`).
3. Binds that key to the device code; the CLI polls and receives it.

No admin/system token is needed — the bridge acts as the user via their own
session. The password is used once, server-side, and never stored.

> ⚠️ New API is a one-api fork and response shapes vary by version. The token
> create/list parsing is defensive (reads `data.key`, else lists and matches by
> name) but **verify against your instance**: confirm `/api/user/login` returns a
> `session` cookie + `data.id`, and that `/api/token/` create + list expose the
> token `key`. Adjust field names if your version differs.

## Notes / upgrade paths

- **State** is in memory (one instance). For multiple replicas, store device
  codes in Redis.
- If your panel uses **third-party login only** (GitHub/OIDC, no password),
  replace the `/activate` login form with a page gated by that provider's
  session instead of username/password; the token-minting step is unchanged.

[New API]: https://github.com/QuantumNous/new-api
