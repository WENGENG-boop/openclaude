# Weo auth bridge

A small, dependency-free Node service that sits next to your [New API]
instance on the VPS and gives the Weo terminal what New API doesn't expose
directly:

1. **Device-flow login** — the CLI gets a `user_code`, the user approves it in
   a browser on your platform, and the terminal receives a token. No Anthropic
   or third-party login is involved; everything targets your own platform.
2. **Account / quota sync** — a normalized `GET /weo/account` endpoint that the
   terminal uses to show remaining and used quota (the `/balance` command and
   the status line).

It only ever uses the **user's own API token** against New API's
OpenAI-compatible billing endpoints, so no admin secret is handed to clients.

## Endpoints

| Method | Path                   | Used by | Purpose |
| ------ | ---------------------- | ------- | ------- |
| POST   | `/oauth/device/code`   | CLI     | Start login; returns `device_code` + `user_code` + `verification_uri`. |
| GET    | `/activate`            | Browser | Approval page (enter token created in the Weo panel). |
| POST   | `/activate`            | Browser | Validates the token and approves the code. |
| POST   | `/oauth/device/token`  | CLI     | Polled until approved; returns `access_token`. |
| GET    | `/weo/account`         | CLI     | Normalized `{ quota_remaining, quota_used, unit_per_dollar, ... }`. |
| GET    | `/healthz`             | ops     | Liveness. |

Quota is read from New API's `/v1/dashboard/billing/subscription` and
`/v1/dashboard/billing/usage` (values are USD, so `unit_per_dollar` is `1`).

## Run

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

## Notes / upgrade paths

- **State** is in memory (one instance). For multiple replicas, store device
  codes in Redis.
- **True SSO**: the `/activate` page currently asks the user to paste a token
  created in the panel. To make it a one-click "log in on the platform" step,
  replace `/activate` with a page gated by your New API session (or its
  configured OAuth provider) that creates/returns a token server-side.

[New API]: https://github.com/QuantumNous/new-api
