import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, Layers, Plus, Search, Trash2, X } from 'lucide-react';
import styles from './BatchLayerPlanner.module.css';

export interface BatchPlanCard {
  id: string;
  name: string;
  subtitle?: string | null;
}

export interface BatchLayer {
  cards: BatchPlanCard[];
}

interface BatchLayerPlannerProps {
  layers: BatchLayer[];
  onChange: (layers: BatchLayer[]) => void;
  loadOptions: (query: string) => Promise<BatchPlanCard[]>;
  searchPlaceholder?: string;
  emptySearchLabel?: string;
}

/** Compact unique-enough id for internal keying */
let _nextSep = 0;
function sepId() {
  return `sep-${++_nextSep}`;
}

// ─── Drag payload types ──────────────────────────────────────────────
type DragPayload = {
  cardId: string;
  fromLayer: number;
  fromIndex: number;
};

export function BatchLayerPlanner({
  layers,
  onChange,
  loadOptions,
  searchPlaceholder = 'Search cards…',
  emptySearchLabel = 'No matching cards',
}: BatchLayerPlannerProps) {
  // ── Search / add cards ───────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<BatchPlanCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      loadOptions(query.trim())
        .then((next) => { if (!cancelled) setOptions(next); })
        .catch(() => { if (!cancelled) setOptions([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [loadOptions, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const allCardIds = useMemo(
    () => new Set(layers.flatMap((l) => l.cards.map((c) => c.id))),
    [layers],
  );
  const availableOptions = useMemo(
    () => options.filter((o) => !allCardIds.has(o.id)),
    [options, allCardIds],
  );

  const totalCards = useMemo(() => layers.reduce((s, l) => s + l.cards.length, 0), [layers]);

  function addCard(card: BatchPlanCard) {
    // Add to last layer (or create the first one)
    const next = layers.length === 0
      ? [{ cards: [card] }]
      : layers.map((l, i) => i === layers.length - 1 ? { cards: [...l.cards, card] } : l);
    onChange(next);
  }

  function removeCard(layerIdx: number, cardIdx: number) {
    const next = layers.map((l, li) =>
      li === layerIdx ? { cards: l.cards.filter((_, ci) => ci !== cardIdx) } : l,
    ).filter((l) => l.cards.length > 0);
    onChange(next.length === 0 ? [{ cards: [] }] : next);
  }

  function clearAll() {
    onChange([{ cards: [] }]);
  }

  // ── Split / merge layers ─────────────────────────────────────────
  function splitAfter(layerIdx: number, cardIdx: number) {
    const layer = layers[layerIdx];
    if (cardIdx >= layer.cards.length - 1) return; // already last card
    const before = layer.cards.slice(0, cardIdx + 1);
    const after = layer.cards.slice(cardIdx + 1);
    const next = [
      ...layers.slice(0, layerIdx),
      { cards: before },
      { cards: after },
      ...layers.slice(layerIdx + 1),
    ];
    onChange(next);
  }

  function mergeLayers(layerIdx: number) {
    // Merge this layer into the previous one
    if (layerIdx === 0) return;
    const prev = layers[layerIdx - 1];
    const cur = layers[layerIdx];
    const next = [
      ...layers.slice(0, layerIdx - 1),
      { cards: [...prev.cards, ...cur.cards] },
      ...layers.slice(layerIdx + 1),
    ];
    onChange(next);
  }

  // ── Drag and drop ────────────────────────────────────────────────
  const dragRef = useRef<DragPayload | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ layerIdx: number; cardIdx: number } | null>(null);

  function handleDragStart(e: React.DragEvent, layerIdx: number, cardIdx: number, card: BatchPlanCard) {
    dragRef.current = { cardId: card.id, fromLayer: layerIdx, fromIndex: cardIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
    // Slight delay so the dragged element renders before we style it
    setIsDragging(true);
    requestAnimationFrame(() => {
      const el = e.target as HTMLElement;
      el.classList.add(styles.dragging);
    });
  }

  function handleDragEnd(e: React.DragEvent) {
    (e.target as HTMLElement).classList.remove(styles.dragging);
    dragRef.current = null;
    setIsDragging(false);
    setDropTarget(null);
  }

  const handleDragOver = useCallback((e: React.DragEvent, layerIdx: number, cardIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ layerIdx, cardIdx });
  }, []);

  const handleLayerDragOver = useCallback((e: React.DragEvent, layerIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const layer = layers[layerIdx];
    setDropTarget({ layerIdx, cardIdx: layer.cards.length });
  }, [layers]);

  function handleDrop(e: React.DragEvent, toLayer: number, toIndex: number) {
    e.preventDefault();
    setDropTarget(null);
    setIsDragging(false);
    const payload = dragRef.current;
    if (!payload) return;
    dragRef.current = null;

    const { fromLayer, fromIndex } = payload;

    // Build a new layers array with the card moved
    const card = layers[fromLayer].cards[fromIndex];
    if (!card) return;

    // Remove from source
    let next = layers.map((l, li) =>
      li === fromLayer ? { cards: l.cards.filter((_, ci) => ci !== fromIndex) } : l,
    );

    // Adjust target index if same layer and source was before target
    let adjustedToIndex = toIndex;
    if (fromLayer === toLayer && fromIndex < toIndex) {
      adjustedToIndex = Math.max(0, toIndex - 1);
    }

    // Insert at target
    next = next.map((l, li) => {
      if (li !== toLayer) return l;
      const cards = [...l.cards];
      cards.splice(adjustedToIndex, 0, card);
      return { cards };
    });

    // Remove empty layers
    next = next.filter((l) => l.cards.length > 0);
    if (next.length === 0) next = [{ cards: [card] }];

    onChange(next);
  }

  // ── Separator drop zone (drop between layers to create new layer) ──
  const [sepDropTarget, setSepDropTarget] = useState<number | null>(null);

  function handleSepDragOver(e: React.DragEvent, afterLayerIdx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSepDropTarget(afterLayerIdx);
  }

  function handleSepDragLeave() {
    setSepDropTarget(null);
  }

  function handleSepDrop(e: React.DragEvent, afterLayerIdx: number) {
    e.preventDefault();
    setSepDropTarget(null);
    setIsDragging(false);
    const payload = dragRef.current;
    if (!payload) return;
    dragRef.current = null;

    const { fromLayer, fromIndex } = payload;
    const card = layers[fromLayer].cards[fromIndex];
    if (!card) return;

    // Remove from source
    let next = layers.map((l, li) =>
      li === fromLayer ? { cards: l.cards.filter((_, ci) => ci !== fromIndex) } : l,
    );

    // Insert new layer after afterLayerIdx
    const insertAt = afterLayerIdx + 1;
    next.splice(insertAt, 0, { cards: [card] });

    // Remove empty layers
    next = next.filter((l) => l.cards.length > 0);
    if (next.length === 0) next = [{ cards: [card] }];

    onChange(next);
  }

  // ── Render ───────────────────────────────────────────────────────
  const hasMultipleLayers = layers.length > 1 || (layers.length === 1 && layers[0].cards.length === 0);

  return (
    <div className={styles.root}>
      {/* Search / add */}
      <div className={styles.combobox} ref={comboRef}>
        <div className={styles.searchBox}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={searchPlaceholder}
          />
        </div>
        {open && (
          <div className={styles.dropdown}>
            {loading && availableOptions.length === 0 ? (
              <div className={styles.dropdownEmpty}>Searching...</div>
            ) : availableOptions.length === 0 ? (
              <div className={styles.dropdownEmpty}>{emptySearchLabel}</div>
            ) : (
              availableOptions.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => addCard(card)}
                >
                  <div className={styles.dropdownItemText}>
                    <div className={styles.dropdownItemName}>{card.name}</div>
                    {card.subtitle && <div className={styles.dropdownItemSub}>{card.subtitle}</div>}
                  </div>
                  <Plus size={14} className={styles.dropdownItemAdd} />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Header row */}
      {totalCards > 0 && (
        <div className={styles.listHeader}>
          <span className={styles.listLabel}>
            {totalCards} card{totalCards !== 1 ? 's' : ''}
            {layers.filter((l) => l.cards.length > 0).length > 1
              ? ` in ${layers.filter((l) => l.cards.length > 0).length} layers`
              : ''}
          </span>
          <button type="button" className={styles.clearBtn} onClick={clearAll}>
            Clear
          </button>
        </div>
      )}

      {/* Layers */}
      {totalCards === 0 ? (
        <div className={styles.emptyState}>
          Add cards above. Drag them into groups to create dependency layers.
        </div>
      ) : (
        <div className={styles.layerList}>
          {layers.map((layer, layerIdx) => {
            if (layer.cards.length === 0) return null;
            const layerNumber = layers.slice(0, layerIdx + 1).filter((l) => l.cards.length > 0).length;

            return (
              <div key={layerIdx}>
                {/* Separator / merge zone between layers */}
                {layerIdx > 0 && layers[layerIdx - 1].cards.length > 0 && (
                  <div
                    className={`${styles.layerSeparator} ${isDragging ? styles.layerSeparatorDragging : ''} ${sepDropTarget === layerIdx - 1 ? styles.layerSeparatorActive : ''}`}
                    onDragOver={(e) => handleSepDragOver(e, layerIdx - 1)}
                    onDragLeave={handleSepDragLeave}
                    onDrop={(e) => handleSepDrop(e, layerIdx - 1)}
                  >
                    <div className={styles.separatorLine} />
                    <button
                      type="button"
                      className={styles.separatorMergeBtn}
                      onClick={() => mergeLayers(layerIdx)}
                      title="Merge with layer above"
                    >
                      <X size={10} />
                    </button>
                    <div className={styles.separatorLine} />
                  </div>
                )}

                <div
                  className={`${styles.layer} ${
                    dropTarget?.layerIdx === layerIdx && dropTarget.cardIdx === layer.cards.length
                      ? styles.layerDropTarget
                      : ''
                  }`}
                  onDragOver={(e) => handleLayerDragOver(e, layerIdx)}
                  onDrop={(e) => handleDrop(e, layerIdx, layer.cards.length)}
                >
                  {/* Layer label */}
                  {layers.filter((l) => l.cards.length > 0).length > 1 && (
                    <div className={styles.layerLabel}>
                      <Layers size={11} />
                      <span>Layer {layerNumber}</span>
                      {layerNumber === 1 && <span className={styles.layerHint}>runs first</span>}
                      {layerNumber > 1 && (
                        <span className={styles.layerHint}>
                          waits for layer {layerNumber - 1}
                        </span>
                      )}
                    </div>
                  )}

                  {layer.cards.map((card, cardIdx) => (
                    <div
                      key={card.id}
                      className={`${styles.card} ${
                        dropTarget?.layerIdx === layerIdx && dropTarget?.cardIdx === cardIdx
                          ? styles.cardDropBefore
                          : ''
                      }`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, layerIdx, cardIdx, card)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, layerIdx, cardIdx)}
                      onDrop={(e) => { e.stopPropagation(); handleDrop(e, layerIdx, cardIdx); }}
                    >
                      <div className={styles.cardGrip}>
                        <GripVertical size={14} />
                      </div>
                      <div className={styles.cardBody}>
                        <div className={styles.cardName}>{card.name}</div>
                        {card.subtitle && <div className={styles.cardSub}>{card.subtitle}</div>}
                      </div>
                      <div className={styles.cardActions}>
                        {/* Split: creates a new layer boundary after this card */}
                        {cardIdx < layer.cards.length - 1 && (
                          <button
                            type="button"
                            className={styles.splitBtn}
                            onClick={() => splitAfter(layerIdx, cardIdx)}
                            title="Split into new layer after this card"
                          >
                            <Layers size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => removeCard(layerIdx, cardIdx)}
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Drop zone / button after last layer to create a new layer below */}
                {layerIdx === layers.length - 1 && layers.filter((l) => l.cards.length > 0).length >= 1 && (
                  <div
                    className={`${styles.newLayerDropZone} ${isDragging ? styles.newLayerDropZoneDragging : ''} ${sepDropTarget === layerIdx ? styles.newLayerDropZoneActive : ''}`}
                    onDragOver={(e) => handleSepDragOver(e, layerIdx)}
                    onDragLeave={handleSepDragLeave}
                    onDrop={(e) => handleSepDrop(e, layerIdx)}
                  >
                    {isDragging ? (
                      <>
                        <Layers size={16} className={styles.newLayerDropIcon} />
                        <span className={styles.newLayerDropLabel}>Drop to create new layer</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.newLayerBtn}
                        onClick={() => {
                          // Add an empty layer at the end — it will show once a card is dragged into it
                          // For now, split the last card into its own layer if there are 2+ cards
                          const lastLayer = layers[layers.length - 1];
                          if (lastLayer.cards.length >= 2) {
                            splitAfter(layers.length - 1, lastLayer.cards.length - 2);
                          }
                        }}
                      >
                        <Plus size={14} />
                        <span>New layer</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
