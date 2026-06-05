import type { UserId } from "../users";
import type { Thought } from "../types";
import { semanticSearch } from "../embeddings";
import { getDb } from "./connection";
import { userFilter, userParam, visibilityClause } from "./captures";
import { getTopicsForThoughts } from "./topics";

const SELECT_COLS_LIST =
  "id, raw_text, title, format, created_at, updated_at, due_at, snoozed_until, archived, archived_at, trashed, trashed_at, user, visibility, (image_data IS NOT NULL) AS has_image, char_count, slimthought";

/** Escape LIKE wildcards so user input is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export function searchThoughts(query: string, includeArchived = false, userId?: UserId, viewer?: UserId, limit = 20): Thought[] {
  const pattern = `%${escapeLike(query)}%`;
  const archiveClause = includeArchived ? "" : " AND archived = 0";
  const vis = visibilityClause(viewer, userId);
  return getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE (raw_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')${archiveClause} AND trashed = 0${userFilter(userId)}${vis.sql}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, ...userParam(userId), ...vis.params, limit) as Thought[];
}

export function countTextMatches(query: string, includeArchived = false, userId?: UserId, viewer?: UserId): number {
  const pattern = `%${escapeLike(query)}%`;
  const archiveClause = includeArchived ? "" : " AND archived = 0";
  const vis = visibilityClause(viewer, userId);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM captures
       WHERE (raw_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')${archiveClause} AND trashed = 0${userFilter(userId)}${vis.sql}`
    )
    .get(pattern, pattern, ...userParam(userId), ...vis.params) as { cnt: number };
  return row.cnt;
}

export function searchTrashedThoughts(query: string, userId?: UserId): Thought[] {
  const pattern = `%${escapeLike(query)}%`;
  return getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE (raw_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') AND trashed = 1${userFilter(userId)}
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(pattern, pattern, ...userParam(userId)) as Thought[];
}

const RRF_K = 60;

export async function hybridSearchThoughts(
  query: string,
  opts: { includeArchived?: boolean; userId?: UserId; viewer?: UserId; limit?: number } = {}
): Promise<Thought[]> {
  const { includeArchived = false, userId, viewer, limit = 30 } = opts;

  // Quote-aware: "exact phrase" → text-only search, no semantic fuzz
  const exactMatch = query.match(/^"(.+)"$/);
  const searchQuery = exactMatch ? exactMatch[1] : query;

  // Candidate pool should be wider than the output limit so RRF has enough to rank
  const candidateLimit = Math.max(limit * 2, 50);

  // Source 1: Text match (SQL LIKE), ordered by recency
  const textResults = searchThoughts(searchQuery, includeArchived, userId, viewer, candidateLimit);

  // If exact match requested, skip semantic search — return text results only
  if (exactMatch) {
    return textResults.slice(0, limit);
  }

  // Source 2: Semantic match, ordered by similarity
  let semanticIds: { capture_id: string; rank: number }[] = [];
  try {
    const semResults = await semanticSearch(searchQuery, {
      userId,
      includeArchived,
      limit: candidateLimit,
      minScore: 0.2,
      viewer,
    });
    semanticIds = semResults.map((r, i) => ({ capture_id: r.capture_id, rank: i + 1 }));
  } catch {
    // Degrade gracefully if embeddings/OpenAI unavailable
  }

  // Build per-source rank maps
  const textRank = new Map(textResults.map((t, i) => [t.id, i + 1]));
  const semanticRank = new Map(semanticIds.map(r => [r.capture_id, r.rank]));

  const allIds = new Set([...textResults.map(t => t.id), ...semanticIds.map(r => r.capture_id)]);
  if (allIds.size === 0) return [];

  // Fetch full rows for all candidates
  const db = getDb();
  const idsArr = [...allIds];
  const placeholders = idsArr.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT ${SELECT_COLS_LIST} FROM captures WHERE id IN (${placeholders})`)
    .all(...idsArr) as Thought[];

  // Source 3: Recency rank among candidates
  const sorted = [...rows].sort((a, b) => {
    const aD = a.updated_at ?? a.created_at;
    const bD = b.updated_at ?? b.created_at;
    return bD.localeCompare(aD);
  });
  const recencyRank = new Map(sorted.map((t, i) => [t.id, i + 1]));

  // Reciprocal Rank Fusion
  const rrfScores = new Map<string, number>();
  for (const id of allIds) {
    let score = 0;
    if (textRank.has(id)) score += 1 / (RRF_K + textRank.get(id)!);
    if (semanticRank.has(id)) score += 1 / (RRF_K + semanticRank.get(id)!);
    if (recencyRank.has(id)) score += 1 / (RRF_K + recencyRank.get(id)!);
    rrfScores.set(id, score);
  }

  const byId = new Map(rows.map(r => [r.id, r]));
  return [...allIds]
    .sort((a, b) => (rrfScores.get(b) ?? 0) - (rrfScores.get(a) ?? 0))
    .slice(0, limit)
    .map(id => byId.get(id))
    .filter((r): r is Thought => !!r);
}

/** Enrich an array of thoughts with their topic names. */
export function enrichWithTopics<T extends { id: string }>(thoughts: T[]): (T & { topics: string[] })[] {
  const topicMap = getTopicsForThoughts(thoughts.map(t => t.id));
  return thoughts.map(t => ({ ...t, topics: topicMap.get(t.id) ?? [] }));
}
