import { api } from './api';

export type AgentBatchRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentBatchBlockingMode = 'all_success' | 'all_settled';
export type BatchPlanMode = 'ordered' | 'layers';

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

export type BatchLayerAssignments = Record<string, number>;

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

export function normalizeBatchLayerAssignments<T extends BatchPlanCardLike>(
  cards: T[],
  assignments: BatchLayerAssignments,
  layerCount: number,
): BatchLayerAssignments {
  const next: BatchLayerAssignments = {};
  const maxLayerIndex = Math.max(0, layerCount - 1);

  for (const card of cards) {
    const rawValue = assignments[card.id];
    const normalizedValue = Number.isInteger(rawValue)
      ? Math.min(Math.max(rawValue, 0), maxLayerIndex)
      : 0;
    next[card.id] = normalizedValue;
  }

  return next;
}

export function buildStagesFromLayerAssignments<T extends BatchPlanCardLike>(
  cards: T[],
  assignments: BatchLayerAssignments,
  layerCount: number,
): AgentBatchStageInput[] {
  if (cards.length === 0 || layerCount <= 1) return [];

  const normalizedAssignments = normalizeBatchLayerAssignments(cards, assignments, layerCount);
  const cardsByLayer = new Map<number, string[]>();

  for (const card of cards) {
    const layerIndex = normalizedAssignments[card.id] ?? 0;
    const existing = cardsByLayer.get(layerIndex) ?? [];
    existing.push(card.id);
    cardsByLayer.set(layerIndex, existing);
  }

  const usedLayers = Array.from(cardsByLayer.entries())
    .filter(([, cardIds]) => cardIds.length > 0)
    .sort((a, b) => a[0] - b[0]);

  return usedLayers.map(([originalLayerIndex, cardIds], stageIndex) => ({
    id: `layer-${originalLayerIndex + 1}`,
    cardIds,
    dependsOnStageIndexes: stageIndex === 0 ? undefined : [stageIndex - 1],
  }));
}
