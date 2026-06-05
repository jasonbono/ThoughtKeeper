import { getDb, withWriteLock } from "./connection";

export interface UserTopic {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export function getUserTopics(userId: string): UserTopic[] {
  return getDb().prepare(
    "SELECT * FROM user_topics WHERE user_id = ? ORDER BY sort_order"
  ).all(userId) as UserTopic[];
}

export function getUserTopicsWithCounts(userId: string): (UserTopic & { count: number })[] {
  return getDb().prepare(`
    SELECT ut.*, COALESCE(ct.cnt, 0) AS count
    FROM user_topics ut
    LEFT JOIN (
      SELECT ct2.topic_id, COUNT(*) AS cnt
      FROM capture_topics ct2
      JOIN captures c ON c.id = ct2.capture_id AND c.trashed = 0 AND c.archived = 0
      GROUP BY ct2.topic_id
    ) ct ON ct.topic_id = ut.id
    WHERE ut.user_id = ?
    ORDER BY ut.sort_order
  `).all(userId) as (UserTopic & { count: number })[];
}

export function createUserTopic(userId: string, name: string): Promise<UserTopic> {
  return withWriteLock(() => {
    const db = getDb();
    const id = crypto.randomUUID();
    const maxOrder = (db.prepare(
      "SELECT MAX(sort_order) as mx FROM user_topics WHERE user_id = ?"
    ).get(userId) as { mx: number | null }).mx ?? -1;
    db.prepare(
      "INSERT INTO user_topics (id, user_id, name, sort_order) VALUES (?, ?, ?, ?)"
    ).run(id, userId, name, maxOrder + 1);
    return db.prepare("SELECT * FROM user_topics WHERE id = ?").get(id) as UserTopic;
  });
}

export function deleteUserTopic(id: string): Promise<void> {
  return withWriteLock(() => {
    const db = getDb();
    // Remove all capture_topics references
    db.prepare("DELETE FROM capture_topics WHERE topic_id = ?").run(id);
    db.prepare("DELETE FROM user_topics WHERE id = ?").run(id);
  });
}

export function getTopicsForThought(captureId: string): UserTopic[] {
  return getDb().prepare(
    `SELECT t.* FROM user_topics t
     JOIN capture_topics ct ON ct.topic_id = t.id
     WHERE ct.capture_id = ?
     ORDER BY t.sort_order`
  ).all(captureId) as UserTopic[];
}

/** Batch-fetch topic names for multiple thoughts. Returns map of thoughtId → topic names. */
export function getTopicsForThoughts(captureIds: string[]): Map<string, string[]> {
  if (captureIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = captureIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT ct.capture_id, t.name FROM capture_topics ct
     JOIN user_topics t ON t.id = ct.topic_id
     WHERE ct.capture_id IN (${placeholders})
     ORDER BY t.sort_order`
  ).all(...captureIds) as { capture_id: string; name: string }[];
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const arr = map.get(row.capture_id) ?? [];
    arr.push(row.name);
    map.set(row.capture_id, arr);
  }
  return map;
}

export function setTopicsForThought(captureId: string, topicIds: string[]): Promise<void> {
  return withWriteLock(() => {
    const db = getDb();
    const del = db.prepare("DELETE FROM capture_topics WHERE capture_id = ?");
    const ins = db.prepare("INSERT OR IGNORE INTO capture_topics (capture_id, topic_id) VALUES (?, ?)");
    const update = db.transaction(() => {
      del.run(captureId);
      for (const tid of topicIds) {
        ins.run(captureId, tid);
      }
    });
    update();
  });
}
