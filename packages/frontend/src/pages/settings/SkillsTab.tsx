import { useCallback, useEffect, useRef, useState } from 'react';
import { Blocks, ChevronDown, ChevronRight, Folder, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { toast } from '../../stores/toast';
import { useConfirm } from '../../hooks/useConfirm';
import { Tooltip } from '../../ui/Tooltip';
import { FileBrowser } from '../../components/FileBrowser';
import styles from './SkillsTab.module.css';

interface Skill {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

const enc = encodeURIComponent;

function skillEndpoints(skillId: string) {
  return {
    list: (dirPath: string) => `/skills/${skillId}/files?path=${enc(dirPath)}`,
    createFolder: `/skills/${skillId}/files/folders`,
    upload: `/skills/${skillId}/files/upload`,
    download: (filePath: string) => `/skills/${skillId}/files/download?path=${enc(filePath)}`,
    delete: (entryPath: string) => `/skills/${skillId}/files?path=${enc(entryPath)}`,
    reveal: `/skills/${skillId}/files/reveal`,
  };
}

/* ─── Skill Create/Edit Form ─── */

function SkillForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: { name: string; description: string };
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, description.trim());
  }

  return (
    <form className={styles.skillForm} onSubmit={handleSubmit}>
      <div>
        <div className={styles.fieldLabel}>Name</div>
        <input
          ref={nameRef}
          className={styles.skillFormInput}
          type="text"
          placeholder="e.g. API Design Guidelines"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </div>
      <div>
        <div className={styles.fieldLabel}>Description (shown in agent instructions)</div>
        <input
          className={styles.skillFormInput}
          type="text"
          placeholder="One-line summary of what this skill provides"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className={styles.skillFormActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={!name.trim() || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/* ─── Main SkillsTab ─── */

export function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ entries: Skill[] }>('/skills');
      setSkills(data.entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  async function handleCreate(name: string, description: string) {
    setSaving(true);
    try {
      const newSkill = await api<Skill>('/skills', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });
      setSkills((prev) => [...prev, newSkill].sort((a, b) => a.name.localeCompare(b.name)));
      setCreating(false);
      setExpandedId(newSkill.id);
      toast.success(`Skill "${name}" created`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create skill');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, name: string, description: string) {
    setSaving(true);
    try {
      const updated = await api<Skill>(`/skills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description }),
      });
      setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
      toast.success('Skill updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update skill');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(skill: Skill) {
    const confirmed = await confirm({
      title: 'Delete skill',
      message: `Delete "${skill.name}"? This removes it from all agents and deletes all skill files. Cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api(`/skills/${skill.id}`, { method: 'DELETE' });
      setSkills((prev) => prev.filter((s) => s.id !== skill.id));
      if (expandedId === skill.id) setExpandedId(null);
      toast.success(`Skill "${skill.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete skill');
    }
  }

  async function handleResync(skill: Skill) {
    try {
      await api(`/skills/${skill.id}/resync`, { method: 'POST' });
      toast.success(`Pushed latest "${skill.name}" files to all agents`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to resync');
    }
  }

  function toggleExpand(skillId: string) {
    setExpandedId((prev) => (prev === skillId ? null : skillId));
    setEditingId(null);
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingRows}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeletonRow} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {confirmDialog}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.sectionTitle}>Skills</h3>
          <p className={styles.sectionDesc}>
            Reusable instruction folders that can be attached to agents. Click a skill to browse and
            manage its files.
          </p>
        </div>
        {!creating && (
          <button
            className={styles.addBtn}
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
          >
            <Plus size={14} />
            New skill
          </button>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {creating && (
        <div className={`${styles.formCard} ${styles.formCardActive}`}>
          <SkillForm
            initial={{ name: '', description: '' }}
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
            saving={saving}
          />
        </div>
      )}

      {skills.length === 0 && !creating ? (
        <div className={styles.emptyState}>
          <Blocks size={36} strokeWidth={1.5} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No skills yet</p>
          <p className={styles.emptyDesc}>
            Create skills to package reusable instructions. Attach them to agents to automatically
            copy the skill folder and add a reference in their CLAUDE.MD.
          </p>
          <button className={styles.addBtnSecondary} onClick={() => setCreating(true)}>
            <Plus size={14} />
            Create your first skill
          </button>
        </div>
      ) : (
        <div className={styles.skillList}>
          {skills.map((skill) => (
            <div key={skill.id} className={styles.skillBlock}>
              {editingId === skill.id ? (
                <div className={styles.skillItem} style={{ padding: 0 }}>
                  <div
                    className={`${styles.formCard} ${styles.formCardActive}`}
                    style={{ margin: 0, border: 'none', borderRadius: 0, width: '100%' }}
                  >
                    <SkillForm
                      initial={{ name: skill.name, description: skill.description }}
                      onSave={(name, description) => void handleUpdate(skill.id, name, description)}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={`${styles.skillItem} ${expandedId === skill.id ? styles.skillItemExpanded : ''}`}
                    onClick={() => toggleExpand(skill.id)}
                  >
                    <div className={styles.skillExpandIcon}>
                      {expandedId === skill.id ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </div>
                    <div className={styles.skillIcon}>
                      <Blocks size={18} />
                    </div>
                    <div className={styles.skillInfo}>
                      <div className={styles.skillName}>{skill.name}</div>
                      {skill.description && (
                        <div className={styles.skillDesc}>{skill.description}</div>
                      )}
                    </div>
                    <div className={styles.skillActions} onClick={(e) => e.stopPropagation()}>
                      <Tooltip label="Push latest files to all agents">
                        <button
                          className={styles.resyncBtn}
                          onClick={() => void handleResync(skill)}
                        >
                          <RefreshCw size={12} />
                          Resync
                        </button>
                      </Tooltip>
                      <Tooltip label="Edit skill">
                        <button
                          className={styles.iconBtn}
                          onClick={() => {
                            setEditingId(skill.id);
                            setCreating(false);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Delete skill">
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => void handleDelete(skill)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {expandedId === skill.id && (
                    <div className={styles.explorer}>
                      <FileBrowser
                        endpoints={skillEndpoints(skill.id)}
                        rootLabel="Files"
                        rootIcon={Folder}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
