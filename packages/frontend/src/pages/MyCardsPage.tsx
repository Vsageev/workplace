import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  X,
  Plus,
  Tag,
  AlertTriangle,
  RotateCcw,
  FolderOpen,
  ListChecks,
  Square,
  CheckSquare,
  Minus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../layout';
import { api, ApiError } from '../lib/api';
import { toast } from '../stores/toast';
import { useAuth } from '../stores/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { AgentAvatar } from '../components/AgentAvatar';
import { CardQuickView } from './boards/CardQuickView';
import { stripMarkdown } from '../lib/file-utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { highlightMatch } from '../components/SearchHighlight';
import styles from './MyCardsPage.module.css';

interface CardAssignee {
  id: string;
  firstName: string;
  lastName: string;
  type?: 'user' | 'agent';
  avatarIcon?: string | null;
  avatarBgColor?: string | null;
  avatarLogoColor?: string | null;
}

interface CardTag {
  id: string;
  name: string;
  color: string;
}

interface CardItem {
  id: string;
  name: string;
  description: string | null;
  collectionId: string;
  assignee: CardAssignee | null;
  tags?: CardTag[];
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface CardsResponse {
  total: number;
  entries: CardItem[];
}


const PAGE_SIZE = 100;

export function MyCardsPage() {
  useDocumentTitle('My Cards');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalCount, setTotalCount] = useState(0); // total assigned cards regardless of completion status
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');
  const [tagFilters, setTagFilters] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('my-cards-page-tag-filters');
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const [quickViewCardId, setQuickViewCardId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const cardRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [collectionNames, setCollectionNames] = useState<Map<string, string>>(new Map());
  const [collections, setCollections] = useState<{ id: string; name: string; isGeneral?: boolean }[]>([]);
  const [inlineAddName, setInlineAddName] = useState('');
  const [inlineAddSubmitting, setInlineAddSubmitting] = useState(false);
  const inlineAddRef = useRef<HTMLInputElement>(null);

  // Bulk selection
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [bulkActionsOpen, setBulkActionsOpen] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const bulkBarRef = useRef<HTMLDivElement>(null);

  // Fetch collection names for context display on card rows
  useEffect(() => {
    api<{ entries: { id: string; name: string; isGeneral?: boolean }[]; total: number }>('/collections?limit=200')
      .then((data) => {
        setCollectionNames(new Map(data.entries.map((c) => [c.id, c.name])));
        setCollections(data.entries);
      })
      .catch(() => {}); // supplementary info — silently ignore failures
  }, []);

  // Persist tag filters to localStorage
  useEffect(() => {
    localStorage.setItem('my-cards-page-tag-filters', JSON.stringify([...tagFilters]));
  }, [tagFilters]);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFetchError(false);
    try {
      const qp = new URLSearchParams();
      qp.set('assigneeId', user.id);
      qp.set('limit', String(PAGE_SIZE));
      if (search.trim()) qp.set('search', search.trim());

      const data = await api<CardsResponse>(`/cards?${qp.toString()}`);
      setCards(data.entries);
      setTotal(data.total);
      setTotalCount(data.total);
    } catch (err) {
      setFetchError(true);
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Failed to load cards');
    } finally {
      setLoading(false);
    }
  }, [user, search]);

  useEffect(() => {
    const id = setTimeout(() => { void fetchCards(); }, search ? 300 : 0);
    return () => clearTimeout(id);
  }, [fetchCards, search]);


  const handleCardUpdated = useCallback((
    cardId: string,
    updates: { name?: string; description?: string | null; assigneeId?: string | null; customFields?: Record<string, unknown> },
  ) => {
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, ...updates } : c));
  }, []);

  const openQuickView = useCallback((e: React.MouseEvent, cardId: string) => {
    if (e.metaKey || e.ctrlKey) return; // allow ctrl/cmd+click to open in new tab
    e.preventDefault();
    setQuickViewCardId(cardId);
  }, []);

  const handleInlineAdd = useCallback(async () => {
    const trimmed = inlineAddName.trim();
    if (!trimmed || inlineAddSubmitting || !user) return;
    // Prefer the general collection, fall back to the first available
    const col = collections.find((c) => c.isGeneral) ?? collections[0];
    if (!col) {
      toast.error('No collection available. Create a collection first.');
      return;
    }
    setInlineAddSubmitting(true);
    try {
      const card = await api<CardItem>('/cards', {
        method: 'POST',
        body: JSON.stringify({
          collectionId: col.id,
          name: trimmed,
          description: null,
          assigneeId: user.id,
        }),
      });
      setInlineAddName('');
      // Optimistically add the card to the list
      setCards((prev) => [card, ...prev]);
      setTotal((t) => t + 1);
      setTotalCount((t) => t + 1);
      inlineAddRef.current?.focus();
      toast.success('Card created', {
        action: { label: 'Open', onClick: () => navigate(`/cards/${card.id}`) },
      });
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Failed to create card');
    } finally {
      setInlineAddSubmitting(false);
    }
  }, [inlineAddName, inlineAddSubmitting, user, collections, navigate]);

  // Close bulk dropdown on outside click
  useEffect(() => {
    if (!bulkActionsOpen) return;
    function handleClick(e: MouseEvent) {
      if (bulkBarRef.current && !bulkBarRef.current.contains(e.target as Node)) {
        setBulkActionsOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bulkActionsOpen]);

  // Clear selection when card list changes
  useEffect(() => {
    setSelectedCardIds(new Set());
  }, [search, tagFilters]);

  const toggleSelectCard = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);


  const handleBulkDelete = useCallback(async () => {
    if (selectedCardIds.size === 0 || bulkProcessing) return;
    const count = selectedCardIds.size;
    const ok = await confirm({
      title: `Delete ${count} card${count !== 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${count} selected card${count !== 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setBulkProcessing(true);
    const ids = [...selectedCardIds];
    const results = await Promise.allSettled(
      ids.map((id) => api(`/cards/${id}`, { method: 'DELETE' })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const deleted = ids.length - failed;
    if (deleted > 0) {
      setCards((prev) => prev.filter((c) => !ids.includes(c.id) || results[ids.indexOf(c.id)]?.status === 'rejected'));
      setTotal((t) => Math.max(0, t - deleted));
      setTotalCount((t) => Math.max(0, t - deleted));
    }
    if (failed > 0) toast.error(`${failed} card${failed !== 1 ? 's' : ''} failed to delete`);
    else toast.success(`${deleted} card${deleted !== 1 ? 's' : ''} deleted`);
    setSelectedCardIds(new Set());
    setBulkProcessing(false);
  }, [selectedCardIds, bulkProcessing, confirm]);

  const activeCards = useMemo(() => {
    let filtered = cards;
    if (tagFilters.size > 0) filtered = filtered.filter((c) => c.tags?.some((t) => tagFilters.has(t.id)));
    return filtered;
  }, [cards, tagFilters]);

  const allVisibleCards = activeCards;
  const quickViewCardIds = useMemo(() => allVisibleCards.map((c) => c.id), [allVisibleCards]);

  // Keyboard navigation: J/K to move, Enter to open quick view, X to toggle complete, Space to select
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (quickViewCardId) return; // don't navigate when quick view is open

      // Ctrl/Cmd+A to select all visible cards
      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && allVisibleCards.length > 0) {
        e.preventDefault();
        if (selectedCardIds.size === allVisibleCards.length) {
          setSelectedCardIds(new Set());
        } else {
          setSelectedCardIds(new Set(allVisibleCards.map((c) => c.id)));
        }
        return;
      }

      // Escape: clear selection first, then clear focus
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedCardIds.size > 0) {
          setSelectedCardIds(new Set());
          setBulkActionsOpen(null);
        } else if (focusedIndex >= 0) {
          setFocusedIndex(-1);
        }
        return;
      }

      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const max = allVisibleCards.length - 1;
          if (max < 0) return -1;
          if (e.key === 'j') return prev < max ? prev + 1 : max;
          return prev > 0 ? prev - 1 : 0;
        });
      } else if (e.key === ' ' && focusedIndex >= 0 && focusedIndex < allVisibleCards.length) {
        // Space to toggle selection of focused card
        e.preventDefault();
        toggleSelectCard(allVisibleCards[focusedIndex].id);
      } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < allVisibleCards.length) {
        e.preventDefault();
        setQuickViewCardId(allVisibleCards[focusedIndex].id);
      } else if (e.key === 'o' && focusedIndex >= 0 && focusedIndex < allVisibleCards.length) {
        e.preventDefault();
        navigate(`/cards/${allVisibleCards[focusedIndex].id}`);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allVisibleCards, focusedIndex, quickViewCardId, navigate, selectedCardIds, toggleSelectCard]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < allVisibleCards.length) {
      const el = cardRowRefs.current.get(allVisibleCards[focusedIndex].id);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, allVisibleCards]);

  // Reset focus when card list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [search, tagFilters]);

  const hasSelection = selectedCardIds.size > 0;

  function renderCardRow(card: CardItem, index: number) {
    const isFocused = focusedIndex === index;
    const isSelected = selectedCardIds.has(card.id);
    return (
      <div
        key={card.id}
        className={`${styles.cardRow}${isFocused ? ` ${styles.cardRowFocused}` : ''}${isSelected ? ` ${styles.cardRowSelected}` : ''}`}
        ref={(el) => { if (el) cardRowRefs.current.set(card.id, el); else cardRowRefs.current.delete(card.id); }}
      >
        <button
          className={`${styles.selectBtn}${hasSelection ? ` ${styles.selectBtnVisible}` : ''}`}
          onClick={() => toggleSelectCard(card.id)}
          title={isSelected ? 'Deselect' : 'Select'}
          aria-label={isSelected ? 'Deselect' : 'Select'}
          tabIndex={-1}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
        <Link
          to={`/cards/${card.id}`}
          className={`${styles.cardItem}${quickViewCardId === card.id ? ` ${styles.cardItemActive}` : ''}`}
          onClick={(e) => openQuickView(e, card.id)}
          tabIndex={-1}
        >
          <div className={styles.cardInfo}>
            <div className={styles.cardName}>
              {highlightMatch(card.name, search)}
            </div>
            {card.description && (
              <div className={styles.cardDesc}>{highlightMatch(stripMarkdown(card.description), search)}</div>
            )}
            {collectionNames.get(card.collectionId) && (
              <div className={styles.cardCollection}>
                <FolderOpen size={11} />
                <span>{collectionNames.get(card.collectionId)}</span>
              </div>
            )}
          </div>
          <div className={styles.cardMeta}>
            {(() => {
              const cl = card.customFields?.checklist as { id: string; text: string; done: boolean }[] | undefined;
              if (!cl || cl.length === 0) return null;
              const done = cl.filter((i) => i.done).length;
              const allDone = done === cl.length;
              return (
                <span
                  className={`${styles.cardChecklist}${allDone ? ` ${styles.cardChecklistComplete}` : ''}`}
                  title={`Checklist: ${done}/${cl.length} done`}
                >
                  <ListChecks size={11} />
                  {done}/{cl.length}
                </span>
              );
            })()}
            {card.tags && card.tags.length > 0 && (
              <div className={styles.cardTagsGroup}>
                {card.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className={styles.cardTagPill}
                    style={{ '--tag-color': tag.color } as React.CSSProperties}
                    title={tag.name}
                  >
                    {tag.name}
                  </span>
                ))}
                {card.tags.length > 2 && (
                  <span className={styles.cardTagMore} title={card.tags.slice(2).map((t) => t.name).join(', ')}>
                    +{card.tags.length - 2}
                  </span>
                )}
              </div>
            )}
            {card.assignee && card.assignee.type === 'agent' && (
              <div className={styles.agentAvatar}>
                <AgentAvatar
                  icon={card.assignee.avatarIcon || 'spark'}
                  bgColor={card.assignee.avatarBgColor || '#1a1a2e'}
                  logoColor={card.assignee.avatarLogoColor || '#e94560'}
                  size={18}
                />
              </div>
            )}
          </div>
        </Link>
      </div>
    );
  }

  const allTags = useMemo(() => {
    const map = new Map<string, CardTag>();
    for (const card of cards) {
      for (const tag of card.tags ?? []) {
        if (!map.has(tag.id)) map.set(tag.id, tag);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cards]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="My Cards"
        description={`${totalCount} card${totalCount !== 1 ? 's' : ''} assigned to you`}
        actions={
          <button
            className={styles.createBtn}
            onClick={() => window.dispatchEvent(new CustomEvent('open-quick-create'))}
            title="Create a new card"
          >
            <Plus size={14} />
            New card
          </button>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search your cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className={styles.tagFiltersRow}>
          <Tag size={12} className={styles.tagFiltersIcon} />
          {allTags.map((tag) => {
            const isActive = tagFilters.has(tag.id);
            return (
              <button
                key={tag.id}
                className={`${styles.tagPill}${isActive ? ` ${styles.tagPillActive}` : ''}`}
                style={{ '--tag-color': tag.color } as React.CSSProperties}
                onClick={() =>
                  setTagFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(tag.id)) next.delete(tag.id);
                    else next.add(tag.id);
                    return next;
                  })
                }
                title={isActive ? `Remove filter: ${tag.name}` : `Filter by: ${tag.name}`}
              >
                {tag.name}
              </button>
            );
          })}
          {tagFilters.size > 0 && (
            <button
              className={styles.tagFiltersClear}
              onClick={() => setTagFilters(new Set())}
              title="Clear tag filters"
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}

      <div className={styles.inlineAddRow}>
        <Plus size={14} className={styles.inlineAddIcon} />
        <input
          ref={inlineAddRef}
          className={styles.inlineAddInput}
          placeholder="Add a card... (press Enter)"
          value={inlineAddName}
          onChange={(e) => setInlineAddName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleInlineAdd();
            }
            if (e.key === 'Escape') {
              setInlineAddName('');
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={inlineAddSubmitting}
        />
        {inlineAddName.trim() && (
          <button
            className={styles.inlineAddSubmit}
            onClick={() => void handleInlineAdd()}
            disabled={inlineAddSubmitting}
          >
            {inlineAddSubmitting ? 'Adding...' : 'Add'}
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          {[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeletonRow} />)}
        </div>
      ) : fetchError ? (
        <div className={styles.emptyState}>
          <AlertTriangle size={32} className={styles.emptyIcon} />
          <div className={styles.emptyTitle}>Failed to load cards</div>
          <div className={styles.emptyDesc}>Something went wrong while fetching your cards.</div>
          <button className={styles.retryBtn} onClick={() => void fetchCards()}>
            <RotateCcw size={14} />
            Try again
          </button>
        </div>
      ) : allVisibleCards.length === 0 ? (
        <div className={styles.emptyState}>
          {tagFilters.size > 0 && !search ? (
            <>
              <Tag size={32} className={styles.emptyIcon} />
              <div className={styles.emptyTitle}>No cards with selected tags</div>
              <button className={styles.emptyClear} onClick={() => setTagFilters(new Set())}>Clear tag filters</button>
            </>
          ) : search ? (
            <>
              <Search size={32} className={styles.emptyIcon} />
              <div className={styles.emptyTitle}>No cards match "{search}"</div>
              <button className={styles.emptyClear} onClick={() => setSearch('')}>Clear search</button>
            </>
          ) : (
            <>
              <FileText size={32} className={styles.emptyIcon} />
              <div className={styles.emptyTitle}>No cards assigned to you</div>
              <div className={styles.emptyDesc}>Cards assigned to you will appear here.</div>
            </>
          )}
        </div>
      ) : (
        <div className={styles.cardsList}>
          {allVisibleCards.map((card, i) => renderCardRow(card, i))}
          {total > PAGE_SIZE && (
            <div className={styles.moreNote}>
              Showing {PAGE_SIZE} of {total} cards. Use search to find specific cards.
            </div>
          )}
        </div>
      )}

      {quickViewCardId && (
        <CardQuickView
          cardId={quickViewCardId}
          onClose={() => setQuickViewCardId(null)}
          onCardUpdated={handleCardUpdated}
          cardIds={quickViewCardIds}
          onNavigate={setQuickViewCardId}
        />
      )}

      {/* Bulk action bar */}
      {selectedCardIds.size > 0 && (
        <div className={styles.bulkBar} ref={bulkBarRef}>
          <div className={styles.bulkBarInner}>
            <button
              className={styles.bulkSelectAll}
              onClick={() => {
                if (selectedCardIds.size === allVisibleCards.length) {
                  setSelectedCardIds(new Set());
                } else {
                  setSelectedCardIds(new Set(allVisibleCards.map((c) => c.id)));
                }
              }}
              title={selectedCardIds.size === allVisibleCards.length ? 'Deselect all' : 'Select all'}
            >
              {selectedCardIds.size === allVisibleCards.length
                ? <CheckSquare size={14} />
                : selectedCardIds.size > 0
                  ? <Minus size={14} />
                  : <Square size={14} />}
            </button>
            <span className={styles.bulkCount}>
              {selectedCardIds.size} selected
            </span>

            <div className={styles.bulkDivider} />

            {/* Delete */}
            <button
              className={`${styles.bulkActionBtn} ${styles.bulkActionBtnDanger}`}
              onClick={() => void handleBulkDelete()}
              disabled={bulkProcessing}
              title="Delete selected cards"
            >
              <Trash2 size={13} />
              Delete
            </button>

            <div className={styles.bulkDivider} />

            <button
              className={styles.bulkClearBtn}
              onClick={() => { setSelectedCardIds(new Set()); setBulkActionsOpen(null); }}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
