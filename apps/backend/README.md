# Backend (placeholder — Phase 3 / 7)

FastAPI service, **optional**. The app works fully without it.

Planned responsibilities:
- `POST /interpret`: natural language → LLM (provider abstraction) → JSON intent. The phone re-validates every reply with `@tvc/command-schemas` before acting.
- Later: accounts, cloud sync, and home-gateway relay over secure WebSocket.

The LLM API key lives here and never on the phone. Nothing here has been implemented yet.
