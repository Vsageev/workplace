import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setupTestEnvironment } from '../support/test-env.ts';

const execFileAsync = promisify(execFile);
const env = setupTestEnvironment('backend-e2e-canonical');

test('bootstrap writes canonical workspace records without legacy fields', async () => {
  const packageDir = path.resolve(new URL('../..', import.meta.url).pathname);

  await execFileAsync('node', ['--import', 'tsx', 'src/db/bootstrap.ts'], {
    cwd: packageDir,
    env: {
      ...process.env,
      DATA_DIR: env.dataDir,
      UPLOAD_DIR: env.uploadDir,
      BACKUP_DIR: env.backupDir,
      BACKUP_ENABLED: 'false',
      EMAIL_SYNC_ENABLED: 'false',
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret!',
    },
  });

  const settings = JSON.parse(
    fs.readFileSync(path.join(env.dataDir, 'settings.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;
  const collections = JSON.parse(
    fs.readFileSync(path.join(env.dataDir, 'collections.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;
  const boards = JSON.parse(
    fs.readFileSync(path.join(env.dataDir, 'boards.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;
  const boardColumns = JSON.parse(
    fs.readFileSync(path.join(env.dataDir, 'boardColumns.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;

  const projectSettings = settings.find((entry) => entry.id === 'project');
  assert.ok(projectSettings);
  assert.equal(projectSettings.defaultAgentKeyId, null);
  assert.equal('masterAgentKeyId' in projectSettings, false);

  const generalCollection = collections.find((entry) => entry.isGeneral === true);
  assert.ok(generalCollection);

  const defaultBoard = boards.find((entry) => entry.name === 'auto-dev-cards');
  assert.ok(defaultBoard);
  assert.equal(defaultBoard.defaultCollectionId, generalCollection.id);

  assert.ok(boardColumns.length > 0);
  for (const column of boardColumns) {
    assert.equal('assignAgentId' in column, true);
    assert.equal(column.assignAgentId, null);
  }
});

test.after(() => {
  env.cleanup();
});
