# OmniRoute API Platform Plan

## 1. Product summary

Build a hosted service that lets a customer create an API key and call one stable, OpenAI-compatible endpoint. The customer selects one public model name (for example, `omniroute-auto`); OmniRoute decides which provider/model should handle each request.

- Everyday chat, short questions, summarization, and low-risk tasks use a free/low-cost model combination.
- Coding, long-context work, difficult reasoning, tool use, and other high-value requests use a premium combination backed by providers such as Claude, Codex, or other paid APIs.
- Provider details stay behind OmniRoute, so applications do not need to change when routing or providers change.

The first release should focus on text chat through `POST /v1/chat/completions`. Embeddings, image generation, audio, and agent tools should be separate later products rather than hidden inside the first endpoint.

## 2. Recommended plans

| Plan | Intended user | Included usage | Routing | Limits and controls |
|---|---|---:|---|---|
| Free | Testing and personal projects | Daily/monthly request and token quota | Free combo only, with premium fallback disabled | Low rate limit, queueing, visible usage cap |
| Auto | General production apps | Metered monthly quota | Free combo first; premium only when policy permits and budget is available | Per-minute limit, hard monthly spend cap |
| Pro | Developers who need reliable quality | Larger quota plus optional prepaid credits | Free for normal work; premium for coding/reasoning/long context | Higher rate limit, priority queue, configurable premium budget |
| Team | Small teams | Shared credits and workspaces | Same policy with team-level controls | Members, audit logs, per-project keys, spend alerts |
| BYOK | Advanced or privacy-sensitive users | No OmniRoute provider markup on customer keys | Customer-selected providers, optionally mixed with free combo | Encrypted key storage, provider-specific terms and limits |
| Enterprise | Businesses | Contracted volume/SLA | Custom routing and approved providers | SSO, private deployment option, retention controls, support |

Keep “premium” as a routing capability, not necessarily a separate public model. A future API may expose `omniroute-free` and `omniroute-premium`, but the default should remain `omniroute-auto` for compatibility.

## 3. Core request flow

1. Client sends an OpenAI-compatible request with an OmniRoute API key.
2. Gateway authenticates the key, checks quota, and assigns a request ID.
3. A classifier/policy engine scores the request using metadata and content signals.
4. The router chooses a provider route: free, premium, fallback, or rejected.
5. Provider adapter translates the request into the provider’s API format.
6. The response is normalized back to the OpenAI schema, including streaming chunks.
7. Usage, latency, provider cost, route, and errors are recorded for billing and debugging.

Never send a premium request if the customer’s policy or budget disallows it. If a provider fails, retry only safe, idempotent operations and respect provider rate limits.

## 4. Routing policy

Use deterministic policy first, then an optional lightweight classifier. Useful signals include:

- Explicit client hint: `x-omniroute-tier: free|premium|auto`.
- Task category: code generation/debugging, architecture, math, long-context analysis, structured extraction, or ordinary chat.
- Prompt and completion token estimates.
- Required context window, tools, JSON/schema strictness, and latency target.
- Customer plan, remaining credits, provider health, and regional/privacy restrictions.

Suggested default rules:

- Free: greetings, simple Q&A, rewriting, translation, short summaries, and requests below a configured complexity threshold.
- Premium: repository/code requests, debugging, multi-step reasoning, large context, tool calls, strict structured output, and explicit premium hints.
- Ask/confirm: when the classifier is uncertain and premium cost is meaningful; otherwise use free to protect the budget.

Expose the decision in response metadata (`route`, `provider`, `model`, `estimated_cost`) only when the customer’s privacy policy allows it. Do not expose provider secrets or internal classifier prompts.

## 5. API surface

### Initial endpoints

- `POST /v1/chat/completions` — OpenAI-compatible chat and streaming.
- `GET /v1/models` — return the single public model, `omniroute-auto`.
- `GET /v1/usage` — current-period requests, tokens, route counts, and spend.
- `POST /v1/keys` and `DELETE /v1/keys/{id}` — dashboard/admin operations; do not expose secret values again after creation.
- `GET /health` and `GET /ready` — liveness and dependency readiness.

Example:

```bash
curl https://api.example.com/v1/chat/completions \
  -H "Authorization: Bearer $OMNIROUTE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"omniroute-auto","messages":[{"role":"user","content":"Fix this Python bug..."}],"stream":true}'
```

Support standard fields (`messages`, `temperature`, `max_tokens`/`max_completion_tokens`, `stream`, `response_format`, tools where supported) and return clear errors when a provider cannot satisfy a field.

## 6. System architecture

- **Dashboard/control plane:** sign-up, API keys, plan selection, routing policy, budgets, usage charts, provider status.
- **API gateway/data plane:** authentication, validation, rate limiting, request IDs, streaming proxy, response normalization.
- **Policy service:** deterministic rules, classifier, customer overrides, budget checks.
- **Provider adapters:** one module per provider; common interface for chat, streaming, cancellation, retries, and usage extraction.
- **Metering/billing:** append-only usage events, aggregation, invoices/credits, alerts.
- **Storage:** relational database for users/keys/configuration; Redis or equivalent for rate limits and short-lived state; encrypted secret store for provider keys.
- **Observability:** structured logs, traces, route-level latency, error rates, token/cost metrics, and abuse detection.

Keep provider adapters and policy logic separate so adding a new model does not change the public API.

## 7. Security, privacy, and abuse prevention

- Hash customer API keys; show the secret only once and support rotation/revocation.
- Encrypt provider credentials with a managed KMS/secret manager; never log prompts, keys, or full responses by default.
- Offer configurable retention (default short retention), redaction, and an opt-out from content logging.
- Enforce request size, token, timeout, concurrency, and spend limits.
- Add moderation/abuse controls, IP and key-level rate limits, anomaly detection, and an emergency kill switch for a provider.
- Document that data is sent to selected upstream providers and link to their terms, retention, and training policies.
- Obtain permission and comply with each provider’s API terms; do not present third-party models as owned by OmniRoute.

## 8. Cost and reliability model

Track estimated provider cost before dispatch and actual usage after completion. Give every request a maximum premium budget. Use provider health scores and circuit breakers; route to a healthy fallback only when its capabilities and customer policy allow it. Streaming should support cancellation so abandoned generations do not continue consuming credits.

Key service-level targets for an initial production release: authenticated request overhead under 100 ms, clear timeout behavior, no duplicate billing on retries, and complete usage records for at least 99.9% of successful requests.

## 9. Delivery phases

### Phase 0 — Validate (1–2 weeks)

Define provider contracts, pricing, legal/terms review, quota math, and a small labeled set of real prompts. Measure free-versus-premium classification accuracy and expected margin.

### Phase 1 — MVP (2–4 weeks)

Ship authentication, one endpoint, one free adapter, one premium adapter, `omniroute-auto`, basic rules, streaming, quotas, usage events, and a minimal dashboard.

### Phase 2 — Production hardening (2–4 weeks)

Add retries/circuit breakers, Redis rate limiting, encrypted secrets, spend alerts, audit logs, provider health checks, privacy settings, and automated integration tests with mocked providers.

### Phase 3 — Commercial launch

Launch Free/Auto/Pro plans, Stripe or equivalent billing, team workspaces, BYOK, support docs, status page, and transparent route/cost reporting.

### Phase 4 — Advanced routing

Add learned classification with offline evaluation, custom policies, region-aware routing, batch jobs, tool/agent support, embeddings, and enterprise deployment options.

## 10. Success metrics

- Free-route percentage and premium-route percentage by plan.
- Routing accuracy, override rate, and user-reported quality.
- Gross margin per request and premium budget overrun rate.
- P50/P95 latency, provider error rate, timeout rate, and successful streaming completion rate.
- Activation (first successful call), weekly active keys, retention, and conversion from Free to paid.
- Abuse incidents, revoked keys, and privacy/retention requests.

## 11. Decisions to make before implementation

1. Which providers and regions are allowed in the first launch?
2. Is premium automatically enabled for paid plans, or must customers opt in?
3. What is the default data-retention and upstream-training policy?
4. Will billing be token-based, request-based, prepaid credits, or a hybrid?
5. What happens when premium budget is exhausted: free fallback, rejection, or user confirmation?
6. Which OpenAI-compatible fields are guaranteed in v1, and which return `400 unsupported`?

The safest initial product is a transparent, budget-limited router with one stable endpoint, two provider adapters, deterministic rules, and strong usage accounting. The classifier and larger provider catalog can improve over time without breaking client integrations.
