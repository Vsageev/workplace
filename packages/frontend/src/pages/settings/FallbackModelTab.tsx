import { useEffect, useState } from 'react';
import { Save, ShieldAlert, Cpu } from 'lucide-react';
import { api } from '../../lib/api';
import styles from './FallbackModelTab.module.css';

const MODELS = [
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    description: 'Strong reasoning, safety-focused.',
    modelIds: [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-haiku-4-5-20251001',
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    vendor: 'OpenAI',
    description: 'Code-first agent model.',
    modelIds: [
      'gpt-5.4',
      'gpt-5.3-codex',
      'gpt-5.3-codex-spark',
      'gpt-5.2-codex',
      'gpt-5.2',
      'gpt-5.1-codex-max',
      'gpt-5.1',
      'gpt-5.1-codex',
      'gpt-5-codex',
      'gpt-5-codex-mini',
      'gpt-5',
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    vendor: 'Alibaba',
    description: 'Open-weight model.',
    modelIds: ['qwen3.5-plus', 'qwen3-coder-plus', 'qwen3-max-2026-01-23'],
  },
] as const;

type ModelId = (typeof MODELS)[number]['id'];

interface FallbackModelSettings {
  fallbackModel: string | null;
  fallbackModelId: string | null;
}

export function FallbackModelTab() {
  const [settings, setSettings] = useState<FallbackModelSettings | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId | ''>('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/settings/fallback-model')
      .then((data) => {
        const d = data as FallbackModelSettings;
        setSettings(d);
        if (d.fallbackModel) {
          const match = MODELS.find(
            (m) => m.name.toLowerCase() === d.fallbackModel!.toLowerCase(),
          );
          if (match) {
            setSelectedModel(match.id);
            setSelectedModelId(d.fallbackModelId ?? '');
          }
        }
      })
      .catch(() => setError('Failed to load fallback model settings'));
  }, []);

  const activeModelDef = MODELS.find((m) => m.id === selectedModel);

  const hasChanges = settings && (
    (activeModelDef?.name ?? null) !== settings.fallbackModel ||
    (selectedModelId || null) !== settings.fallbackModelId
  );

  const hasFallback = settings?.fallbackModel != null;

  async function handleSave() {
    if (!activeModelDef) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await api('/settings/fallback-model', {
        method: 'PATCH',
        body: JSON.stringify({
          fallbackModel: activeModelDef.name,
          fallbackModelId: selectedModelId || null,
        }),
      }) as FallbackModelSettings;
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await api('/settings/fallback-model', {
        method: 'PATCH',
        body: JSON.stringify({
          fallbackModel: null,
          fallbackModelId: null,
        }),
      }) as FallbackModelSettings;
      setSettings(updated);
      setSelectedModel('');
      setSelectedModelId('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to clear settings');
    } finally {
      setSaving(false);
    }
  }

  if (!settings && !error) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>
            <ShieldAlert size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Fallback Model
          </h3>
          <p className={styles.sectionDesc}>
            When an agent's primary model fails (CLI errors, API outages, binary not found),
            the system will automatically retry the request using this fallback model.
            This applies globally to all agents.
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.currentFallback}>
          {hasFallback ? (
            <span className={styles.currentFallbackActive}>
              Current fallback: <strong>{settings!.fallbackModel}</strong>
              {settings!.fallbackModelId ? ` (${settings!.fallbackModelId})` : ''}
            </span>
          ) : (
            'No fallback model configured — failures will not be retried'
          )}
        </div>

        <div className={styles.modelGrid}>
          {MODELS.map((model) => (
            <div
              key={model.id}
              className={[
                styles.modelCard,
                selectedModel === model.id && styles.modelCardSelected,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setSelectedModel(model.id);
                setSelectedModelId(model.modelIds[0]);
              }}
            >
              <div className={styles.modelName}>{model.name}</div>
              <div className={styles.modelVendor}>{model.vendor}</div>
              <div className={styles.modelDesc}>{model.description}</div>
            </div>
          ))}
        </div>

        {selectedModel && activeModelDef && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="fb-model-id">
              <Cpu size={14} />
              Model variant
            </label>
            <p className={styles.fieldHint}>
              Specific model version to use as fallback
            </p>
            <select
              id="fb-model-id"
              className={styles.selectInput}
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
            >
              <option value="">Default</option>
              {activeModelDef.modelIds.map((mid) => (
                <option key={mid} value={mid}>
                  {mid}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.actions}>
          {hasFallback && (
            <button
              className={styles.clearBtn}
              disabled={saving}
              onClick={handleClear}
            >
              Remove fallback
            </button>
          )}
          <button
            className={styles.saveBtn}
            disabled={!selectedModel || !hasChanges || saving}
            onClick={handleSave}
          >
            <Save size={14} />
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
