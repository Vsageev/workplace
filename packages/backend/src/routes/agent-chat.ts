import crypto from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import { requirePermission } from '../middleware/rbac.js';
import { store } from '../db/index.js';
import { getAgent } from '../services/agents.js';
import { uploadFile } from '../services/storage.js';
import { validateUploadedFile } from '../utils/file-validation.js';
import { createAgentRateLimiter } from '../lib/api-helpers.js';
import {
  listAgentConversations,
  createAgentConversation,
  validateConversationOwnership,
  deleteAgentConversation,
  renameAgentConversation,
  markAgentConversationRead,
  saveAgentConversationMessage,
  enqueueAgentPrompt,
  getAgentQueuedPromptCount,
  executeRespondToLastMessage,
  isAgentBusy,
  getConversationQueueItems,
  updateQueueItem,
  deleteQueueItem,
  clearAgentConversationQueue,
  reorderQueueItems,
} from '../services/agent-chat.js';

// Rate limiter for agent prompt execution — shared across all requests in this process
export const promptRateLimiter = createAgentRateLimiter();

export async function agentChatRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // List conversations for an agent
  typedApp.get(
    '/api/agents/:id/chat/conversations',
    {
      onRequest: [app.authenticate, requirePermission('settings:read')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'List chat conversations for an agent',
        params: z.object({ id: z.string() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const { limit, offset } = request.query;
      const result = listAgentConversations(request.params.id, limit, offset);
      return reply.send(result);
    },
  );

  // Create a new conversation for an agent
  typedApp.post(
    '/api/agents/:id/chat/conversations',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Create a new chat conversation for an agent',
        params: z.object({ id: z.string() }),
        body: z.object({
          subject: z.string().max(200).optional(),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = createAgentConversation(request.params.id, request.body.subject);
      return reply.status(201).send(conv);
    },
  );

  // Rename a conversation
  typedApp.patch(
    '/api/agents/:id/chat/conversations/:conversationId',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Rename an agent chat conversation',
        params: z.object({ id: z.string(), conversationId: z.string() }),
        body: z.object({
          subject: z.string().min(1).max(200),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.params.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const updated = renameAgentConversation(request.params.conversationId, request.body.subject);
      return reply.send(updated);
    },
  );

  // Mark a conversation as read
  typedApp.patch(
    '/api/agents/:id/chat/conversations/:conversationId/read',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Mark an agent chat conversation as read',
        params: z.object({ id: z.string(), conversationId: z.string() }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.params.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const updated = markAgentConversationRead(request.params.conversationId);
      return reply.send(updated);
    },
  );

  // Delete a conversation
  typedApp.delete(
    '/api/agents/:id/chat/conversations/:conversationId',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Delete an agent chat conversation and its messages',
        params: z.object({ id: z.string(), conversationId: z.string() }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.params.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      deleteAgentConversation(request.params.conversationId);
      return reply.status(204).send();
    },
  );

  // List chat messages for a specific conversation
  typedApp.get(
    '/api/agents/:id/chat/messages',
    {
      onRequest: [app.authenticate, requirePermission('settings:read')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'List chat messages for an agent conversation',
        params: z.object({ id: z.string() }),
        querystring: z.object({
          conversationId: z.string(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.query.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const all = store
        .find(
          'messages',
          (r: Record<string, unknown>) => r.conversationId === request.query.conversationId,
        )
        .sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            new Date(a.createdAt as string).getTime() -
            new Date(b.createdAt as string).getTime(),
        );

      const { limit, offset } = request.query;
      const entries = all.slice(offset, offset + limit);
      return reply.send({ total: all.length, limit, offset, entries });
    },
  );

  // Append a message to an agent chat conversation (for agent progress/final updates)
  typedApp.post(
    '/api/agents/:id/chat/messages',
    {
      onRequest: [app.authenticate, requirePermission('messages:send')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Append a message to an agent chat conversation',
        params: z.object({ id: z.string() }),
        body: z.object({
          conversationId: z.string(),
          content: z.string().min(1).max(50000),
          isFinal: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.body.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const message = saveAgentConversationMessage({
        conversationId: request.body.conversationId,
        direction: 'inbound',
        content: request.body.content,
        type: request.body.isFinal ? 'text' : 'system',
        metadata: {
          agentChatUpdate: true,
          isFinal: Boolean(request.body.isFinal),
        },
      });

      return reply.status(201).send(message);
    },
  );

  // Queue a prompt for backend processing
  typedApp.post(
    '/api/agents/:id/chat/message',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Queue a prompt for backend processing',
        params: z.object({ id: z.string() }),
        body: z.object({
          prompt: z.string().min(1).max(50000),
          conversationId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      // Rate limit per user per agent to prevent prompt spam
      const userId = (request.user as { sub: string }).sub;
      const rateLimitKey = `${userId}:${request.params.id}`;
      if (!promptRateLimiter.isAllowed(rateLimitKey)) {
        return reply.tooManyRequests('Too many prompt requests. Please wait before sending another message.');
      }

      const conv = validateConversationOwnership(request.body.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      try {
        const wasQueuedOrBusy =
          isAgentBusy(request.params.id, request.body.conversationId) ||
          getAgentQueuedPromptCount(request.params.id, request.body.conversationId) > 0;
        const queued = enqueueAgentPrompt(
          request.params.id,
          request.body.conversationId,
          request.body.prompt,
        );
        const statusCode = wasQueuedOrBusy ? 202 : 201;
        return reply.status(statusCode).send({
          status: 'queued',
          queueItem: queued.queueItem,
          queuedCount: queued.queuedCount,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to queue prompt';
        const statusCode = 500;
        return reply.status(statusCode).send({
          statusCode,
          error: 'Internal Server Error',
          message,
        });
      }
    },
  );

  // List queued items for a conversation
  typedApp.get(
    '/api/agents/:id/chat/conversations/:cid/queue',
    {
      onRequest: [app.authenticate, requirePermission('settings:read')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'List pending queue items for a conversation',
        params: z.object({ id: z.string(), cid: z.string() }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.params.cid, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const items = getConversationQueueItems(request.params.id, request.params.cid);
      return reply.send({ entries: items });
    },
  );

  // Clear all queued items for a conversation
  typedApp.delete(
    '/api/agents/:id/chat/conversations/:cid/queue',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Clear all pending queue items for a conversation',
        params: z.object({ id: z.string(), cid: z.string() }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.params.cid, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const deleted = clearAgentConversationQueue(request.params.id, request.params.cid);
      return reply.send({ deleted });
    },
  );

  // Update a queued item (edit prompt)
  typedApp.patch(
    '/api/agents/:id/chat/queue/:itemId',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Edit a pending queue item',
        params: z.object({ id: z.string(), itemId: z.string() }),
        body: z.object({
          conversationId: z.string(),
          prompt: z.string().min(1).max(50000).optional(),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.body.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const updated = updateQueueItem(
        request.params.itemId,
        request.params.id,
        request.body.conversationId,
        { prompt: request.body.prompt },
      );
      if (!updated) return reply.notFound('Queue item not found or not editable');
      return reply.send(updated);
    },
  );

  // Delete a queued item
  typedApp.delete(
    '/api/agents/:id/chat/queue/:itemId',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Remove a pending queue item',
        params: z.object({ id: z.string(), itemId: z.string() }),
        body: z.object({
          conversationId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.body.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const deleted = deleteQueueItem(
        request.params.itemId,
        request.params.id,
        request.body.conversationId,
      );
      if (!deleted) return reply.notFound('Queue item not found or not deletable');
      return reply.status(204).send();
    },
  );

  // Reorder queued items
  typedApp.post(
    '/api/agents/:id/chat/conversations/:cid/queue/reorder',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Reorder pending queue items',
        params: z.object({ id: z.string(), cid: z.string() }),
        body: z.object({
          orderedIds: z.array(z.string()),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const conv = validateConversationOwnership(request.params.cid, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const ok = reorderQueueItems(request.params.id, request.params.cid, request.body.orderedIds);
      if (!ok) return reply.badRequest('Invalid queue item IDs');
      return reply.send({ ok: true });
    },
  );

  // Trigger agent to respond to the latest message (e.g. after image upload) and wait for completion
  typedApp.post(
    '/api/agents/:id/chat/respond',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Trigger agent to respond to the latest conversation message (e.g. after image upload)',
        params: z.object({ id: z.string() }),
        body: z.object({
          conversationId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      // Rate limit per user per agent
      const userId = (request.user as { sub: string }).sub;
      const rateLimitKey = `${userId}:${request.params.id}`;
      if (!promptRateLimiter.isAllowed(rateLimitKey)) {
        return reply.tooManyRequests('Too many prompt requests. Please wait before sending another message.');
      }

      if (isAgentBusy(request.params.id, request.body.conversationId)) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Agent is already processing a prompt',
        });
      }

      const conv = validateConversationOwnership(request.body.conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      try {
        const message = await executeRespondToLastMessage(
          request.params.id,
          request.body.conversationId,
        );
        return reply.status(201).send(message);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to execute prompt';
        const statusCode = message === 'Agent is already processing a prompt' ? 409 : 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 409 ? 'Conflict' : 'Internal Server Error',
          message,
        });
      }
    },
  );

  // Upload an image to agent chat
  typedApp.post(
    '/api/agents/:id/chat/upload',
    {
      onRequest: [app.authenticate, requirePermission('settings:update')],
      schema: {
        tags: ['Agent Chat'],
        summary: 'Upload an image to agent chat and create a message with the attachment',
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const agent = getAgent(request.params.id);
      if (!agent) return reply.notFound('Agent not found');

      const data = await request.file();
      if (!data) return reply.badRequest('No file uploaded');

      const conversationId = (data.fields.conversationId as { value: string } | undefined)?.value;
      if (!conversationId) return reply.badRequest('conversationId is required');

      const conv = validateConversationOwnership(conversationId, request.params.id);
      if (!conv) return reply.notFound('Conversation not found');

      const mimeType = data.mimetype || 'application/octet-stream';
      const filename = data.filename || 'image.jpg';

      const fileCheck = validateUploadedFile(mimeType, filename);
      if (!fileCheck.valid) return reply.badRequest(fileCheck.error!);

      if (!mimeType.startsWith('image/')) {
        return reply.badRequest('Only image files are supported');
      }

      // Read file into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Save to storage under /chat-uploads/ with a unique name
      const ext = path.extname(filename) || '.jpg';
      const uniqueName = `${crypto.randomUUID()}${ext}`;
      const storagePath = '/chat-uploads';

      const entry = await uploadFile(storagePath, uniqueName, mimeType, buffer);

      // Build attachment metadata
      const attachment = {
        type: 'image',
        fileName: filename,
        mimeType,
        fileSize: buffer.length,
        storagePath: entry.path,
      };

      const caption = (data.fields.caption as { value: string } | undefined)?.value || null;

      const message = saveAgentConversationMessage({
        conversationId,
        direction: 'outbound',
        content: caption || '',
        type: 'image',
        attachments: [attachment],
      });

      return reply.status(201).send(message);
    },
  );
}
