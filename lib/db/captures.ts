import type { UserId } from "../users";
import { areTeammates, getAllTeammateIds } from "../users";
import type { Visibility, Thought } from "../types";
import { embedThought, deleteEmbedding } from "../embeddings";
import { generateSlimthought } from "../classify";
import { getDb, withWriteLock } from "./connection";

export type { Visibility, Thought };

const SELECT_COLS =
  "id, raw_text, title, format, created_at, updated_at, due_at, snoozed_until, archived, archived_at, trashed, trashed_at, user, visibility, image_data, char_count, slimthought";

/** List queries: omit image_data blob, add has_image boolean instead. */
const SELECT_COLS_LIST =
  "id, raw_text, title, format, created_at, updated_at, due_at, snoozed_until, archived, archived_at, trashed, trashed_at, user, visibility, (image_data IS NOT NULL) AS has_image, char_count, slimthought";

/** Append ` AND user = ?` when a userId is provided. */
export function userFilter(userId?: UserId): string {
  return userId ? " AND user = ?" : "";
}

/** Return `[userId]` when provided, `[]` otherwise — for spreading into .all(). */
export function userParam(userId?: UserId): UserId[] {
  return userId ? [userId] : [];
}

/**
 * Centralized visibility filter for cross-user queries.
 * Team-aware: only teammates can see each other's shared thoughts.
 * - No viewer or viewer === owner: no visibility filter (user sees all own thoughts)
 * - viewer !== owner but teammates: only 'team' visibility items from that owner
 * - viewer !== owner, not teammates: no results (AND 0)
 * - No owner, has viewer (view-all): viewer's own + teammates' shared thoughts
 */
export function visibilityClause(viewer?: UserId, owner?: UserId): { sql: string; params: (string)[] } {
  if (!viewer || viewer === owner) return { sql: "", params: [] };
  if (owner) {
    // Viewing a specific other user — must be teammates
    if (!areTeammates(viewer, owner)) {
      return { sql: " AND 0", params: [] };
    }
    return { sql: " AND visibility = 'team'", params: [] };
  }
  // No owner (view-all) — own thoughts + teammates' shared thoughts
  const teammates = getAllTeammateIds(viewer);
  if (teammates.length === 0) {
    // Solo user — only own data
    return { sql: " AND user = ?", params: [viewer] };
  }
  const placeholders = teammates.map(() => "?").join(",");
  return {
    sql: ` AND (user = ? OR (user IN (${placeholders}) AND visibility = 'team'))`,
    params: [viewer, ...teammates],
  };
}

export interface ThoughtInsert {
  id: string;
  raw_text: string;
  title: string;
  format: string;
  user: string;
  visibility?: Visibility;
  created_at: Date;
  due_at?: string | null;
  image_data?: string | null;
}

function _insertThought(thought: ThoughtInsert): Thought {
  const db = getDb();
  const createdIso = thought.created_at.toISOString();
  // Short thoughts use raw text verbatim; long thoughts get AI-generated slimthought async
  const slimthought = thought.raw_text.length <= 150 ? thought.raw_text : null;
  db.prepare(
    "INSERT INTO captures (id, raw_text, title, format, created_at, updated_at, due_at, user, visibility, image_data, char_count, slimthought) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    thought.id,
    thought.raw_text,
    thought.title,
    thought.format,
    createdIso,
    createdIso,
    thought.due_at ?? null,
    thought.user,
    thought.visibility ?? "private",
    thought.image_data ?? null,
    thought.raw_text.length,
    slimthought
  );
  const verified = db
    .prepare(`SELECT ${SELECT_COLS} FROM captures WHERE id = ?`)
    .get(thought.id) as Thought | undefined;
  if (!verified) {
    throw new Error(`Insert verification failed: row ${thought.id} not found after write`);
  }
  // Embed asynchronously (don't block the insert)
  embedThought(thought.id, thought.raw_text, verified.title).catch((e) => console.warn("[embed] insert failed:", thought.id, e));
  // Generate slimthought asynchronously for long thoughts
  if (!slimthought) {
    generateSlimthought(thought.id, thought.raw_text).catch((e) => console.warn("[slimthought] generate failed:", thought.id, e));
  }
  return verified;
}

/** Insert a thought, serialized through the write queue. */
export function insertThought(thought: ThoughtInsert): Promise<Thought> {
  return withWriteLock(() => _insertThought(thought));
}

export function archiveThought(id: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE captures SET archived = 1, archived_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  });
}

export function unarchiveThought(id: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE captures SET archived = 0, archived_at = NULL WHERE id = ?").run(id);
  });
}

export function trashThought(id: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE captures SET trashed = 1, trashed_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    deleteEmbedding(id);
  });
}

export function restoreFromTrash(id: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE captures SET trashed = 0, trashed_at = NULL WHERE id = ?").run(id);
    const row = getThoughtById(id);
    if (row) {
      embedThought(row.id, row.raw_text, row.title).catch((e) => console.warn("[embed] restore failed:", row.id, e));
      if (!row.slimthought && row.char_count > 150) {
        generateSlimthought(row.id, row.raw_text).catch((e) => console.warn("[slimthought] restore failed:", row.id, e));
      }
    }
  });
}

export function getTrashedThoughts(userId?: UserId): Thought[] {
  return getDb()
    .prepare(`SELECT ${SELECT_COLS_LIST} FROM captures WHERE trashed = 1${userFilter(userId)} ORDER BY created_at DESC`)
    .all(...userParam(userId)) as Thought[];
}

/**
 * Get thoughts filtered by archived status.
 * includeArchived=false → active only (archived=0)
 * includeArchived=true  → active AND archived
 * @param viewer — the user requesting the data (for cross-user visibility filtering)
 */
export function getAllThoughts(includeArchived = false, userId?: UserId, viewer?: UserId, limit?: number): Thought[] {
  const vis = visibilityClause(viewer, userId);
  const archiveClause = includeArchived ? "" : " AND archived = 0";
  const limitClause = limit ? ` LIMIT ${Number(limit)}` : "";
  return getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE trashed = 0${archiveClause}${userFilter(userId)}${vis.sql}
       ORDER BY COALESCE(updated_at, created_at) DESC${limitClause}`
    )
    .all(...userParam(userId), ...vis.params) as Thought[];
}

export interface PaginatedResult {
  thoughts: Thought[];
  nextCursor: string | null;
}

/**
 * Cursor-based paginated fetch. Sorts by created_at DESC, id DESC.
 * The cursor is the `id` of the last item from the previous page.
 */
export function getAllThoughtsPaginated(
  opts: {
    includeArchived?: boolean;
    userId?: UserId;
    viewer?: UserId;
    limit?: number;
    cursor?: string | null;
  } = {}
): PaginatedResult {
  const { includeArchived = false, userId, viewer, limit = 50, cursor = null } = opts;
  const db = getDb();
  const vis = visibilityClause(viewer, userId);
  const archiveClause = includeArchived ? "" : " AND archived = 0";

  let cursorClause = "";
  const cursorParams: string[] = [];
  if (cursor) {
    // Keyset pagination: created_at DESC, id DESC
    cursorClause = ` AND (created_at < (SELECT created_at FROM captures WHERE id = ?) OR (created_at = (SELECT created_at FROM captures WHERE id = ?) AND id < ?))`;
    cursorParams.push(cursor, cursor, cursor);
  }

  // Fetch limit+1 to know if there are more results
  const fetchLimit = limit + 1;
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE trashed = 0${archiveClause}${userFilter(userId)}${vis.sql}${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...userParam(userId), ...vis.params, ...cursorParams, fetchLimit) as Thought[];

  const hasMore = rows.length > limit;
  const thoughts = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && thoughts.length > 0
    ? thoughts[thoughts.length - 1].id
    : null;

  return { thoughts, nextCursor };
}

/** Count non-trashed thoughts for a user. Excludes archived unless includeArchived is true. */
export function countThoughts(includeArchived = false, userId?: UserId, viewer?: UserId): number {
  const vis = visibilityClause(viewer, userId);
  const archiveClause = includeArchived ? "" : " AND archived = 0";
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM captures
       WHERE trashed = 0${archiveClause}${userFilter(userId)}${vis.sql}`
    )
    .get(...userParam(userId), ...vis.params) as { cnt: number };
  return row.cnt;
}

export function getThoughtById(id: string): Thought | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM captures WHERE id = ?`)
    .get(id) as Thought | undefined;
  return row ?? null;
}

/** Fetch only the image_data blob for a thought. Returns null if not found or no image. */
export function getThoughtImage(id: string): string | null {
  const row = getDb()
    .prepare("SELECT image_data FROM captures WHERE id = ?")
    .get(id) as { image_data: string | null } | undefined;
  return row?.image_data ?? null;
}

function _updateThought(
  id: string,
  fields: { raw_text?: string; title?: string; format?: string; due_at?: string | null; visibility?: Visibility; topicIds?: string[] }
): Thought | null {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | null)[] = [];

  if (fields.raw_text !== undefined) {
    sets.push("raw_text = ?"); values.push(fields.raw_text);
    sets.push("char_count = ?"); values.push(String(fields.raw_text.length));
    sets.push("slimthought = ?"); values.push(fields.raw_text.length <= 150 ? fields.raw_text : null);
  }
  if (fields.title !== undefined) { sets.push("title = ?"); values.push(fields.title); }
  if (fields.format !== undefined) { sets.push("format = ?"); values.push(fields.format); }
  if (fields.due_at !== undefined) { sets.push("due_at = ?"); values.push(fields.due_at ?? null); }
  if (fields.visibility !== undefined) {
    sets.push("visibility = ?"); values.push(fields.visibility);
  }

  const hasColumnUpdates = sets.length > 0;
  const hasTopicUpdates = fields.topicIds !== undefined;

  if (!hasColumnUpdates && !hasTopicUpdates) return null;

  const run = db.transaction(() => {
    if (hasColumnUpdates) {
      // Content edit → bump updated_at
      sets.push("updated_at = ?");
      values.push(new Date().toISOString());
      db.prepare(`UPDATE captures SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
    }

    if (hasTopicUpdates) {
      const del = db.prepare("DELETE FROM capture_topics WHERE capture_id = ?");
      const ins = db.prepare("INSERT OR IGNORE INTO capture_topics (capture_id, topic_id) VALUES (?, ?)");
      del.run(id);
      for (const tid of fields.topicIds!) {
        ins.run(id, tid);
      }
    }
  });
  run();

  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM captures WHERE id = ?`)
    .get(id) as Thought | undefined;
  // Re-embed if text or title changed
  if (row && (fields.raw_text !== undefined || fields.title !== undefined)) {
    embedThought(row.id, row.raw_text, row.title).catch((e) => console.warn("[embed] update failed:", row.id, e));
  }
  // Regenerate slimthought if text changed and is too long for verbatim
  if (row && fields.raw_text !== undefined && fields.raw_text.length > 150) {
    generateSlimthought(row.id, fields.raw_text).catch((e) => console.warn("[slimthought] update failed:", row.id, e));
  }
  return row ?? null;
}

/** Update a thought, serialized through the write queue. */
export function updateThought(
  id: string,
  fields: { raw_text?: string; title?: string; format?: string; due_at?: string | null; visibility?: Visibility; topicIds?: string[] }
): Promise<Thought | null> {
  return withWriteLock(() => _updateThought(id, fields));
}

/**
 * Overdue todos: format='todo', due_at < now, not archived/trashed.
 * Filters in JS (not SQL) because due_at stores ISO with timezone offsets
 * and SQLite string comparison doesn't normalize offsets.
 */
export function getOverdueTodos(userId: UserId): Thought[] {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE format = 'todo'
         AND due_at IS NOT NULL
         AND archived = 0
         AND trashed = 0
         AND user = ?
       ORDER BY due_at ASC`
    )
    .all(userId) as Thought[];
  return rows.filter((r) => new Date(r.due_at!).getTime() < now);
}

/**
 * Stale captures: not archived/trashed, updated_at older than `days` days.
 * Excludes todos (they have their own overdue logic).
 */
export function getStaleCaptures(userId: UserId, days = 14, limit = 20): Thought[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE format != 'todo'
         AND archived = 0
         AND trashed = 0
         AND user = ?
         AND COALESCE(updated_at, created_at) < ?
       ORDER BY COALESCE(updated_at, created_at) ASC
       LIMIT ?`
    )
    .all(userId, cutoff, limit) as Thought[];
}

/**
 * Unscheduled todos: format='todo', no due_at, not snoozed, not archived/trashed.
 * These are todos that have never been given a deadline.
 */
export function getUnscheduledTodos(userId: UserId): Thought[] {
  const now = new Date().toISOString();
  return getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE format = 'todo'
         AND due_at IS NULL
         AND archived = 0
         AND trashed = 0
         AND user = ?
         AND (snoozed_until IS NULL OR snoozed_until <= ?)
       ORDER BY created_at DESC`
    )
    .all(userId, now) as Thought[];
}

/**
 * Snooze a thought until a given time. Pass null to clear. Does NOT bump updated_at.
 */
export function snoozeThought(id: string, until: string | null): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE captures SET snoozed_until = ? WHERE id = ?").run(until, id);
  });
}

// `date` is YYYY-MM-DD interpreted in the given timezone; we convert to UTC bounds for the query.
export function getThoughtsForDate(date: string, includeArchived = false, userId?: UserId, viewer?: UserId, tz = "America/New_York"): Thought[] {
  // Convert wall-clock (h/m/s/ms) in the given timezone to UTC ISO string.
  // Uses a probe (+5h) to find the actual offset via Intl, then applies it.
  // The probe always lands on the correct side of DST transitions.
  const [yr, mo, dy] = date.split("-").map(Number);
  function localToUtc(h: number, m: number, s: number, ms: number): string {
    const probeMs = Date.UTC(yr, mo - 1, dy, h + 5, m, s, 0);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(probeMs));
    const g = (t: string) => +(parts.find(p => p.type === t)?.value ?? "0");
    const localMs = Date.UTC(g("year"), g("month") - 1, g("day"),
      g("hour") === 24 ? 0 : g("hour"), g("minute"), g("second"), 0);
    return new Date(Date.UTC(yr, mo - 1, dy, h, m, s, ms) + (probeMs - localMs)).toISOString();
  }

  const startUtc = localToUtc(0, 0, 0, 0);
  const endUtc   = localToUtc(23, 59, 59, 999);
  const archiveClause = includeArchived ? "" : " AND archived = 0";

  const vis = visibilityClause(viewer, userId);
  return getDb()
    .prepare(
      `SELECT ${SELECT_COLS_LIST} FROM captures
       WHERE created_at >= ? AND created_at <= ?${archiveClause} AND trashed = 0${userFilter(userId)}${vis.sql}
       ORDER BY created_at DESC`
    )
    .all(startUtc, endUtc, ...userParam(userId), ...vis.params) as Thought[];
}
