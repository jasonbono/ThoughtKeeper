import { NextRequest, NextResponse } from "next/server";
import { getAllThoughts, getAllThoughtsPaginated, getThoughtsForDate, enrichWithTopics } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { validateUserIdStrict, getUserConfig, areTeammates } from "@/lib/users-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const showArchived = searchParams.get("archived") === "true";
    const viewParam = searchParams.get("view");
    const authenticatedUser = getAuthenticatedUser(req);
    // view=all → all users (team-scoped via visibilityClause),
    // view=<userId> → that user (must be teammate), default → authenticated user
    const requestedUser = viewParam === "all" ? undefined : validateUserIdStrict(viewParam);
    const userId = requestedUser
      ? (areTeammates(authenticatedUser, requestedUser) ? requestedUser : authenticatedUser)
      : (viewParam === "all" ? undefined : authenticatedUser);
    // Pass viewer for cross-user visibility filtering
    const viewer = userId !== authenticatedUser ? authenticatedUser : (viewParam === "all" ? authenticatedUser : undefined);
    // If a date is specified, return that day's thoughts (used by external tooling / future export)
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json({ error: "Invalid date format, use YYYY-MM-DD" }, { status: 400 });
      }
      const tz = getUserConfig(authenticatedUser).timezone;
      const thoughts = getThoughtsForDate(dateParam, showArchived, userId, viewer, tz);
      return NextResponse.json(
        { date: dateParam, thoughts: enrichWithTopics(thoughts) },
        { headers: { "Cache-Control": "private, max-age=5" } }
      );
    }

    // Cursor-based pagination: ?limit=50&cursor=<id>
    const limitParam = searchParams.get("limit");
    const cursorParam = searchParams.get("cursor");

    if (limitParam || cursorParam) {
      const limit = Math.min(Math.max(1, Number(limitParam) || 50), 200);
      const { thoughts, nextCursor } = getAllThoughtsPaginated({
        includeArchived: showArchived,
        userId,
        viewer,
        limit,
        cursor: cursorParam,
      });
      return NextResponse.json(
        { thoughts: enrichWithTopics(thoughts), nextCursor },
        { headers: { "Cache-Control": "private, max-age=5" } }
      );
    }

    // Default: return all thoughts (backwards-compatible, no pagination)
    const thoughts = getAllThoughts(showArchived, userId, viewer);
    return NextResponse.json(
      { thoughts: enrichWithTopics(thoughts) },
      { headers: { "Cache-Control": "private, max-age=5" } }
    );
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "Failed to fetch thoughts" }, { status: 500 });
  }
}
