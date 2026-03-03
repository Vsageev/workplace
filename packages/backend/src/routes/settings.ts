import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import { requirePermission } from '../middleware/rbac.js';
import { store } from '../db/index.js';
import { env } from '../config/env.js';
import { promptRateLimiter } from './agent-chat.js';

const SETTINGS_COLLECTION = 'settings';
const RATE_LIMIT_SETTINGS_ID = 'rate-limits';

interface RateLimitSettings {
  id: string;
  agentPromptMax: number;
  agentPromptWindowS: number;
  createdAt: string;
  updatedAt: string;
}

function getRateLimitSettings(): RateLimitSettings {
  const existing = store.getById(SETTINGS_COLLECTION, RATE_LIMIT_SETTINGS_ID) as RateLimitSettings | null;
  if (existing) return existing;
  return {
    id: RATE_LIMIT_SETTINGS_ID,
    agentPromptMax: env.RATE_LIMIT_AGENT_PROMPT_MAX,
    agentPromptWindowS: env.RATE_LIMIT_AGENT_PROMPT_WINDOW_S,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function initRateLimiterFromSettings(): void {
  const settings = getRateLimitSettings();
  promptRateLimiter.reconfigure(settings.agentPromptMax, settings.agentPromptWindowS * 1000);
}

export async function settingsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /api/settings/rate-limits
  typedApp.get(
    '/api/settings/rate-limits',
    { onRequest: [app.authenticate, requirePermission('settings:read')] },
    async () => {
      const settings = getRateLimitSettings();
      return {
        agentPromptMax: settings.agentPromptMax,
        agentPromptWindowS: settings.agentPromptWindowS,
      };
    },
  );

  // PATCH /api/settings/rate-limits
  typedApp.patch(
    '/api/settings/rate-limits',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        body: z.object({
          agentPromptMax: z.number().int().min(1).max(1000).optional(),
          agentPromptWindowS: z.number().int().min(5).max(3600).optional(),
        }),
      },
    },
    async (request) => {
      const { agentPromptMax, agentPromptWindowS } = request.body;
      const existing = store.getById(SETTINGS_COLLECTION, RATE_LIMIT_SETTINGS_ID);

      const current = getRateLimitSettings();
      const updated = {
        ...current,
        agentPromptMax: agentPromptMax ?? current.agentPromptMax,
        agentPromptWindowS: agentPromptWindowS ?? current.agentPromptWindowS,
      };

      if (existing) {
        store.update(SETTINGS_COLLECTION, RATE_LIMIT_SETTINGS_ID, updated as unknown as Record<string, unknown>);
      } else {
        store.insert(SETTINGS_COLLECTION, updated as unknown as Record<string, unknown>);
      }

      // Apply to running rate limiter
      promptRateLimiter.reconfigure(updated.agentPromptMax, updated.agentPromptWindowS * 1000);

      return {
        agentPromptMax: updated.agentPromptMax,
        agentPromptWindowS: updated.agentPromptWindowS,
      };
    },
  );
}
