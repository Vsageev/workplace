import path from 'node:path';
import { env } from '../config/env.js';
import { store } from '../db/index.js';

const AGENTS_DIR = path.resolve(env.DATA_DIR, 'agents');
const AGENT_WORKSPACE_SEGMENTS = ['.openwork', 'agents'] as const;

export function getLegacyAgentsDir(): string {
  return AGENTS_DIR;
}

export function getLegacyAgentWorkspacePath(agentId: string): string {
  return path.join(AGENTS_DIR, agentId);
}

export function slugifyAgentWorkspaceName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'agent'
  );
}

export function normalizeRepositoryRoot(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

export function deriveAgentWorkspacePath(repositoryRoot: string, agentName: string): string {
  return path.join(
    normalizeRepositoryRoot(repositoryRoot) ?? path.resolve(repositoryRoot),
    ...AGENT_WORKSPACE_SEGMENTS,
    slugifyAgentWorkspaceName(agentName),
  );
}

export function resolveAgentWorkspacePathFromRecord(
  agent: Record<string, unknown> | null | undefined,
  fallbackAgentId?: string,
): string {
  const configuredWorkspacePath =
    typeof agent?.workspacePath === 'string' && agent.workspacePath.trim()
      ? path.resolve(agent.workspacePath.trim())
      : null;
  if (configuredWorkspacePath) return configuredWorkspacePath;

  const agentId =
    fallbackAgentId ??
    (typeof agent?.id === 'string' && agent.id.trim() ? agent.id.trim() : null);
  if (!agentId) {
    throw new Error('Agent workspace path cannot be resolved without an agent id');
  }

  return getLegacyAgentWorkspacePath(agentId);
}

export function resolveAgentWorkspacePath(agentId: string): string {
  const agent = store.getById('agents', agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }

  return resolveAgentWorkspacePathFromRecord(agent, agentId);
}
