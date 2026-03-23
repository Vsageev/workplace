import { Layers } from 'lucide-react';
import type { ManualBatchCardOption } from './ManualBatchCardSelector';
import type { BatchPlanMode, BatchLayerAssignments } from '../lib/agent-batch';
import styles from './BatchLayerPlanner.module.css';

interface BatchLayerPlannerProps {
  selectedCards: ManualBatchCardOption[];
  planMode: BatchPlanMode;
  onPlanModeChange: (mode: BatchPlanMode) => void;
  layerCount: number;
  onLayerCountChange: (count: number) => void;
  assignments: BatchLayerAssignments;
  onAssignmentsChange: (assignments: BatchLayerAssignments) => void;
}

export function BatchLayerPlanner({
  selectedCards,
  planMode,
  onPlanModeChange,
  layerCount,
  onLayerCountChange,
  assignments,
  onAssignmentsChange,
}: BatchLayerPlannerProps) {
  const maxLayerCount = Math.max(1, selectedCards.length);

  function assignCard(cardId: string, nextLayerIndex: number) {
    onAssignmentsChange({
      ...assignments,
      [cardId]: nextLayerIndex,
    });
  }

  const layers = Array.from({ length: layerCount }, (_, index) => ({
    index,
    cards: selectedCards.filter((card) => (assignments[card.id] ?? 0) === index),
  }));

  return (
    <div className={styles.root}>
      <div className={styles.modeRow}>
        <button
          type="button"
          className={`${styles.modeChip} ${planMode === 'ordered' ? styles.modeChipActive : ''}`}
          onClick={() => onPlanModeChange('ordered')}
        >
          Exact order
        </button>
        <button
          type="button"
          className={`${styles.modeChip} ${planMode === 'layers' ? styles.modeChipActive : ''}`}
          onClick={() => onPlanModeChange('layers')}
          disabled={selectedCards.length === 0}
        >
          Dependency layers
        </button>
      </div>

      {planMode === 'ordered' ? (
        <div className={styles.hint}>
          Cards run one-by-one in the manual order above.
        </div>
      ) : (
        <>
          <div className={styles.controlsRow}>
            <div className={styles.controlBlock}>
              <span className={styles.controlLabel}>Layers</span>
              <div className={styles.layerStepper}>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => onLayerCountChange(Math.max(1, layerCount - 1))}
                  disabled={layerCount <= 1}
                  aria-label="Remove layer"
                >
                  -
                </button>
                <span className={styles.stepperValue}>{layerCount}</span>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => onLayerCountChange(Math.min(maxLayerCount, layerCount + 1))}
                  disabled={layerCount >= maxLayerCount}
                  aria-label="Add layer"
                >
                  +
                </button>
              </div>
            </div>
            <div className={styles.controlHint}>
              Layer 1 runs first. Each next layer waits for the previous one.
            </div>
          </div>

          {selectedCards.length === 0 ? (
            <div className={styles.hint}>Add cards above before assigning layers.</div>
          ) : (
            <>
              <div className={styles.assignmentList}>
                {selectedCards.map((card, index) => (
                  <div key={card.id} className={styles.assignmentRow}>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardOrder}>{index + 1}</span>
                      <div className={styles.cardText}>
                        <div className={styles.cardName}>{card.name}</div>
                        {card.subtitle && <div className={styles.cardSubtitle}>{card.subtitle}</div>}
                      </div>
                    </div>
                    <label className={styles.layerField}>
                      <span className={styles.layerFieldLabel}>Layer</span>
                      <select
                        className={styles.layerSelect}
                        value={(assignments[card.id] ?? 0) + 1}
                        onChange={(e) => assignCard(card.id, Number(e.target.value) - 1)}
                      >
                        {Array.from({ length: layerCount }, (_, layerIndex) => (
                          <option key={layerIndex} value={layerIndex + 1}>
                            Layer {layerIndex + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>

              <div className={styles.summary}>
                {layers.map((layer) => (
                  <div key={layer.index} className={styles.summaryRow}>
                    <div className={styles.summaryTitle}>
                      <Layers size={12} />
                      Layer {layer.index + 1}
                    </div>
                    <div className={styles.summaryBody}>
                      {layer.cards.length === 0
                        ? 'Empty'
                        : layer.cards.map((card) => card.name).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
