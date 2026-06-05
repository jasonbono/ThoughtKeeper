import OpenAI from "openai";
import type Database from "better-sqlite3";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./models";
import { withWriteLock } from "./db/connection";

const DIMENSIONS = EMBEDDING_DIMENSIONS;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

// Shared DB connection — set by db.ts via setDb()
let _db: Database.Database | null = null;
export function setDb(db: Database.Database): void {
  _db = db;
}
function getDb(): Database.Database {
  if (!_db) throw new Error("embeddings: DB not initialized — call setDb() first");
  return _db;
}

let _tablesReady = false;

export function ensureEmbeddingsTable(): void {
  if (_tablesReady) return;
  const db = getDb();

  // Legacy metadata table (keeps model + created_at per embedding)
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      capture_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // sqlite-vec virtual table for KNN queries
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
      capture_id TEXT PRIMARY KEY,
      embedding float[${DIMENSIONS}]
    )
  `);

  // One-time migration: copy existing embeddings into vec0 table
  const vecCount = (db.prepare("SELECT COUNT(*) as cnt FROM vec_embeddings").get() as { cnt: number }).cnt;
  const embedCount = (db.prepare("SELECT COUNT(*) as cnt FROM embeddings").get() as { cnt: number }).cnt;

  if (vecCount < embedCount && embedCount > 0) {
    // vec0 doesn't support INSERT OR REPLACE — clear and re-populate
    db.exec("DELETE FROM vec_embeddings");
    const rows = db.prepare("SELECT capture_id, embedding FROM embeddings").all() as { capture_id: string; embedding: Buffer }[];
    const insert = db.prepare("INSERT INTO vec_embeddings (capture_id, embedding) VALUES (?, ?)");
    db.transaction(() => {
      for (const row of rows) {
        insert.run(row.capture_id, row.embedding);
      }
    })();
  }

  _tablesReady = true;
}

// Call OpenAI embedding API
async function embed(text: string): Promise<Float32Array> {
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: DIMENSIONS,
  });
  return new Float32Array(res.data[0].embedding);
}

// Store embedding in both legacy table and vec0 table
function storeEmbedding(thoughtId: string, vec: Float32Array): Promise<void> {
  return withWriteLock(() => {
    ensureEmbeddingsTable();
    const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
    const db = getDb();

    db.prepare(
      `INSERT INTO embeddings (capture_id, embedding, model, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(capture_id) DO UPDATE SET
         embedding = excluded.embedding,
         model = excluded.model,
         created_at = excluded.created_at`
    ).run(thoughtId, buf, EMBEDDING_MODEL, new Date().toISOString());

    // vec0 doesn't support ON CONFLICT — delete then insert inside a transaction
    try {
      db.transaction(() => {
        db.prepare("DELETE FROM vec_embeddings WHERE capture_id = ?").run(thoughtId);
        db.prepare("INSERT INTO vec_embeddings (capture_id, embedding) VALUES (?, ?)").run(thoughtId, buf);
      })();
    } catch (e) {
      console.warn("vec_embeddings write failed (legacy table OK):", (e as Error).message);
    }
  });
}

// Embed and store a thought. Call this on insert and text update.
export async function embedThought(thoughtId: string, text: string, title: string): Promise<void> {
  const combined = `${title}\n\n${text}`;
  const vec = await embed(combined);
  await storeEmbedding(thoughtId, vec);
}

// Delete embedding (e.g. when permanently removing a thought)
export function deleteEmbedding(thoughtId: string): Promise<void> {
  return withWriteLock(() => {
    ensureEmbeddingsTable();
    const db = getDb();
    db.prepare("DELETE FROM embeddings WHERE capture_id = ?").run(thoughtId);
    try {
      db.prepare("DELETE FROM vec_embeddings WHERE capture_id = ?").run(thoughtId);
    } catch {
      // vec0 table may not be available
    }
  });
}

export interface SemanticResult {
  capture_id: string;
  score: number;
}

// Backfill embeddings for captures that are missing them.
// Runs async in the background — call after DB init.
export async function backfillEmbeddings(): Promise<void> {
  ensureEmbeddingsTable();
  const db = getDb();

  const missing = db.prepare(`
    SELECT c.id, c.title, c.raw_text FROM captures c
    LEFT JOIN embeddings e ON e.capture_id = c.id
    WHERE e.capture_id IS NULL AND c.trashed = 0
  `).all() as { id: string; title: string; raw_text: string }[];

  if (missing.length === 0) return;

  console.log(`[embeddings] backfilling ${missing.length} captures...`);
  const BATCH = 20;
  let done = 0;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const texts = batch.map(m => `${m.title}\n\n${m.raw_text}`);
      const res = await getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: DIMENSIONS,
      });

      for (let j = 0; j < batch.length; j++) {
        const vec = new Float32Array(res.data[j].embedding);
        await storeEmbedding(batch[j].id, vec);
      }
      done += batch.length;
    } catch (e) {
      console.warn(`[embeddings] backfill batch failed (done ${done}/${missing.length}):`, (e as Error).message);
      break; // stop on first failure — will retry next restart
    }
  }

  console.log(`[embeddings] backfill complete: ${done}/${missing.length}`);
}

export interface DuplicatePair {
  idA: string;
  idB: string;
  similarity: number;
}

/**
 * Find pairs of active captures that are likely duplicates via embedding similarity.
 * Returns deduplicated pairs sorted by similarity descending.
 */
export function findDuplicatePairs(
  userId: string,
  threshold = 0.85,
  maxPairs = 10
): DuplicatePair[] {
  ensureEmbeddingsTable();
  const db = getDb();

  const captures = db.prepare(`
    SELECT c.id, e.embedding
    FROM captures c
    JOIN embeddings e ON e.capture_id = c.id
    WHERE c.archived = 0 AND c.trashed = 0 AND c.user = ?
  `).all(userId) as { id: string; embedding: Buffer }[];

  if (captures.length < 2) return [];

  // Build set of active IDs to validate matches without re-querying
  const activeIds = new Set(captures.map((c) => c.id));
  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (const cap of captures) {
    let matches: { capture_id: string; distance: number }[];
    try {
      matches = db.prepare(`
        SELECT capture_id, distance
        FROM vec_embeddings
        WHERE embedding MATCH ? AND k = 3
        ORDER BY distance
      `).all(cap.embedding) as { capture_id: string; distance: number }[];
    } catch {
      continue;
    }

    for (const match of matches) {
      if (match.capture_id === cap.id) continue;
      if (!activeIds.has(match.capture_id)) continue;

      const similarity = 1 - match.distance / 2;
      if (similarity < threshold) continue;

      const pairKey = [cap.id, match.capture_id].sort().join("|");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      pairs.push({ idA: cap.id, idB: match.capture_id, similarity });
    }

    // Collect more than needed so we can sort, but stop early if we have plenty
    if (pairs.length >= maxPairs * 3) break;
  }

  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs.slice(0, maxPairs);
}

// Semantic search using sqlite-vec KNN.
// Filters (archived, trashed, user) applied via JOIN after KNN retrieval.
export async function semanticSearch(
  query: string,
  opts: {
    userId?: string;
    viewer?: string;
    includeArchived?: boolean;
    limit?: number;
    minScore?: number;
  } = {}
): Promise<SemanticResult[]> {
  const { userId, viewer, includeArchived = false, limit = 20, minScore = 0.25 } = opts;
  ensureEmbeddingsTable();

  const queryVec = await embed(query);
  const queryBuf = Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength);

  // Over-fetch from vec0 since post-filtering may discard some
  const kFetch = limit * 5;

  const conditions = ["c.trashed = 0"];
  const filterParams: (string | number)[] = [];
  if (!includeArchived) {
    conditions.push("c.archived = 0");
  }
  if (userId) {
    conditions.push("c.user = ?");
    filterParams.push(userId);
  }
  // Visibility filter: when viewer differs from owner, only show shared thoughts
  if (viewer && viewer !== userId) {
    if (userId) {
      // Viewing a specific other user — only shared items
      conditions.push("c.visibility = 'team'");
    } else {
      // View-all — own thoughts + others' shared thoughts
      conditions.push("(c.user = ? OR c.visibility = 'team')");
      filterParams.push(viewer);
    }
  }

  const rows = getDb().prepare(`
    WITH vec_matches AS (
      SELECT capture_id, distance
      FROM vec_embeddings
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    )
    SELECT vm.capture_id, vm.distance
    FROM vec_matches vm
    JOIN captures c ON c.id = vm.capture_id
    WHERE ${conditions.join(" AND ")}
    LIMIT ?
  `).all(queryBuf, kFetch, ...filterParams, limit) as { capture_id: string; distance: number }[];

  // sqlite-vec cosine distance: 0 = identical, 2 = opposite
  // Convert to similarity: score = 1 - (distance / 2)
  return rows
    .map(r => ({ capture_id: r.capture_id, score: 1 - (r.distance / 2) }))
    .filter(r => r.score >= minScore);
}
