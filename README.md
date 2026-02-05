# Esports Forum v1

A dark-mode, match-centric Valorant forum prototype inspired by VLR.gg.

## Run

```bash
node server.js
```

Then open `http://localhost:3000`.

## Design goals implemented

- Strict dark mode with dense, flat UI and sharp separators.
- Sticky **Match Pulse Bar** with LIVE/COMPLETED/UPCOMING statuses.
- Two-column homepage: editorial feed + recent discussions.
- Context-rich threads and dedicated match hubs.
- Reload-driven freshness (no WebSockets / no background sync).
- Simple moderation controls exposed through API endpoints.
