import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../db/index.js';
import { env } from '../config/env.js';

const SKILLS_DIR = path.resolve(env.DATA_DIR, 'skills');
const AGENTS_DIR = path.resolve(env.DATA_DIR, 'agents');

// ---------------------------------------------------------------------------
// Skill record
// ---------------------------------------------------------------------------

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

function asSkill(rec: Record<string, unknown>): SkillRecord {
  return rec as unknown as SkillRecord;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function skillDir(skillId: string): string {
  return path.join(SKILLS_DIR, skillId);
}

function agentDir(agentId: string): string {
  return path.join(AGENTS_DIR, agentId);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'skill';
}

/** Recursively copy a directory tree. */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Get the destination path where a skill is copied inside an agent workspace. */
function agentSkillDestPath(agentId: string, skillName: string): string {
  return path.join(agentDir(agentId), 'skills', slugify(skillName));
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listSkills(): SkillRecord[] {
  return store
    .getAll('skills')
    .map(asSkill)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkill(id: string): SkillRecord | null {
  const rec = store.getById('skills', id);
  return rec ? asSkill(rec) : null;
}

export function createSkill(params: { name: string; description: string }): SkillRecord {
  ensureSkillsDir();

  const record = store.insert('skills', {
    id: randomUUID(),
    name: params.name.trim(),
    description: params.description.trim(),
  });

  const dir = skillDir(record.id as string);
  fs.mkdirSync(dir, { recursive: true });

  return asSkill(record);
}

export function updateSkill(
  id: string,
  data: Partial<Pick<SkillRecord, 'name' | 'description'>>,
): SkillRecord | null {
  const existing = store.getById('skills', id);
  if (!existing) return null;

  const previousName = existing.name as string;

  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.description !== undefined) patch.description = data.description.trim();

  const updated = store.update('skills', id, patch);
  if (!updated) return null;

  const skill = asSkill(updated);

  const nameChanged = data.name !== undefined && slugify(data.name) !== slugify(previousName);

  // Re-sync in all agents that have this skill
  const agents = store.find(
    'agents',
    (r: Record<string, unknown>) =>
      Array.isArray(r.skillIds) && (r.skillIds as string[]).includes(id),
  );

  for (const agent of agents) {
    const agentId = agent.id as string;

    if (nameChanged) {
      // Rename copied folder
      const oldDest = agentSkillDestPath(agentId, previousName);
      const newDest = agentSkillDestPath(agentId, skill.name);

      if (fs.existsSync(oldDest)) {
        fs.renameSync(oldDest, newDest);
      }
    }

    syncAgentSkillsSection(agentId);
  }

  return skill;
}

export function deleteSkill(id: string): boolean {
  const existing = store.getById('skills', id);
  if (!existing) return false;

  // Detach from all agents first
  const agents = store.find(
    'agents',
    (r: Record<string, unknown>) =>
      Array.isArray(r.skillIds) && (r.skillIds as string[]).includes(id),
  );

  for (const agent of agents) {
    detachSkillFromAgent(agent.id as string, id);
  }

  store.delete('skills', id);

  // Remove skill source folder
  const dir = skillDir(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return true;
}

// ---------------------------------------------------------------------------
// Attach / detach skills to agents
// ---------------------------------------------------------------------------

export function getAgentSkillIds(agentId: string): string[] {
  const agent = store.getById('agents', agentId);
  if (!agent) return [];
  return Array.isArray(agent.skillIds) ? (agent.skillIds as string[]) : [];
}

export function getAgentSkills(agentId: string): SkillRecord[] {
  const ids = getAgentSkillIds(agentId);
  return ids
    .map((id) => getSkill(id))
    .filter((s): s is SkillRecord => s !== null);
}

export function attachSkillToAgent(agentId: string, skillId: string): void {
  const agent = store.getById('agents', agentId);
  if (!agent) throw new Error('Agent not found');

  const skill = getSkill(skillId);
  if (!skill) throw new Error('Skill not found');

  const currentIds = getAgentSkillIds(agentId);
  if (currentIds.includes(skillId)) return; // already attached

  // 1. Copy skill folder into agent workspace
  const src = skillDir(skillId);
  const dest = agentSkillDestPath(agentId, skill.name);
  if (!fs.existsSync(dest)) {
    copyDirSync(src, dest);
  }

  // 2. Update agent record
  store.update('agents', agentId, { skillIds: [...currentIds, skillId] });

  // 3. Update CLAUDE.MD
  syncAgentSkillsSection(agentId);
}

export function detachSkillFromAgent(agentId: string, skillId: string): void {
  const agent = store.getById('agents', agentId);
  if (!agent) throw new Error('Agent not found');

  const currentIds = getAgentSkillIds(agentId);
  if (!currentIds.includes(skillId)) return; // not attached

  // 1. Remove copied skill folder
  const skill = getSkill(skillId);
  if (skill) {
    const dest = agentSkillDestPath(agentId, skill.name);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }

  // Clean up empty skills/ folder
  const skillsFolder = path.join(agentDir(agentId), 'skills');
  if (fs.existsSync(skillsFolder)) {
    const remaining = fs.readdirSync(skillsFolder);
    if (remaining.length === 0) {
      fs.rmdirSync(skillsFolder);
    }
  }

  // 2. Update agent record
  store.update('agents', agentId, {
    skillIds: currentIds.filter((id) => id !== skillId),
  });

  // 3. Update CLAUDE.MD
  syncAgentSkillsSection(agentId);
}

/**
 * Re-copy the skill source folder into an agent workspace.
 * Useful when skill content has been edited and agents need the latest copy.
 */
export function resyncSkillToAgent(agentId: string, skillId: string): void {
  const skill = getSkill(skillId);
  if (!skill) return;

  const src = skillDir(skillId);
  const dest = agentSkillDestPath(agentId, skill.name);

  // Remove old copy, replace with fresh one
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyDirSync(src, dest);
}

/**
 * Re-copy a skill to all agents that have it attached.
 */
export function resyncSkillToAllAgents(skillId: string): void {
  const agents = store.find(
    'agents',
    (r: Record<string, unknown>) =>
      Array.isArray(r.skillIds) && (r.skillIds as string[]).includes(skillId),
  );

  for (const agent of agents) {
    resyncSkillToAgent(agent.id as string, skillId);
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.MD skills section injection
// ---------------------------------------------------------------------------

const SKILLS_START = '<!-- skills:start -->';
const SKILLS_END = '<!-- skills:end -->';

function buildSkillsSection(skills: SkillRecord[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => `- \`skills/${slugify(s.name)}/\` — ${s.description}`);

  return [SKILLS_START, '## Skills', ...lines, SKILLS_END].join('\n');
}

function findInstructionFile(agentId: string): string | null {
  const dir = agentDir(agentId);
  for (const name of ['CLAUDE.MD', 'CLAUDE.md', 'AGENTS.md']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function syncAgentSkillsSection(agentId: string): void {
  const filePath = findInstructionFile(agentId);
  if (!filePath) return;

  const skills = getAgentSkills(agentId);
  const newSection = buildSkillsSection(skills);

  let content = fs.readFileSync(filePath, 'utf-8');

  const startIdx = content.indexOf(SKILLS_START);
  const endIdx = content.indexOf(SKILLS_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section
    const before = content.slice(0, startIdx).replace(/\n+$/, '');
    const after = content.slice(endIdx + SKILLS_END.length).replace(/^\n+/, '');

    if (newSection) {
      content = before + '\n\n' + newSection + (after ? '\n\n' + after : '\n');
    } else {
      content = before + (after ? '\n\n' + after : '\n');
    }
  } else if (newSection) {
    // Append new section
    content = content.replace(/\n*$/, '') + '\n\n' + newSection + '\n';
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Skill file operations (scoped to data/skills/{skillId}/)
// ---------------------------------------------------------------------------

export interface SkillFileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  createdAt: string;
}

function normalizePath(p: string): string {
  let normalized = p.trim().replace(/\\/g, '/');
  if (!normalized) normalized = '/';
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

function resolveSkillDiskPath(skillId: string, filePath: string): string {
  const dir = skillDir(skillId);
  return path.resolve(dir, '.' + filePath);
}

function validateSkillPath(skillId: string, p: string): string {
  const normalized = normalizePath(p);
  const resolved = resolveSkillDiskPath(skillId, normalized);
  const root = skillDir(skillId);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootPrefix)) {
    throw new Error('Path traversal detected');
  }
  return normalized;
}

export function listSkillFiles(skillId: string, dirPath: string): SkillFileEntry[] {
  const normalized = validateSkillPath(skillId, dirPath);
  const diskDir = resolveSkillDiskPath(skillId, normalized);

  if (!fs.existsSync(diskDir)) return [];
  const stats = fs.statSync(diskDir);
  if (!stats.isDirectory()) throw new Error('Path is not a directory');

  return fs
    .readdirSync(diskDir, { withFileTypes: true })
    .map((entry) => {
      const fullPath = path.join(diskDir, entry.name);
      if (!entry.isFile() && !entry.isDirectory()) return null;

      const st = fs.statSync(fullPath);
      const resolvedType = st.isFile() ? 'file' : st.isDirectory() ? 'folder' : null;
      if (!resolvedType) return null;

      const relative = path.relative(skillDir(skillId), fullPath).split(path.sep).join('/');
      const createdAtSource =
        Number.isFinite(st.birthtimeMs) && st.birthtimeMs > 0 ? st.birthtime : st.mtime;

      return {
        name: entry.name,
        path: normalizePath('/' + relative),
        type: resolvedType,
        size: resolvedType === 'file' ? st.size : 0,
        createdAt: createdAtSource.toISOString(),
      } as SkillFileEntry;
    })
    .filter((e): e is SkillFileEntry => e !== null);
}

export function readSkillFileContent(skillId: string, filePath: string): string | null {
  const normalized = validateSkillPath(skillId, filePath);
  const diskPath = resolveSkillDiskPath(skillId, normalized);
  if (!fs.existsSync(diskPath)) return null;
  const stats = fs.statSync(diskPath);
  if (!stats.isFile()) return null;
  return fs.readFileSync(diskPath, 'utf-8');
}

export function writeSkillFile(skillId: string, filePath: string, content: string): void {
  const normalized = validateSkillPath(skillId, filePath);
  const diskPath = resolveSkillDiskPath(skillId, normalized);
  const diskDir = path.dirname(diskPath);
  if (!fs.existsSync(diskDir)) {
    fs.mkdirSync(diskDir, { recursive: true });
  }
  fs.writeFileSync(diskPath, content, 'utf-8');
}

export async function uploadSkillFile(
  skillId: string,
  dirPath: string,
  fileName: string,
  buffer: Buffer,
): Promise<SkillFileEntry> {
  const parentPath = validateSkillPath(skillId, dirPath);
  const safeName = fileName.replace(/[/\\:*?"<>|]/g, '_').trim();
  if (!safeName) throw new Error('Invalid file name');

  const fullPath = parentPath === '/' ? '/' + safeName : parentPath + '/' + safeName;
  validateSkillPath(skillId, fullPath);

  const diskPath = resolveSkillDiskPath(skillId, fullPath);
  const diskDir = path.dirname(diskPath);
  if (!fs.existsSync(diskDir)) {
    fs.mkdirSync(diskDir, { recursive: true });
  }

  fs.writeFileSync(diskPath, buffer);

  const st = fs.statSync(diskPath);
  const createdAtSource =
    Number.isFinite(st.birthtimeMs) && st.birthtimeMs > 0 ? st.birthtime : st.mtime;

  return {
    name: safeName,
    path: fullPath,
    type: 'file',
    size: buffer.length,
    createdAt: createdAtSource.toISOString(),
  };
}

export function createSkillFolder(skillId: string, dirPath: string, name: string): SkillFileEntry {
  const parentPath = validateSkillPath(skillId, dirPath);
  const safeName = name.replace(/[/\\:*?"<>|]/g, '_').trim();
  if (!safeName) throw new Error('Invalid folder name');

  const fullPath = parentPath === '/' ? '/' + safeName : parentPath + '/' + safeName;
  validateSkillPath(skillId, fullPath);

  const diskPath = resolveSkillDiskPath(skillId, fullPath);
  if (fs.existsSync(diskPath)) {
    throw new Error('A file or folder with this name already exists');
  }
  fs.mkdirSync(diskPath, { recursive: true });

  const st = fs.statSync(diskPath);
  const createdAtSource =
    Number.isFinite(st.birthtimeMs) && st.birthtimeMs > 0 ? st.birthtime : st.mtime;

  return {
    name: safeName,
    path: fullPath,
    type: 'folder',
    size: 0,
    createdAt: createdAtSource.toISOString(),
  };
}

export function deleteSkillFile(skillId: string, filePath: string): boolean {
  const normalized = validateSkillPath(skillId, filePath);
  if (normalized === '/') return false;

  const diskPath = resolveSkillDiskPath(skillId, normalized);
  if (!fs.existsSync(diskPath)) return false;
  fs.rmSync(diskPath, { recursive: true, force: true });
  return true;
}

export function getSkillFilePath(skillId: string, filePath: string): string | null {
  const normalized = validateSkillPath(skillId, filePath);
  const diskPath = resolveSkillDiskPath(skillId, normalized);
  if (!fs.existsSync(diskPath)) return null;
  const stats = fs.statSync(diskPath);
  if (!stats.isFile()) return null;
  return diskPath;
}

export function getSkillEntryPath(skillId: string, entryPath: string): string | null {
  const normalized = validateSkillPath(skillId, entryPath);
  const diskPath = resolveSkillDiskPath(skillId, normalized);
  if (!fs.existsSync(diskPath)) return null;
  return diskPath;
}
