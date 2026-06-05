import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getOverdueTodos, getStaleCaptures, getUnscheduledTodos, getDb } from "@/lib/db";
import { findDuplicatePairs } from "@/lib/embeddings";
import type { Thought } from "@/lib/types";

const LIST_COLS =
  "id, raw_text, title, format, created_at, updated_at, due_at, snoozed_until, archived, archived_at, trashed, trashed_at, user, visibility, (image_data IS NOT NULL) AS has_image, char_count, slimthought";

interface OverdueNudge {
  type: "overdue";
  thought: Thought;
  daysOverdue: number;
}

interface StaleNudge {
  type: "stale";
  thought: Thought;
  daysSinceUpdate: number;
}

interface UnscheduledNudge {
  type: "unscheduled";
  thought: Thought;
  daysSinceCreated: number;
}

interface DuplicateNudge {
  type: "duplicate";
  thoughtA: Thought;
  thoughtB: Thought;
  similarity: number;
}

export async function GET(req: NextRequest) {
  let userId;
  try {
    userId = getAuthenticatedUser(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  // Overdue todos
  const overdue: OverdueNudge[] = getOverdueTodos(userId).map((thought) => {
    const dueMs = new Date(thought.due_at!).getTime();
    const daysOverdue = Math.floor((now - dueMs) / (1000 * 60 * 60 * 24));
    return { type: "overdue", thought, daysOverdue };
  });

  // Unscheduled todos (no due date, not snoozed)
  const unscheduled: UnscheduledNudge[] = getUnscheduledTodos(userId).map((thought) => {
    const createdMs = new Date(thought.created_at).getTime();
    const daysSinceCreated = Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));
    return { type: "unscheduled", thought, daysSinceCreated };
  });

  // Stale captures (not updated in 14+ days)
  const stale: StaleNudge[] = getStaleCaptures(userId).map((thought) => {
    const updatedMs = new Date(thought.updated_at ?? thought.created_at).getTime();
    const daysSinceUpdate = Math.floor((now - updatedMs) / (1000 * 60 * 60 * 24));
    return { type: "stale", thought, daysSinceUpdate };
  });

  // Duplicate pairs
  let duplicates: DuplicateNudge[] = [];
  try {
    const pairs = findDuplicatePairs(userId);
    const db = getDb();
    const getListThought = (id: string) =>
      db.prepare(`SELECT ${LIST_COLS} FROM captures WHERE id = ?`).get(id) as Thought | undefined;

    duplicates = pairs
      .map((p) => {
        const a = getListThought(p.idA);
        const b = getListThought(p.idB);
        if (!a || !b) return null;
        return { type: "duplicate" as const, thoughtA: a, thoughtB: b, similarity: p.similarity };
      })
      .filter((n): n is DuplicateNudge => n !== null);
  } catch (e) {
    console.warn("[pulse] duplicate detection failed:", (e as Error).message);
  }

  return NextResponse.json({
    act: [...overdue, ...unscheduled, ...stale],
    think: duplicates,
    counts: {
      overdue: overdue.length,
      unscheduled: unscheduled.length,
      stale: stale.length,
      duplicates: duplicates.length,
      total: overdue.length + unscheduled.length + stale.length + duplicates.length,
    },
  });
}
