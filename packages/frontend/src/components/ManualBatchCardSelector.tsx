import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Search, Trash2 } from 'lucide-react';
import styles from './ManualBatchCardSelector.module.css';

export interface ManualBatchCardOption {
  id: string;
  name: string;
  subtitle?: string | null;
}

interface ManualBatchCardSelectorProps {
  selectedCards: ManualBatchCardOption[];
  onChange: (cards: ManualBatchCardOption[]) => void;
  loadOptions: (query: string) => Promise<ManualBatchCardOption[]>;
  searchPlaceholder?: string;
  emptySearchLabel?: string;
  emptySelectedLabel?: string;
}

export function ManualBatchCardSelector({
  selectedCards,
  onChange,
  loadOptions,
  searchPlaceholder = 'Search cards…',
  emptySearchLabel = 'No matching cards',
  emptySelectedLabel = 'Add cards to define the batch order',
}: ManualBatchCardSelectorProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ManualBatchCardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      loadOptions(query.trim())
        .then((next) => {
          if (!cancelled) setOptions(next);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [loadOptions, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectedIds = useMemo(() => new Set(selectedCards.map((c) => c.id)), [selectedCards]);
  const availableOptions = useMemo(
    () => options.filter((o) => !selectedIds.has(o.id)),
    [options, selectedIds],
  );

  function addCard(card: ManualBatchCardOption) {
    onChange([...selectedCards, card]);
  }

  function removeCard(cardId: string) {
    onChange(selectedCards.filter((c) => c.id !== cardId));
  }

  function moveCard(cardId: string, direction: -1 | 1) {
    const index = selectedCards.findIndex((c) => c.id === cardId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedCards.length) return;
    const next = [...selectedCards];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }

  return (
    <div className={styles.root}>
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
              <div className={styles.dropdownEmpty}>Searching…</div>
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

      {selectedCards.length > 0 && (
        <div className={styles.listHeader}>
          <span className={styles.listLabel}>{selectedCards.length} selected</span>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      )}

      {selectedCards.length === 0 ? (
        <div className={styles.emptyState}>{emptySelectedLabel}</div>
      ) : (
        <div className={styles.list}>
          {selectedCards.map((card, index) => (
            <div key={card.id} className={styles.card}>
              <span className={styles.cardOrder}>{index + 1}</span>
              <div className={styles.cardBody}>
                <div className={styles.cardName}>{card.name}</div>
                {card.subtitle && <div className={styles.cardSub}>{card.subtitle}</div>}
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => moveCard(card.id, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => moveCard(card.id, 1)}
                  disabled={index === selectedCards.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.removeBtn}`}
                  onClick={() => removeCard(card.id)}
                  aria-label="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
