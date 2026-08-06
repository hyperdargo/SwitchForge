# SwitchForge by DTEmpire

![SwitchForge](https://img.shields.io/badge/SwitchForge-by%20DTEmpire-c99b3d?style=for-the-badge)
![React](https://img.shields.io/badge/React-Vite-61dafb?style=flat-square&logo=react&logoColor=111827)
![Node](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/status-early%20access-d9ae4c?style=flat-square)

SwitchForge is an OpenAI-compatible model gateway for developers who want one stable endpoint with two routing levels:

- **Free / Normal Chat** for everyday questions, rewriting, summaries, and lightweight work.
- **Premium / Premium** for coding, difficult reasoning, and tasks that need stronger model capability.

The project includes a developer console, Gmail OTP signup, expiring API keys, usage accounting, a live homepage demo, documentation, and a Docker Compose deployment.

> SwitchForge is free during early access while the gateway is tested and improved. It may become a subscription-supported service later so premium model access and infrastructure can remain reliable.

## Features

- Gmail SMTP verification with six-digit OTPs
- Password hashing with Node `scrypt`
- Hashed sessions and customer API keys
- OpenAI-compatible `POST /v1/chat/completions`
- Free and premium OmniRoute routing
- Streaming and non-streaming response normalization
- Per-key token allowances: 100K, 500K, or 1M
- Key expiry: 1, 2, or 3 months
- Maximum of three active keys per regular account
- Admin-only unlimited key creation, unlimited tokens, and no-expiry keys
- Admin gateway testing with provider model discovery and route selectors
- Admin user usage ranking, suspension/restoration, and 100K token grants
- Free-only access by default, with per-user Premium access controlled by admins
- Account password changes from the console settings
- Usage endpoint and key revocation
- Cloudflare R2-backed durable JSON persistence
- Responsive console with walkthrough documentation

## Quick Start

Requirements: Node.js 22+, npm, and an OmniRoute-compatible endpoint.

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Open `http://localhost:6010`. For development with Vite, use two terminals:

```bash
npm run backend
npm run dev
```

Then open `http://localhost:6009`.

## Docker Compose

The stack runs a backend on port `6010` and a frontend/proxy on port `6009`.

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Use `http://localhost:6009` for the website. The frontend proxies `/api/*` and `/v1/*` to the backend. Backend data is also mounted in a named volume as a local recovery copy.

## Environment

The `.env` file is ignored by Git. Configure these values before starting:

| Variable | Purpose |
| --- | --- |
| `GMAIL_USER` | Gmail address used to send OTPs |
| `GMAIL_APP_PASSWORD` | Gmail app password, not the normal account password |
| `OMNIROUTE_BASE_URL` | OmniRoute `/v1` base URL |
| `OMNIROUTE_API_KEY` | Server-side OmniRoute key |
| `SESSION_SECRET` | Long random secret for future session signing/rotation |
| `STORAGE_BACKEND` | `r2` for Cloudflare R2 or `local` for `server/data/db.json` |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | R2 bucket name, e.g. `switchforge` |
| `R2_OBJECT_KEY` | Database object path, e.g. `data/db.json` |
| `R2_ACCESS_KEY_ID` | R2 S3 access key |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret |

R2 is object storage, not SQL. This implementation stores the current database snapshot as one private JSON object and writes a local backup as well. Keep one backend writer unless you migrate to Cloudflare D1 or another transactional database.

## API Examples

After creating an API key in the console:

```bash
export DT_API_KEY="dt_live_YOUR_KEY"

curl http://localhost:6010/v1/chat/completions \
  -H "Authorization: Bearer $DT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"SwitchForge","tier":"free","messages":[{"role":"user","content":"Hello"}]}'
```

New regular accounts are Free-only. Every request from those accounts uses the configured Free route, even when `tier: premium` is requested or a coding prompt is detected. An administrator can grant Premium access to a specific user from **Admin → Users & usage**. Premium-enabled users use conservative `auto` routing: ordinary chat stays on Free, while clear coding, debugging, or implementation requests route to Premium. Provider and IDE system prompts are ignored so ordinary messages in coding clients remain fast.

```json
{"model":"SwitchForge","tier":"premium","messages":[{"role":"user","content":"Review this architecture"}]}
```

For example, a coding request such as `print("helloworld")` should resolve to Premium when `tier` is omitted. Inspect the response field `dtempire.model`, `dtempire.tier`, or the `X-SwitchForge-Route-Model` response header to see the resolved route.

Inspect the current key allowance:

```bash
curl http://localhost:6010/v1/usage \
  -H "Authorization: Bearer $DT_API_KEY"
```

Administrators see two additional choices in the API key creation dialog: `Unlimited tokens` and `Never expires`. Admin accounts can also create more than three active keys. These values are enforced server-side, so sending `months: 0` or `tokenLimit: 0` as a regular user is rejected.

Auxiliary jobs can select a separately configured route with the `x-switchforge-task` header. Supported tasks include `vision`, `web_extract`, `compression`, `skills_hub`, `approval`, `mcp`, `title_gen`, `triage_specifier`, `kanban_decomposer`, `profile_describer`, and `curator`.

```bash
curl http://localhost:6010/v1/chat/completions \
  -H "Authorization: Bearer $DT_API_KEY" \
  -H "x-switchforge-task: compression" \
  -H "Content-Type: application/json" \
  -d '{"model":"SwitchForge","messages":[{"role":"user","content":"Compact this context"}]}'
```

## Security Notes

- Never commit `.env`, API keys, SMTP passwords, or R2 secrets.
- The full customer key is shown only once after creation.
- Store customer keys server-side and rotate them before expiry.
- Rotate any credential that has been shared publicly or exposed in logs.
- R2 credentials should be scoped to the required bucket and object operations.

## Project Layout

```text
src/                  React console and documentation
server/index.js       Auth, OTP, keys, usage, and OmniRoute gateway
server/frontend.js    Container frontend server and API proxy
compose.yaml          Frontend + backend services
Dockerfile.frontend   Vite build and frontend runtime image
Dockerfile.backend    API runtime image
docs/                 Product and routing plan
```

Copyright © 2026 DargoTamber (DTEmpire).
