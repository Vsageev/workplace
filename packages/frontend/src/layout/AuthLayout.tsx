import { Outlet } from 'react-router-dom';
import styles from './AuthLayout.module.css';

const GRID_SIZE = 6;
const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i);

export function AuthLayout() {
  return (
    <div className={styles.layout}>
      <div className={styles.brandPanel}>
        <div className={styles.brandContent}>
          <div className={styles.brandMark}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="14" height="14" rx="3" fill="#FFFFFF" />
              <rect x="18" width="14" height="14" rx="3" fill="rgba(255,255,255,0.25)" />
              <rect y="18" width="14" height="14" rx="3" fill="rgba(255,255,255,0.25)" />
              <rect x="18" y="18" width="14" height="14" rx="3" fill="rgba(255,255,255,0.12)" />
            </svg>
          </div>
          <span className={styles.brandName}>Workspace</span>
        </div>

        <div className={styles.gridContainer}>
          <div className={styles.grid}>
            {cells.map((i) => {
              const row = Math.floor(i / GRID_SIZE);
              const col = i % GRID_SIZE;
              const delay = (row + col) * 0.15;
              return (
                <div
                  key={i}
                  className={styles.cell}
                  style={{ animationDelay: `${delay}s` }}
                />
              );
            })}
          </div>
        </div>

        <div className={styles.brandFooter}>
          <span className={styles.footerText}>Organize. Ship. Repeat.</span>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          <div className={styles.formLogo}>Workspace</div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
