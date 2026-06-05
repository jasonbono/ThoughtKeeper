import type { Visibility } from "../types";
import { getDb, withWriteLock } from "./connection";

export interface Template {
  id: string;
  user_id: string;
  title: string;
  content: string;
  archived: number;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export function insertTemplate(data: { id: string; user_id: string; title: string; content: string; visibility?: Visibility; created_at: string }): Promise<Template> {
  return withWriteLock(() => {
    const db = getDb();
    db.prepare(
      "INSERT INTO templates (id, user_id, title, content, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(data.id, data.user_id, data.title, data.content, data.visibility ?? "private", data.created_at, data.created_at);
    return db.prepare("SELECT * FROM templates WHERE id = ?").get(data.id) as Template;
  });
}

export function getTemplates(userId: string, includeArchived = false, viewer?: string): Template[] {
  const db = getDb();
  const archivedClause = includeArchived ? "" : " AND archived = 0";
  if (!viewer || viewer === userId) {
    // Own templates only
    return db.prepare(
      `SELECT * FROM templates WHERE user_id = ?${archivedClause} ORDER BY updated_at DESC`
    ).all(userId) as Template[];
  }
  // Cross-user: own templates + shared templates from userId
  return db.prepare(
    `SELECT * FROM templates WHERE (user_id = ? OR (user_id = ? AND visibility = 'team'))${archivedClause} ORDER BY updated_at DESC`
  ).all(viewer, userId) as Template[];
}

/** Get all templates visible to a viewer: own + shared from others. */
export function getAllVisibleTemplates(viewer: string, includeArchived = false): Template[] {
  const db = getDb();
  const archivedClause = includeArchived ? "" : " AND archived = 0";
  return db.prepare(
    `SELECT * FROM templates WHERE (user_id = ? OR visibility = 'team')${archivedClause} ORDER BY updated_at DESC`
  ).all(viewer) as Template[];
}

export function getTemplateById(id: string): Template | null {
  const row = getDb().prepare("SELECT * FROM templates WHERE id = ?").get(id) as Template | undefined;
  return row ?? null;
}

export function updateTemplate(id: string, userId: string, fields: { title?: string; content?: string; visibility?: Visibility }): Promise<Template | null> {
  return withWriteLock(() => {
    const db = getDb();
    const sets: string[] = [];
    const values: string[] = [];
    if (fields.title !== undefined) { sets.push("title = ?"); values.push(fields.title); }
    if (fields.content !== undefined) { sets.push("content = ?"); values.push(fields.content); }
    if (fields.visibility !== undefined) { sets.push("visibility = ?"); values.push(fields.visibility); }
    if (sets.length === 0) return null;
    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    db.prepare(`UPDATE templates SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...values, id, userId);
    return db.prepare("SELECT * FROM templates WHERE id = ? AND user_id = ?").get(id, userId) as Template ?? null;
  });
}

export function archiveTemplate(id: string, userId: string): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare("UPDATE templates SET archived = 1 WHERE id = ? AND user_id = ?").run(id, userId);
  });
}
