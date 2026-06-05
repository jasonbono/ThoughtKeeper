import { getDb, withWriteLock } from "./connection";

export interface FeatureRequest {
  id: string;
  user_id: string;
  text: string;
  title: string;
  created_at: string;
  archived: number;
  archived_at: string | null;
  trashed: number;
  trashed_at: string | null;
}

export function insertFeatureRequest(fr: { id: string; user_id: string; text: string; title: string; created_at: string }): Promise<FeatureRequest> {
  return withWriteLock(() => {
    const db = getDb();
    db.prepare(
      "INSERT INTO feature_requests (id, user_id, text, title, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(fr.id, fr.user_id, fr.text, fr.title, fr.created_at);
    return db.prepare("SELECT * FROM feature_requests WHERE id = ?").get(fr.id) as FeatureRequest;
  });
}

export function getFeatureRequestById(id: string): FeatureRequest | null {
  const row = getDb().prepare("SELECT * FROM feature_requests WHERE id = ?").get(id) as FeatureRequest | undefined;
  return row ?? null;
}

export function getFeatureRequests(userId?: string, includeArchived = false): FeatureRequest[] {
  const db = getDb();
  const archivedClause = includeArchived ? "" : "AND archived = 0";
  if (userId) {
    return db.prepare(`SELECT * FROM feature_requests WHERE user_id = ? AND trashed = 0 ${archivedClause} ORDER BY created_at DESC`).all(userId) as FeatureRequest[];
  }
  return db.prepare(`SELECT * FROM feature_requests WHERE trashed = 0 ${archivedClause} ORDER BY created_at DESC`).all() as FeatureRequest[];
}

export function archiveFeatureRequest(id: string, userId: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE feature_requests SET archived = 1, archived_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), id, userId);
  });
}

export function trashFeatureRequest(id: string, userId: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE feature_requests SET trashed = 1, trashed_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), id, userId);
  });
}
