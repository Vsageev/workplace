import test from 'node:test';
import assert from 'node:assert/strict';

import { importFresh, setupTestEnvironment } from '../support/test-env.ts';

function seedSourceApiKey(
  db: Awaited<ReturnType<typeof importFresh<typeof import('../../src/db/index.ts')>>>,
  data: {
    id: string;
    name: string;
    keyPrefix: string;
    permissions: string[];
    isActive?: boolean;
  },
) {
  db.store.insert('apiKeys', {
    id: data.id,
    name: data.name,
    keyHash: `hash-${data.id}`,
    keyPrefix: data.keyPrefix,
    permissions: data.permissions,
    createdById: 'owner-user',
    isActive: data.isActive ?? true,
    description: null,
    expiresAt: null,
    lastUsedAt: null,
  });
}

test('createAgent scopes the generated workspace key to the selected key permissions', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();
    seedSourceApiKey(db, {
      id: 'seed-key',
      name: 'Seed Key',
      keyPrefix: 'ws_seed',
      permissions: ['cards:write', 'storage:write'],
    });

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );

    const agent = await agents.createAgent({
      name: 'Scoped Permissions Agent',
      description: 'Ensures generated workspace keys inherit the selected scope',
      model: 'Codex',
      preset: 'basic',
      apiKeyId: 'seed-key',
      apiKeyName: 'Seed Key',
      apiKeyPrefix: 'ws_seed',
      capabilities: ['cards:write', 'messages:write', 'contacts:read'],
    });

    assert.ok(agent.workspaceApiKeyId);
    const workspaceKey = db.store.getById('apiKeys', agent.workspaceApiKeyId);

    assert.ok(workspaceKey);
    assert.deepEqual(workspaceKey.permissions, ['cards:write', 'messages:write']);
  } finally {
    env.cleanup();
  }
});

test('createAgent rejects selected keys that grant no agent-usable workspace permissions', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions-empty');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );

    await assert.rejects(
      agents.createAgent({
        name: 'Invalid Scope Agent',
        description: 'Should not mint an over-broad workspace key',
        model: 'Codex',
        preset: 'basic',
        apiKeyId: 'seed-key',
        apiKeyName: 'Seed Key',
        apiKeyPrefix: 'ws_seed',
        capabilities: ['contacts:read'],
      }),
      /does not grant any agent-usable workspace permissions/,
    );
  } finally {
    env.cleanup();
  }
});

test('ensureAgentServiceAccounts repairs generated workspace key permissions when they drift', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions-repair');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );

    const agent = await agents.createAgent({
      name: 'Repair Scope Agent',
      description: 'Repairs mismatched generated workspace key permissions',
      model: 'Codex',
      preset: 'basic',
      apiKeyId: 'seed-key',
      apiKeyName: 'Seed Key',
      apiKeyPrefix: 'ws_seed',
      capabilities: ['cards:write', 'storage:write'],
    });

    assert.ok(agent.workspaceApiKeyId);
    db.store.update('apiKeys', agent.workspaceApiKeyId, {
      permissions: ['cards:write', 'messages:write'],
    });

    await agents.ensureAgentServiceAccounts();

    const refreshedAgent = agents.getAgent(agent.id);
    assert.ok(refreshedAgent?.workspaceApiKeyId);
    const repairedWorkspaceKey = db.store.getById('apiKeys', refreshedAgent.workspaceApiKeyId);

    assert.ok(repairedWorkspaceKey);
    assert.deepEqual(repairedWorkspaceKey.permissions, ['cards:write', 'storage:write']);
  } finally {
    env.cleanup();
  }
});

test('syncAgentsForApiKey updates existing agent workspace permissions after source key changes', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions-sync');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();
    seedSourceApiKey(db, {
      id: 'source-key',
      name: 'Source Key',
      keyPrefix: 'ws_src1',
      permissions: ['cards:write', 'messages:write'],
    });

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );

    const agent = await agents.createAgent({
      name: 'Sync Scope Agent',
      description: 'Tracks source key permission changes',
      model: 'Codex',
      preset: 'basic',
      apiKeyId: 'source-key',
      apiKeyName: 'Source Key',
      apiKeyPrefix: 'ws_src1',
      capabilities: ['cards:write', 'messages:write'],
    });

    db.store.update('apiKeys', 'source-key', {
      permissions: ['storage:write', 'contacts:read'],
    });

    await agents.syncAgentsForApiKey('source-key');

    const refreshedAgent = agents.getAgent(agent.id);
    assert.ok(refreshedAgent?.workspaceApiKeyId);
    assert.deepEqual(refreshedAgent.capabilities, ['storage:write', 'contacts:read']);

    const workspaceKey = db.store.getById('apiKeys', refreshedAgent.workspaceApiKeyId);
    assert.ok(workspaceKey);
    assert.deepEqual(workspaceKey.permissions, ['storage:write']);
  } finally {
    env.cleanup();
  }
});

test('syncAgentsForApiKey revokes agent workspace access when the source key is deleted', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions-delete');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();
    seedSourceApiKey(db, {
      id: 'source-key',
      name: 'Source Key',
      keyPrefix: 'ws_src2',
      permissions: ['cards:write'],
    });

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );

    const agent = await agents.createAgent({
      name: 'Revoked Scope Agent',
      description: 'Loses workspace access when its source key disappears',
      model: 'Codex',
      preset: 'basic',
      apiKeyId: 'source-key',
      apiKeyName: 'Source Key',
      apiKeyPrefix: 'ws_src2',
      capabilities: ['cards:write'],
    });

    const previousWorkspaceKeyId = agent.workspaceApiKeyId;
    assert.ok(previousWorkspaceKeyId);

    db.store.delete('apiKeys', 'source-key');
    await agents.syncAgentsForApiKey('source-key');

    const refreshedAgent = agents.getAgent(agent.id);
    assert.equal(refreshedAgent?.workspaceApiKeyId, null);
    assert.equal(refreshedAgent?.workspaceApiKey, null);
    assert.deepEqual(refreshedAgent?.capabilities, []);
    assert.equal(db.store.getById('apiKeys', previousWorkspaceKeyId), null);
  } finally {
    env.cleanup();
  }
});

test('prepareAgentWorkspaceAccess rotates stale raw workspace keys before execution', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions-stale-raw-key');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();
    seedSourceApiKey(db, {
      id: 'source-key',
      name: 'Source Key',
      keyPrefix: 'ws_src3',
      permissions: ['cards:write', 'messages:write'],
    });

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );
    const apiKeys = await importFresh<typeof import('../../src/services/api-keys.ts')>(
      '../../src/services/api-keys.ts',
    );

    const agent = await agents.createAgent({
      name: 'Stale Raw Key Agent',
      description: 'Repairs raw workspace keys that no longer validate',
      model: 'Codex',
      preset: 'basic',
      apiKeyId: 'source-key',
      apiKeyName: 'Source Key',
      apiKeyPrefix: 'ws_src3',
      capabilities: ['cards:write', 'messages:write'],
    });

    const previousWorkspaceKeyId = agent.workspaceApiKeyId;
    assert.ok(previousWorkspaceKeyId);

    db.store.update('agents', agent.id, {
      workspaceApiKey: 'ws_invalid_stale_key',
    });

    const repaired = await agents.prepareAgentWorkspaceAccess(agent.id);
    assert.ok(repaired);
    assert.ok(repaired.workspaceApiKeyId);
    assert.notEqual(repaired.workspaceApiKeyId, previousWorkspaceKeyId);
    assert.ok(repaired.workspaceApiKey);

    const validatedKey = await apiKeys.validateApiKey(repaired.workspaceApiKey);
    assert.equal(validatedKey?.id, repaired.workspaceApiKeyId);
  } finally {
    env.cleanup();
  }
});

test('updateAgent switches the generated workspace key to the new selected source key', async () => {
  const env = setupTestEnvironment('agent-workspace-key-permissions-switch');

  try {
    const db = await importFresh<typeof import('../../src/db/index.ts')>('../../src/db/index.ts');
    await db.store.init();
    seedSourceApiKey(db, {
      id: 'source-key-a',
      name: 'Source Key A',
      keyPrefix: 'ws_srca',
      permissions: ['cards:write'],
    });
    seedSourceApiKey(db, {
      id: 'source-key-b',
      name: 'Source Key B',
      keyPrefix: 'ws_srcb',
      permissions: ['messages:write', 'storage:write'],
    });

    const agents = await importFresh<typeof import('../../src/services/agents.ts')>(
      '../../src/services/agents.ts',
    );

    const agent = await agents.createAgent({
      name: 'Switch Scope Agent',
      description: 'Switches runtime workspace access with its source key',
      model: 'Codex',
      preset: 'basic',
      apiKeyId: 'source-key-a',
      apiKeyName: 'Source Key A',
      apiKeyPrefix: 'ws_srca',
      capabilities: ['cards:write'],
    });

    const previousWorkspaceKeyId = agent.workspaceApiKeyId;
    const updated = await agents.updateAgent(agent.id, { apiKeyId: 'source-key-b' });

    assert.ok(updated);
    assert.equal(updated.apiKeyId, 'source-key-b');
    assert.equal(updated.apiKeyName, 'Source Key B');
    assert.equal(updated.apiKeyPrefix, 'ws_srcb');
    assert.deepEqual(updated.capabilities, ['messages:write', 'storage:write']);
    assert.notEqual(updated.workspaceApiKeyId, previousWorkspaceKeyId);
    assert.equal(db.store.getById('apiKeys', previousWorkspaceKeyId!), null);

    const workspaceKey = db.store.getById('apiKeys', updated.workspaceApiKeyId!);
    assert.ok(workspaceKey);
    assert.deepEqual(workspaceKey.permissions, ['messages:write', 'storage:write']);
  } finally {
    env.cleanup();
  }
});
