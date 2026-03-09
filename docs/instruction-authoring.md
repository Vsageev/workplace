# Instruction Authoring

This project keeps agent instructions modular on purpose. Add references, not bulk.

## Rules

1. `AGENTS.md` is an index only. Keep it under 30 lines and limit it to routing plus doc pointers.
2. Each agent file in `.claude/agents/` defines only scope, hard prohibitions, and links to its auth/workflow docs.
3. Put reusable guidance in `docs/`, grouped by concern:
   - `docs/agents/<agent>/` for agent-specific auth or workflows
   - `docs/flows/` for task-specific sequences
   - domain docs for stable engineering rules
4. One document should cover one concern. If a file mixes setup, policy, examples, and workflow, split it.
5. Do not duplicate the same rule in multiple places. Keep one canonical source and link to it.
6. Never store live secrets, sample API keys, or environment-specific credentials in docs.

## Split triggers

Split a document when any of these happens:

- it exceeds roughly 120 lines
- it contains more than one top-level concern
- part of it is useful outside the current file's scope
- examples begin to dominate the actual rules

## Change checklist

Before merging instruction changes:

- remove duplicated guidance instead of editing every copy
- verify each relative link resolves from the file that uses it
- confirm the root index stays concise
- move volatile workflow details out of stable overview docs
