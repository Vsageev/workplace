import { store } from '../db/index.js';
import { getAgent } from './agents.js';
import { enqueueAgentBatchRun, type AgentBatchRunStatus } from './agent-batch-queue.js';

export interface BoardBatchOptions {
  boardId: string;
  agentId: string;
  prompt: string;
  columnIds?: string[];
  textFilter?: string;
  maxParallel?: number;
}

export interface BoardBatchResult {
  runId: string | null;
  status: AgentBatchRunStatus | null;
  total: number;
  queued: number;
  message: string;
}

/**
 * Count how many cards would be included in a batch run with the given filters.
 */
export function countBoardBatchCards(
  boardId: string,
  columnIds?: string[],
  textFilter?: string,
): number {
  let boardCards = store.find('boardCards', (r: any) => r.boardId === boardId) as any[];

  if (columnIds && columnIds.length > 0) {
    const columnSet = new Set(columnIds);
    boardCards = boardCards.filter((bc: any) => columnSet.has(bc.columnId));
  }

  let cards = boardCards
    .map((bc: any) => store.getById('cards', bc.cardId) as any)
    .filter(Boolean);

  if (textFilter && textFilter.trim()) {
    const lower = textFilter.trim().toLowerCase();
    cards = cards.filter((card: any) =>
      (card.name as string).toLowerCase().includes(lower),
    );
  }

  return cards.length;
}

/**
 * Run an agent on all cards in a board with concurrency control.
 * Optionally scoped to specific columns.
 * Returns immediately after setting up the queue — runs happen in the background.
 */
export async function runBoardAgentBatch(options: BoardBatchOptions): Promise<BoardBatchResult> {
  const { boardId, agentId, prompt, columnIds, textFilter, maxParallel = 3 } = options;

  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }

  // Get all board cards, optionally filtered by column
  let boardCards = store.find('boardCards', (r: any) => r.boardId === boardId) as any[];

  if (columnIds && columnIds.length > 0) {
    const columnSet = new Set(columnIds);
    boardCards = boardCards.filter((bc: any) => columnSet.has(bc.columnId));
  }

  // Load card data for each board card
  let cards = boardCards
    .map((bc: any) => store.getById('cards', bc.cardId) as any)
    .filter(Boolean);

  // Filter by card name text
  if (textFilter && textFilter.trim()) {
    const lower = textFilter.trim().toLowerCase();
    cards = cards.filter((card: any) =>
      (card.name as string).toLowerCase().includes(lower),
    );
  }

  if (cards.length === 0) {
    return {
      runId: null,
      status: null,
      total: 0,
      queued: 0,
      message: 'No cards found on the board',
    };
  }

  const board = store.getById('boards', boardId) as any;
  const result = enqueueAgentBatchRun({
    sourceType: 'board',
    sourceId: boardId,
    sourceName: board?.name ?? null,
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
      collectionId: card.collectionId as string,
    })),
  });

  return result;
}
