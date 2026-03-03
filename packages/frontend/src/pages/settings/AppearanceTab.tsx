import { useState } from 'react';
import { PanelLeftClose, CheckSquare } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import styles from './AppearanceTab.module.css';

type ThemeOption = 'light' | 'dark' | 'system';
const THEME_OPTIONS: { value: ThemeOption; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (val: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle}${checked ? ` ${styles.toggleOn}` : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}

function WindowChrome({ dotColor }: { dotColor: 'light' | 'dark' }) {
  const c = dotColor === 'light'
    ? ['#ff5f57', '#febc2e', '#28c840']
    : ['#ff5f57aa', '#febc2eaa', '#28c840aa'];
  return (
    <div className={styles.windowChrome}>
      <span style={{ background: c[0] }} />
      <span style={{ background: c[1] }} />
      <span style={{ background: c[2] }} />
    </div>
  );
}

function ListItem({ variant }: { variant: 'light' | 'dark' }) {
  return (
    <div className={`${styles.listItem} ${styles[`listItem_${variant}`]}`}>
      <div className={styles.listItemDot} />
      <div className={styles.listItemLines}>
        <div className={styles.listItemTitle} />
        <div className={styles.listItemSub} />
      </div>
    </div>
  );
}

function PreviewScene({ variant }: { variant: 'light' | 'dark' }) {
  return (
    <div className={`${styles.scene} ${styles[`scene_${variant}`]}`}>
      <WindowChrome dotColor={variant} />
      <div className={styles.sceneLayout}>
        <div className={styles.sceneSidebar}>
          <div className={styles.sidebarBlock} />
          <div className={styles.sidebarLine} />
          <div className={`${styles.sidebarLine} ${styles.sidebarLineActive}`} />
          <div className={styles.sidebarLine} />
        </div>
        <div className={styles.sceneContent}>
          <div className={styles.contentHeader}>
            <div className={styles.contentHeaderTitle} />
            <div className={styles.contentHeaderBtn} />
          </div>
          <div className={styles.contentBody}>
            <ListItem variant={variant} />
            <ListItem variant={variant} />
            <ListItem variant={variant} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true',
  );

  const [myCardsHideCompleted, setMyCardsHideCompleted] = useState(
    () => localStorage.getItem('my-cards-page-hide-completed') !== 'false',
  );

  function handleSidebarCollapsed(val: boolean) {
    setSidebarCollapsed(val);
    localStorage.setItem('sidebar-collapsed', String(val));
    window.dispatchEvent(new CustomEvent('sidebar-preference-change', { detail: { collapsed: val } }));
  }

  function handleMyCardsHideCompleted(val: boolean) {
    setMyCardsHideCompleted(val);
    localStorage.setItem('my-cards-page-hide-completed', String(val));
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>Theme</h3>
          <p className={styles.sectionDesc}>Choose how the interface looks to you.</p>
        </div>
        <div className={styles.themeOptions}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                className={`${styles.themeCard}${isActive ? ` ${styles.themeCardActive}` : ''}`}
                onClick={() => setTheme(opt.value)}
                aria-pressed={isActive}
              >
                <div className={styles.themePreview}>
                  {opt.value === 'system' ? (
                    <div className={styles.systemSplit}>
                      <div className={styles.systemHalf}>
                        <PreviewScene variant="light" />
                      </div>
                      <div className={styles.systemHalf}>
                        <PreviewScene variant="dark" />
                      </div>
                    </div>
                  ) : (
                    <PreviewScene variant={opt.value} />
                  )}
                </div>
                <span className={styles.themeLabel}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>Layout</h3>
          <p className={styles.sectionDesc}>Control how the app is laid out by default.</p>
        </div>
        <div className={styles.prefList}>
          <div className={styles.prefRow}>
            <PanelLeftClose size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel} htmlFor="sidebar-collapsed-pref">
              <span className={styles.prefLabelText}>Collapsed sidebar by default</span>
              <span className={styles.prefLabelDesc}>Start with the sidebar collapsed to maximize content area</span>
            </label>
            <Toggle id="sidebar-collapsed-pref" checked={sidebarCollapsed} onChange={handleSidebarCollapsed} />
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>My Cards</h3>
          <p className={styles.sectionDesc}>Default behavior for your personal task view.</p>
        </div>
        <div className={styles.prefList}>
          <div className={styles.prefRow}>
            <CheckSquare size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel} htmlFor="my-cards-hide-completed-pref">
              <span className={styles.prefLabelText}>Hide completed cards by default</span>
              <span className={styles.prefLabelDesc}>Focus on what's left to do; completed cards are hidden on load</span>
            </label>
            <Toggle id="my-cards-hide-completed-pref" checked={myCardsHideCompleted} onChange={handleMyCardsHideCompleted} />
          </div>
        </div>
      </div>
    </div>
  );
}
