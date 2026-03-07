FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile

# Build everything
FROM deps AS build
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY packages/frontend/ packages/frontend/
COPY tsconfig.json ./
RUN pnpm --filter shared build && pnpm --filter frontend build && pnpm --filter backend build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

# Copy the entire workspace (node_modules + built output)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist

ENV STATIC_DIR=/app/packages/frontend/dist

EXPOSE 3847
CMD ["node", "packages/backend/dist/index.js"]
