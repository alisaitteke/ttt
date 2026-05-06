import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getTttHomeDir } from '../../lib/ttt-paths.js';

let instance: DatabaseType | null = null;

export function getDB(): DatabaseType {
  if (instance) return instance;
  const dataDir = getTttHomeDir();
  const dbPath = join(dataDir, 'data.db');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  instance = db;
  return db;
}

export function closeDB(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

function migrate(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      provider    TEXT NOT NULL,
      model       TEXT NOT NULL,
      session_id  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Add tools column if it doesn't exist (idempotent migration)
  const tableInfo = db.pragma('table_info(chats)');
  const hasToolsColumn = (tableInfo as Array<{ name: string }>).some((col) => col.name === 'tools');
  if (!hasToolsColumn) {
    db.exec('ALTER TABLE chats ADD COLUMN tools TEXT');
  }

  const colsAfter = db.pragma('table_info(chats)') as Array<{ name: string }>;
  const hasArchivedColumn = colsAfter.some((col) => col.name === 'archived');
  if (!hasArchivedColumn) {
    db.exec('ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  }
}

export function getDataDir(): string {
  return getTttHomeDir();
}

export function getDBPath(): string {
  return join(getTttHomeDir(), 'data.db');
}
