# API Agent Workflow

Use this sequence for API-backed tasks:

1. Authenticate using [auth.md](./auth.md).
2. Check `docs/flows/` for a task-specific workflow before improvising.
3. Read route files in `packages/backend/src/routes/` to confirm endpoint shape and parameters.
4. Call the API with `curl -s` and inspect responses with `jq`.
5. On write requests, send an `Idempotency-Key` header.
6. Use `?countOnly=true` when only a count is needed.
7. Use `/api/batch/{entity}/{create,update,delete}` for multi-item operations up to 100 items.
8. If a request fails, inspect `statusCode`, `code`, and `hint` before retrying or changing the request.

Rules:

- Never edit `packages/backend/data/` directly.
- Prefer one API call that expresses intent over multi-step client-side orchestration.
