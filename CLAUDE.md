# Instructions

This file is an index. Keep it under 30 lines. Do NOT add inline instructions here — place them in the appropriate location below.

## Agents → `.claude/agents/`

Each agent has its own file with scope, auth, and workflow. Route by task type:

- `API` → `.claude/agents/api-agent.md` for workspace data manipulation via backend API
- `Test` → `.claude/agents/test-agent.md` for manual browser testing with Playwright

For general software tasks (refactors, tests, docs, build tooling, UI changes, local file edits) — do not invoke any agent.

## Domain docs → `docs/`

- `docs/DEVELOPMENT.md` → dev setup, commands, code style, shared utils
- `docs/design-system.md` → colors, typography, components, animation rules
- `docs/backend-api-design-guidelines.md` → idempotency, batching, countOnly, errors
- `docs/security-guidelines.md` → key hashing, endpoint security, validation, rate limiting
- `docs/flows/*.md` → step-by-step workflows
- `docs/instruction-authoring.md` → how to keep agent instructions modular

Read the relevant doc when working in that area. Do not duplicate their content here.

## General rules

- **Never revert files via git** unless promped explicitly to do that using git
- **Ask for clarification** before acting if a request is ambiguous or could be interpreted in more than one way.
- **Verify before reporting.** After completing a task, confirm the result is correct and the assignment was fully implemented before reporting success
