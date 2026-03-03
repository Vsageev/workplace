import { useState, useEffect, useRef } from 'react';
import { X, Bot, Play, Check, CheckCircle2, Minus, Plus, Zap, Layers, ChevronDown } from 'lucide-react';
import { Button, Tooltip } from '../../ui';
import { api } from '../../lib/api';
import { toast } from '../../stores/toast';
import { AgentAvatar } from '../../components/AgentAvatar';
import styles from './BoardBatchRunPanel.module.css';

interface BoardColumn {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface AgentEntry {
  id: string;
  name: string;
  status: string;
  avatarIcon?: string;
  avatarBgColor?: string;
  avatarLogoColor?: string;
}

interface BatchResult {
  total: number;
  queued: number;
  message: string;
}

interface BoardBatchRunPanelProps {
  boardId: string;
  columns: BoardColumn[];
  onClose: () => void;
}

export function BoardBatchRunPanel({ boardId, columns, onClose }: BoardBatchRunPanelProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentId, setAgentId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(
    () => new Set(columns.map((c) => c.id)),
  );
  const [maxParallel, setMaxParallel] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const agentPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ entries: AgentEntry[] }>('/agents?limit=100').then((res) => {
      const active = res.entries.filter((a) => a.status === 'active');
      setAgents(active);
      if (active.length > 0) setAgentId(active[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setShowAgentPicker(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggleColumn(id: string) {
    setSelectedColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedColumnIds(new Set(columns.map((c) => c.id)));
  }

  function deselectAll() {
    setSelectedColumnIds(new Set());
  }

  async function handleSubmit() {
    if (!agentId || !prompt.trim() || submitting) return;

    const columnIds =
      selectedColumnIds.size === columns.length
        ? undefined
        : Array.from(selectedColumnIds);

    if (columnIds !== undefined && columnIds.length === 0) {
      toast.error('Select at least one column');
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const res = await api<BatchResult>(`/boards/${boardId}/batch-run`, {
        method: 'POST',
        body: JSON.stringify({
          agentId,
          prompt: prompt.trim(),
          columnIds,
          maxParallel,
        }),
      });
      setResult(res);
      if (res.total === 0) {
        toast.info('No cards found on the board');
      } else {
        toast.success(`Batch run started — ${res.total} card${res.total !== 1 ? 's' : ''} queued`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to start batch run');
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = selectedColumnIds.size === columns.length;
  const selectedAgent = agents.find((a) => a.id === agentId);

  const canRun = !submitting && !!agentId && !!prompt.trim() && selectedColumnIds.size > 0;
  const disabledReason = submitting
    ? 'Batch run is starting…'
    : !agentId
      ? 'Select an agent first'
      : !prompt.trim()
        ? 'Enter a prompt'
        : selectedColumnIds.size === 0
          ? 'Select at least one column'
          : undefined;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <Zap size={14} />
            </div>
            <span className={styles.title}>Batch Run</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Agent Selection */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Bot size={14} className={styles.sectionIcon} />
              <span className={styles.sectionLabel}>Agent</span>
            </div>
            <div ref={agentPickerRef} className={styles.agentPicker}>
              <button
                type="button"
                className={styles.agentTrigger}
                onClick={() => setShowAgentPicker((v) => !v)}
              >
                {selectedAgent ? (
                  <>
                    <AgentAvatar
                      icon={selectedAgent.avatarIcon || 'spark'}
                      bgColor={selectedAgent.avatarBgColor || '#1a1a2e'}
                      logoColor={selectedAgent.avatarLogoColor || '#e94560'}
                      size={20}
                    />
                    <span className={styles.agentTriggerName}>{selectedAgent.name}</span>
                  </>
                ) : (
                  <span className={styles.agentPlaceholder}>
                    {agents.length === 0 ? 'No active agents' : 'Select an agent…'}
                  </span>
                )}
                <ChevronDown size={13} className={styles.agentChevron} />
              </button>
              {showAgentPicker && (
                <div className={styles.agentDropdown}>
                  {agents.length === 0 ? (
                    <div className={styles.agentDropdownEmpty}>No active agents available</div>
                  ) : (
                    agents.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`${styles.agentOption} ${agentId === a.id ? styles.agentOptionActive : ''}`}
                        onClick={() => { setAgentId(a.id); setShowAgentPicker(false); }}
                      >
                        <AgentAvatar
                          icon={a.avatarIcon || 'spark'}
                          bgColor={a.avatarBgColor || '#1a1a2e'}
                          logoColor={a.avatarLogoColor || '#e94560'}
                          size={20}
                        />
                        <span className={styles.agentOptionName}>{a.name}</span>
                        {agentId === a.id && <Check size={12} className={styles.agentOptionCheck} />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Prompt</span>
              <span className={styles.charCount}>{prompt.length.toLocaleString()} / 10,000</span>
            </div>
            <textarea
              className={styles.promptTextarea}
              placeholder="Describe what the agent should do with each card…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={10000}
              rows={5}
            />
          </div>

          {/* Columns */}
          {columns.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <Layers size={14} className={styles.sectionIcon} />
                <span className={styles.sectionLabel}>
                  Columns
                  <span className={styles.sectionCount}>
                    {selectedColumnIds.size}/{columns.length}
                  </span>
                </span>
                <button
                  className={styles.toggleAllBtn}
                  onClick={allSelected ? deselectAll : selectAll}
                  type="button"
                >
                  {allSelected ? 'Clear' : 'All'}
                </button>
              </div>
              <div className={styles.columnChips}>
                {columns.map((col) => {
                  const selected = selectedColumnIds.has(col.id);
                  return (
                    <button
                      key={col.id}
                      className={`${styles.columnChip} ${selected ? styles.columnChipSelected : ''}`}
                      onClick={() => toggleColumn(col.id)}
                      type="button"
                    >
                      <span
                        className={styles.columnDot}
                        style={{ background: col.color }}
                      />
                      {col.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Concurrency */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Concurrency</span>
            </div>
            <div className={styles.stepperRow}>
              <div className={styles.stepper}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => setMaxParallel((v) => Math.max(1, v - 1))}
                  disabled={maxParallel <= 1}
                  type="button"
                  aria-label="Decrease"
                >
                  <Minus size={14} />
                </button>
                <span className={styles.stepperValue}>{maxParallel}</span>
                <button
                  className={styles.stepperBtn}
                  onClick={() => setMaxParallel((v) => Math.min(10, v + 1))}
                  disabled={maxParallel >= 10}
                  type="button"
                  aria-label="Increase"
                >
                  <Plus size={14} />
                </button>
              </div>
              <span className={styles.stepperHint}>parallel agents</span>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`${styles.result} ${result.total === 0 ? styles.resultEmpty : styles.resultSuccess}`}>
              {result.total > 0 && <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
              {result.message}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerMeta}>
            {selectedAgent && (
              <span className={styles.footerAgent}>
                {selectedAgent.name}
              </span>
            )}
            {selectedColumnIds.size > 0 && selectedColumnIds.size < columns.length && (
              <span className={styles.footerColumns}>
                {selectedColumnIds.size} column{selectedColumnIds.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {disabledReason ? (
            <Tooltip label={disabledReason} position="top">
              <div style={{ cursor: 'not-allowed' }}>
                <Button
                  variant="primary"
                  disabled
                  style={{ pointerEvents: 'none' }}
                >
                  <Play size={14} />
                  {submitting ? 'Starting…' : 'Run batch'}
                </Button>
              </div>
            </Tooltip>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
            >
              <Play size={14} />
              Run batch
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
