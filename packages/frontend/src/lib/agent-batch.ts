import { api } from './api';

export type AgentBatchRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentBatchBlockingMode = 'all_success' | 'all_settled';
export interface AgentBatchStageInput {
  id?: string;
  cardIds: string[];
  dependsOnStageIds?: string[];
  dependsOnStageIndexes?: number[];
  blockingMode?: AgentBatchBlockingMode;
}

export interface BatchPlanCardLike {
  id: string;
  name: string;
}

export interface BatchLayer {
  cards: BatchPlanCardLike[];
}

export interface AgentBatchRunLike {
  id: string;
  status: AgentBatchRunStatus;
}

export interface AgentBatchRunWithAgent extends AgentBatchRunLike {
  agentId: string;
}

interface AgentBatchItemsResponse {
  entries: { cardId: string; status: string }[];
}

function appendQuery(path: string, query: string): string {
  const prefix = path.includes('?') ? '&' : '?';
  return `${path}${prefix}${query}`;
}

export async function fetchActiveBatchRuns<T extends AgentBatchRunLike>(
  listEndpoint: string,
  limit = 200,
): Promise<T[]> {
  const res = await api<{ entries: T[] }>(
    appendQuery(listEndpoint, `status=active&limit=${limit}`),
  );
  return Array.isArray(res.entries) ? res.entries : [];
}

export async function fetchProcessingCardIdsFromActiveRuns(
  listEndpoint: string,
  getItemsEndpoint: (runId: string) => string,
  limit = 200,
): Promise<Set<string>> {
  const activeRuns = await fetchActiveBatchRuns<AgentBatchRunLike>(listEndpoint, limit);
  if (activeRuns.length === 0) return new Set<string>();

  const processing = new Set<string>();
  await Promise.all(
    activeRuns.map(async (run) => {
      try {
        const items = await api<AgentBatchItemsResponse>(
          appendQuery(getItemsEndpoint(run.id), `limit=${limit}`),
        );
        for (const item of items.entries) {
          if (item.status === 'processing') {
            processing.add(item.cardId);
          }
        }
      } catch {
        // Keep polling resilient when one run fetch fails.
      }
    }),
  );
  return processing;
}

/** Returns a map of cardId → agentId for cards currently being processed. */
export async function fetchProcessingCardAgents(
  listEndpoint: string,
  getItemsEndpoint: (runId: string) => string,
  limit = 200,
): Promise<Map<string, string>> {
  const activeRuns = await fetchActiveBatchRuns<AgentBatchRunWithAgent>(listEndpoint, limit);
  if (activeRuns.length === 0) return new Map();

  const cardToAgent = new Map<string, string>();
  await Promise.all(
    activeRuns.map(async (run) => {
      try {
        const items = await api<AgentBatchItemsResponse>(
          appendQuery(getItemsEndpoint(run.id), `limit=${limit}`),
        );
        for (const item of items.entries) {
          if (item.status === 'processing') {
            cardToAgent.set(item.cardId, run.agentId);
          }
        }
      } catch {
        // Keep polling resilient when one run fetch fails.
      }
    }),
  );
  return cardToAgent;
}

export function buildStagesFromLayers(layers: BatchLayer[]): AgentBatchStageInput[] {
  const nonEmpty = layers.filter((l) => l.cards.length > 0);
  if (nonEmpty.length <= 1) return [];

  return nonEmpty.map((layer, idx) => ({
    id: `layer-${idx + 1}`,
    cardIds: layer.cards.map((c) => c.id),
    dependsOnStageIndexes: idx === 0 ? undefined : [idx - 1],
  }));
}
