import { store } from '../db/index.js';
import { listCards } from './cards.js';
import { getAgent } from './agents.js';
import { enqueueAgentBatchRun, type AgentBatchRunStatus } from './agent-batch-queue.js';

export interface CollectionBatchCardFilters {
  search?: string;
  assigneeId?: string;

  tagId?: string;
}

export interface CollectionBatchOptions {
  collectionId: string;
  agentId: string;
  prompt: string;
  maxParallel?: number;
  cardFilters?: CollectionBatchCardFilters;
}

export interface CollectionBatchResult {
  runId: string | null;
  status: AgentBatchRunStatus | null;
  total: number;
  queued: number;
  message: string;
}

/**
 * Run an agent on all matching cards in a collection with concurrency control.
 * Returns immediately after setting up the queue — runs happen in the background.
 */
export async function runCollectionAgentBatch(
  options: CollectionBatchOptions,
): Promise<CollectionBatchResult> {
  const { collectionId, agentId, prompt, maxParallel = 3, cardFilters = {} } = options;

  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }

  // Fetch all matching cards without pagination limit
  const { entries: cards } = await listCards({
    collectionId,
    ...cardFilters,
    limit: 10000,
    offset: 0,
  });

  if (cards.length === 0) {
    return {
      runId: null,
      status: null,
      total: 0,
      queued: 0,
      message: 'No cards matched the filters',
    };
  }

  const collection = store.getById('collections', collectionId) as any;
  const result = enqueueAgentBatchRun({
    sourceType: 'collection',
    sourceId: collectionId,
    sourceName: collection?.name ?? null,
    agentId,
    prompt,
    maxParallel,
    cards: cards.map((card: any) => ({
      id: card.id as string,
      name: card.name as string,
      description:
        typeof card.description === 'string'
          ? card.description
          : null,
      collectionId,
    })),
  });

  return result;
}
