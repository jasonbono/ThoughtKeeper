import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import fs from "fs";
import { setDb as setEmbeddingsDb, ensureEmbeddingsTable, backfillEmbeddings } from "../embeddings";
import { backfillSlimthoughts } from "../classify";

const DB_PATH = path.join(process.cwd(), "data", "captures.db");

let _db: Database.Database | null = null;

// ── Write serializer ──
// SQLite WAL allows concurrent reads but only one writer. This promise chain
// serializes async callers so they wait their turn for the (synchronous) write.
let writeQueue = Promise.resolve();

export function withWriteLock<T>(fn: () => T): Promise<T> {
  const result = writeQueue.then(() => fn());
  writeQueue = result.then(() => {}, () => {});  // swallow errors so chain continues
  return result;
}

/** Returns the singleton database connection. Runs migrations on first call. */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  try {
    sqliteVec.load(db);
  } catch (e) {
    console.warn("sqlite-vec extension not available — semantic search disabled:", (e as Error).message);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      raw_text TEXT NOT NULL,
      title TEXT NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Forward-compatible migrations: add columns that weren't in the original CREATE TABLE
  const cols = (db.prepare("PRAGMA table_info(captures)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes("due_at")) {
    db.exec("ALTER TABLE captures ADD COLUMN due_at TEXT");
  }
  if (!cols.includes("user")) {
    db.exec("ALTER TABLE captures ADD COLUMN user TEXT");
    db.exec("UPDATE captures SET user = 'alex' WHERE user IS NULL");
    db.exec(`UPDATE captures SET format = 'blob' WHERE format IN ('raw_idea', 'decision', 'task', 'todo') AND user = 'alex'`);
  }
  if (!cols.includes("image_data")) {
    db.exec("ALTER TABLE captures ADD COLUMN image_data TEXT");
  }
  if (!cols.includes("trashed")) {
    db.exec("ALTER TABLE captures ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.includes("updated_at")) {
    db.exec("ALTER TABLE captures ADD COLUMN updated_at TEXT");
    db.exec("UPDATE captures SET updated_at = created_at WHERE updated_at IS NULL");
  }
  if (!cols.includes("visibility")) {
    db.exec("ALTER TABLE captures ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
    // Backfill: existing thoughts become shared to preserve current behavior
    db.exec("UPDATE captures SET visibility = 'team'");
  }
  if (!cols.includes("archived_at")) {
    db.exec("ALTER TABLE captures ADD COLUMN archived_at TEXT");
  }
  if (!cols.includes("trashed_at")) {
    db.exec("ALTER TABLE captures ADD COLUMN trashed_at TEXT");
  }
  if (!cols.includes("char_count")) {
    db.exec("ALTER TABLE captures ADD COLUMN char_count INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE captures SET char_count = LENGTH(raw_text)");
  }
  if (!cols.includes("slimthought")) {
    db.exec("ALTER TABLE captures ADD COLUMN slimthought TEXT");
    // Backfill: short thoughts don't need AI summarization
    db.exec("UPDATE captures SET slimthought = raw_text WHERE char_count <= 150");
  }
  if (!cols.includes("snoozed_until")) {
    db.exec("ALTER TABLE captures ADD COLUMN snoozed_until TEXT");
  }

  // ── Rename column: bucket → format ──
  // SQLite supports RENAME COLUMN since 3.25.0 (2018). Safe check first.
  if (cols.includes("bucket")) {
    db.exec("ALTER TABLE captures RENAME COLUMN bucket TO format");
  }

  // ── Rename 'task' → 'todo' (legacy migration, kept for safety) ──
  const taskCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM captures WHERE format = 'task'`
  ).get() as { cnt: number }).cnt;
  if (taskCount > 0) {
    db.exec(`UPDATE captures SET format = 'todo' WHERE format = 'task'`);
  }

  // ── Collapse all formats to 2-format system (todo + capture) ──
  // Everything that isn't "todo" or already "capture" becomes "capture"
  const nonTodoCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM captures WHERE format NOT IN ('todo', 'capture')`
  ).get() as { cnt: number }).cnt;
  if (nonTodoCount > 0) {
    db.exec(`UPDATE captures SET format = 'capture' WHERE format NOT IN ('todo', 'capture')`);
  }

  // ── New tables ──

  // capture_topics join table
  db.exec(`
    CREATE TABLE IF NOT EXISTS capture_topics (
      capture_id TEXT NOT NULL,
      topic_id   TEXT NOT NULL,
      PRIMARY KEY (capture_id, topic_id),
      FOREIGN KEY (capture_id) REFERENCES captures(id)
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_capture_topics_topic ON capture_topics(topic_id)");

  // user_topics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_topics (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    )
  `);


  // feature_requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_requests (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      text       TEXT NOT NULL,
      title      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived   INTEGER NOT NULL DEFAULT 0
    )
  `);

  const frCols = (db.prepare("PRAGMA table_info(feature_requests)").all() as { name: string }[]).map(c => c.name);
  if (!frCols.includes("archived_at")) {
    db.exec("ALTER TABLE feature_requests ADD COLUMN archived_at TEXT");
  }
  if (!frCols.includes("trashed")) {
    db.exec("ALTER TABLE feature_requests ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0");
  }
  if (!frCols.includes("trashed_at")) {
    db.exec("ALTER TABLE feature_requests ADD COLUMN trashed_at TEXT");
  }

  // ── Indexes ──
  db.exec("CREATE INDEX IF NOT EXISTS idx_captures_pagination ON captures(user, trashed, archived, created_at DESC, id DESC)");

  // Share DB connection with embeddings module and ensure table exists
  setEmbeddingsDb(db);
  ensureEmbeddingsTable();

  // Backfill any captures missing embeddings (async, doesn't block startup)
  backfillEmbeddings().catch(e =>
    console.warn("[db] embedding backfill failed:", (e as Error).message)
  );

  // Backfill slimthoughts for long thoughts missing them (async, doesn't block startup)
  backfillSlimthoughts().catch(e =>
    console.warn("[db] slimthought backfill failed:", (e as Error).message)
  );


  // Templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Add visibility column to templates (mirrors captures.visibility)
  const templateCols = (db.prepare("PRAGMA table_info(templates)").all() as { name: string }[]).map(c => c.name);
  if (!templateCols.includes("visibility")) {
    db.exec("ALTER TABLE templates ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
  }

  // Chat usage tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_usage (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      model      TEXT NOT NULL,
      source     TEXT,
      input_tokens      INTEGER NOT NULL,
      output_tokens     INTEGER NOT NULL,
      cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      tool_rounds       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db = db;
  return db;
}
