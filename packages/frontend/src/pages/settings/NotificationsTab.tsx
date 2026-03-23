import { useState } from 'react';
import { Bell, BellOff, Bot, CheckCircle2, MessageSquare, Trash2, TriangleAlert } from 'lucide-react';
import {
  areNotificationsEnabled,
  clearNotificationHistory,
  getNotificationPreferences,
  setNotificationPreference,
  setNotificationsEnabled,
} from '../../stores/toast';
import styles from './AppearanceTab.module.css';

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

export function NotificationsTab() {
  const [enabled, setEnabled] = useState(() => areNotificationsEnabled());
  const [preferences, setPreferences] = useState(() => getNotificationPreferences());

  function handleToggle(val: boolean) {
    setEnabled(val);
    setNotificationsEnabled(val);
  }

  function handlePreferenceToggle(key: keyof typeof preferences, value: boolean) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setNotificationPreference(key, value);
  }

  function handleClearHistory() {
    clearNotificationHistory();
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>In-app notifications</h3>
          <p className={styles.sectionDesc}>Control whether toast notifications appear on screen.</p>
        </div>
        <div className={styles.prefList}>
          <div className={styles.prefRow}>
            {enabled ? (
              <Bell size={16} className={styles.prefIcon} />
            ) : (
              <BellOff size={16} className={styles.prefIcon} />
            )}
            <label className={styles.prefLabel} htmlFor="notifications-enabled-pref">
              <span className={styles.prefLabelText}>Show notification toasts</span>
              <span className={styles.prefLabelDesc}>
                {enabled
                  ? 'Notifications appear as pop-ups in the corner of the screen'
                  : 'Notifications are silenced — check the bell icon to review them'}
              </span>
            </label>
            <Toggle id="notifications-enabled-pref" checked={enabled} onChange={handleToggle} />
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>Activity alerts</h3>
          <p className={styles.sectionDesc}>Choose which background events should interrupt you.</p>
        </div>
        <div className={styles.prefList}>
          <div className={styles.prefRow}>
            <CheckCircle2 size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel} htmlFor="notifications-card-work-pref">
              <span className={styles.prefLabelText}>Card work finished</span>
              <span className={styles.prefLabelDesc}>Notify when an agent finishes work on an assigned card</span>
            </label>
            <Toggle
              id="notifications-card-work-pref"
              checked={preferences.cardWorkCompleted}
              onChange={(value) => handlePreferenceToggle('cardWorkCompleted', value)}
            />
          </div>
          <div className={styles.prefRow}>
            <Bot size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel} htmlFor="notifications-chat-runs-pref">
              <span className={styles.prefLabelText}>Chat and scheduled runs</span>
              <span className={styles.prefLabelDesc}>Notify when non-card agent runs finish in the background</span>
            </label>
            <Toggle
              id="notifications-chat-runs-pref"
              checked={preferences.chatRunsCompleted}
              onChange={(value) => handlePreferenceToggle('chatRunsCompleted', value)}
            />
          </div>
          <div className={styles.prefRow}>
            <TriangleAlert size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel} htmlFor="notifications-failures-pref">
              <span className={styles.prefLabelText}>Agent failures</span>
              <span className={styles.prefLabelDesc}>Notify when an agent run ends with an error</span>
            </label>
            <Toggle
              id="notifications-failures-pref"
              checked={preferences.agentRunFailures}
              onChange={(value) => handlePreferenceToggle('agentRunFailures', value)}
            />
          </div>
          <div className={styles.prefRow}>
            <MessageSquare size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel} htmlFor="notifications-inbox-pref">
              <span className={styles.prefLabelText}>Inbox messages</span>
              <span className={styles.prefLabelDesc}>Notify when new unread Inbox messages arrive</span>
            </label>
            <Toggle
              id="notifications-inbox-pref"
              checked={preferences.inboxMessages}
              onChange={(value) => handlePreferenceToggle('inboxMessages', value)}
            />
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.section}>
        <div>
          <h3 className={styles.sectionTitle}>Notification history</h3>
          <p className={styles.sectionDesc}>Manage your stored notification history.</p>
        </div>
        <div className={styles.prefList}>
          <div className={styles.prefRow}>
            <Trash2 size={16} className={styles.prefIcon} />
            <label className={styles.prefLabel}>
              <span className={styles.prefLabelText}>Clear notification history</span>
              <span className={styles.prefLabelDesc}>Remove all notifications from the history panel</span>
            </label>
            <button
              onClick={handleClearHistory}
              style={{
                fontSize: 12,
                padding: '5px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
