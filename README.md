# Esports Forum v1

A write-enabled, role-aware Valorant forum prototype inspired by VLR.gg.

## Run

```bash
node server.js
```

Then open `http://localhost:3000`.

## Built-in demo users

- `admin` / `adminpass`
- `modwatch` / `modpass`
- `tacticalace` / `analystpass`
- `aimdiff` / `pass123`

## Phase 3 capabilities

- JWT-style login/register/logout/me endpoints.
- Roles: user, verified analyst, moderator, admin.
- Context-bound thread creation, edits, soft-deletes, and lock/pin controls.
- Nested comments with max depth and default collapse behavior.
- Vote system with one-vote-per-user and toggle logic.
- Feed ranking (hot/new/top) using score-age formula.
- Moderation/user action endpoints (ban/shadowban) and admin match overrides.
- Basic anti-spam safeguards: rate limit, account-age gate, word filters, auto-lock.
- In-memory persistence with clean API shape for future DB adapters.


## New in this phase

- Official match threads auto-create, auto-pin during LIVE (+6h), and auto-lock 24h post-match.
- Timeline-anchored comments (`map`, `half`, `round_start`, `round_end`).
- Reputation score + tiers (`New`, `Regular`, `Trusted`, `Analyst`, `Veteran`) and weighted ranking.
- `match_summary` thread type (analyst/high-rep/mod only).
- Smart search endpoint (`/search`) with query/map/agent/patch filters.
- User preference endpoint (`PUT /me/preferences`) for feed reorder/muting.
- Moderation enhancements: private mod log, weighted reports, auto-hidden negative comments, thread cooldowns.
- Basic observability endpoint (`/system/metrics`) and DB adapter flag (`DB_ADAPTER`, defaults to `memory`).
