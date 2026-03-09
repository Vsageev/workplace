# API Agent Auth

1. Check for `.claude-api-key` in the project root before making API calls.
2. If the file exists and contains a key, send `Authorization: Bearer <key>` on every request.
3. If the file is missing or empty, ask the user for a workspace API key.
4. Tell the user how to create one: `Settings -> API Keys -> New API Key`, then copy the `ws_...` value shown once.
5. Save a newly provided key to `.claude-api-key` in the project root for reuse.

Rules:

- Never hardcode API keys in docs, prompts, scripts, or committed files.
- Request the narrowest permissions that fit the task.
- Treat `.claude-api-key` as local state, not project documentation.
