import { store } from '../db/index.js';

const SETTINGS_COLLECTION = 'settings';
const PROJECT_SETTINGS_ID = 'project';

export interface ProjectSettings {
  id: string;
  defaultAgentKeyId: string | null;
  createdAt: string;
  updatedAt: string;
}

function asProjectSettings(rec: Record<string, unknown>): ProjectSettings {
  const defaultAgentKeyId =
    typeof rec.defaultAgentKeyId === 'string' && rec.defaultAgentKeyId.length > 0
      ? rec.defaultAgentKeyId
      : null;

  return {
    id: typeof rec.id === 'string' ? rec.id : PROJECT_SETTINGS_ID,
    defaultAgentKeyId,
    createdAt:
      typeof rec.createdAt === 'string' ? rec.createdAt : new Date().toISOString(),
    updatedAt:
      typeof rec.updatedAt === 'string' ? rec.updatedAt : new Date().toISOString(),
  };
}

export function getProjectSettings(): ProjectSettings {
  const existing = store.getById(SETTINGS_COLLECTION, PROJECT_SETTINGS_ID) as ProjectSettings | null;
  if (existing) return asProjectSettings(existing as unknown as Record<string, unknown>);
  return {
    id: PROJECT_SETTINGS_ID,
    defaultAgentKeyId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getProjectDefaultAgentKeyId(): string | null {
  return getProjectSettings().defaultAgentKeyId;
}

export function updateProjectSettings(
  data: { defaultAgentKeyId?: string | null },
): ProjectSettings {
  const existing = store.getById(SETTINGS_COLLECTION, PROJECT_SETTINGS_ID);
  const current = getProjectSettings();
  const updated = {
    ...current,
    ...(data.defaultAgentKeyId !== undefined
      ? {
          defaultAgentKeyId: data.defaultAgentKeyId,
        }
      : {}),
  };

  if (existing) {
    const saved = store.update(
      SETTINGS_COLLECTION,
      PROJECT_SETTINGS_ID,
      updated as unknown as Record<string, unknown>,
    );
    return asProjectSettings(saved as Record<string, unknown>);
  }

  const created = store.insert(
    SETTINGS_COLLECTION,
    updated as unknown as Record<string, unknown>,
  );
  return asProjectSettings(created);
}
