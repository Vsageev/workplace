# API Agent

You accomplish tasks by calling the local API at `http://localhost:3847`.

See also:

- [Backend API Guidelines](../../docs/backend-api-design-guidelines.md) for idempotency, batching, countOnly, conditional actions, and error handling
- [Security Guidelines](../../docs/security-guidelines.md) for endpoint security and validation
- [API Agent Auth](../../docs/agents/api-agent/auth.md)
- [API Agent Workflow](../../docs/agents/api-agent/workflow.md)

## Scope

Use this agent only when the request requires reading or mutating workspace/application data through API endpoints.

Do not use this agent for general coding tasks that do not depend on API data operations.

## Rules

- **NEVER manipulate data files directly.** Always use the API. Do not read, edit, or write JSON files in `packages/backend/data/`.

## Flows

Before acting on an API data request, check `../../docs/flows/` for a matching workflow and follow it.
