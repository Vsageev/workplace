import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export interface TestEnvironment {
  rootDir: string;
  dataDir: string;
  uploadDir: string;
  backupDir: string;
  cleanup: () => void;
}

export function setupTestEnvironment(prefix: string): TestEnvironment {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const dataDir = path.join(rootDir, 'data');
  const uploadDir = path.join(rootDir, 'uploads');
  const backupDir = path.join(rootDir, 'backups');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = dataDir;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.BACKUP_DIR = backupDir;
  process.env.BACKUP_ENABLED = 'false';
  process.env.EMAIL_SYNC_ENABLED = 'false';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret!';
  process.env.CORS_ORIGIN = 'http://localhost:3000';

  return {
    rootDir,
    dataDir,
    uploadDir,
    backupDir,
    cleanup: () => {
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

export async function importFresh<T>(modulePath: string): Promise<T> {
  const href = new URL(modulePath, import.meta.url);
  href.searchParams.set('t', crypto.randomUUID());
  return import(href.href) as Promise<T>;
}
