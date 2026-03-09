# Development Guide

This document covers local development commands, shared utilities, testing commands, and baseline code style. Keep API contract guidance in [backend-api-design-guidelines.md](./backend-api-design-guidelines.md), security rules in [security-guidelines.md](./security-guidelines.md), and instruction-maintenance rules in [instruction-authoring.md](./instruction-authoring.md).

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run type checking
pnpm typecheck

# Run linter
pnpm lint
```

## Shared Utilities

Import utilities from the `shared` package instead of reimplementing:

```typescript
import { formatBytes, formatDate, createListResponse } from 'shared';

// Format file sizes consistently
const size = formatBytes(1536000); // "1.5 MB"

// Format dates consistently
const date = formatDate(new Date().toISOString());

// Create consistent API responses
const response = createListResponse(items, total, limit, offset);
```

## Testing

```bash
# Run all tests
pnpm test

# Run backend tests only
pnpm --filter backend test

# Run frontend tests only
pnpm --filter frontend test
```

## Code Style

- Use TypeScript for all new code
- Follow existing naming conventions (camelCase for variables, PascalCase for types)
- Keep functions small and focused
- Add comments only for complex logic (focus on why, not what)
- Prefer extending existing shared utilities before adding new local helpers
- When adding backend endpoints or mutating flows, read the dedicated API and security docs instead of copying rules into feature docs

## Common Tasks

### Adding a New Route

1. Create route file in `packages/backend/src/routes/`
2. Define Zod schema for validation
3. Follow [backend-api-design-guidelines.md](./backend-api-design-guidelines.md) for list shapes, batching, and retry-safety
4. Follow [security-guidelines.md](./security-guidelines.md) for validation and sensitive-field handling
5. Add route registration in `app.ts`

### Adding a New Service

1. Create service file in `packages/backend/src/services/`
2. Export functions that can be reused across routes
3. Use dependency injection for testability

### Frontend Component

1. Create component in `packages/frontend/src/components/`
2. Use shared utilities for formatting
3. Follow existing component patterns

## Troubleshooting

### Build Issues

```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Type Errors

```bash
# Check types without emitting
pnpm typecheck
```

### Lint Errors

```bash
# Auto-fix where possible
pnpm lint:fix
```
