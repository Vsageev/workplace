import { store } from '../db/index.js';
import { createAuditLog } from './audit-log.js';

export interface WorkspaceListQuery {
  userId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateWorkspaceData {
  name: string;
  userId: string;
  boardIds?: string[];
  collectionIds?: string[];
  agentGroupIds?: string[];
}

export interface UpdateWorkspaceData {
  name?: string;
  boardIds?: string[];
  collectionIds?: string[];
  agentGroupIds?: string[];
}

type WorkspaceRecord = {
  id: string;
  name: string;
  userId: string;
  boardIds: string[];
  collectionIds: string[];
  agentGroupIds: string[];
  createdAt: string;
  updatedAt: string;
};

function asWorkspace(rec: Record<string, unknown>): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id: typeof rec.id === 'string' ? rec.id : '',
    name: typeof rec.name === 'string' ? rec.name : '',
    userId: typeof rec.userId === 'string' ? rec.userId : '',
    boardIds: Array.isArray(rec.boardIds) ? (rec.boardIds as string[]) : [],
    collectionIds: Array.isArray(rec.collectionIds) ? (rec.collectionIds as string[]) : [],
    agentGroupIds: Array.isArray(rec.agentGroupIds) ? (rec.agentGroupIds as string[]) : [],
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : now,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : now,
  };
}

export async function listWorkspaces(query: WorkspaceListQuery) {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  let all = store.getAll('workspaces') as any[];

  if (query.userId) {
    all = all.filter((w: any) => w.userId === query.userId);
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    all = all.filter((w: any) => w.name?.toLowerCase().includes(term));
  }

  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = all.length;
  const entries = all.slice(offset, offset + limit).map(asWorkspace);

  return { entries, total };
}

export async function getWorkspaceById(id: string) {
  const workspace = store.getById('workspaces', id);
  return workspace ? asWorkspace(workspace) : null;
}

export async function createWorkspace(
  data: CreateWorkspaceData,
  audit?: { userId: string; ipAddress?: string; userAgent?: string },
) {
  const workspace = store.insert('workspaces', {
    name: data.name,
    userId: data.userId,
    boardIds: data.boardIds ?? [],
    collectionIds: data.collectionIds ?? [],
    agentGroupIds: data.agentGroupIds ?? [],
  }) as any;

  if (audit) {
    await createAuditLog({
      userId: audit.userId,
      action: 'create',
      entityType: 'workspace',
      entityId: workspace.id,
      changes: data as unknown as Record<string, unknown>,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
  }

  return asWorkspace(workspace);
}

export async function updateWorkspace(
  id: string,
  data: UpdateWorkspaceData,
  audit?: { userId: string; ipAddress?: string; userAgent?: string },
) {
  const setData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      setData[key] = value;
    }
  }
  setData.updatedAt = new Date().toISOString();

  const updated = store.update('workspaces', id, setData);
  if (!updated) return null;

  if (audit) {
    await createAuditLog({
      userId: audit.userId,
      action: 'update',
      entityType: 'workspace',
      entityId: id,
      changes: data as unknown as Record<string, unknown>,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
  }

  return asWorkspace(updated);
}

export async function deleteWorkspace(
  id: string,
  audit?: { userId: string; ipAddress?: string; userAgent?: string },
) {
  const deleted = store.delete('workspaces', id);

  if (deleted && audit) {
    await createAuditLog({
      userId: audit.userId,
      action: 'delete',
      entityType: 'workspace',
      entityId: id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
  }

  return deleted ?? null;
}
