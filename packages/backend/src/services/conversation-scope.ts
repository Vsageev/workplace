import { store } from '../db/index.js';

/**
 * Agent chat is isolated from generic inbox APIs.
 * A conversation is treated as agent-scoped when channelType is 'agent'.
 */
export function isAgentConversationRecord(conversation: Record<string, unknown>): boolean {
  return conversation.channelType === 'agent';
}

export function getInboxConversationById(id: string): Record<string, unknown> | null {
  const conversation = store.getById('conversations', id);
  if (!conversation || isAgentConversationRecord(conversation)) return null;
  return conversation;
}

export function isInboxConversationId(id: string): boolean {
  return getInboxConversationById(id) !== null;
}
