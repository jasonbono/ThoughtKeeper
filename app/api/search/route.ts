import { NextRequest, NextResponse } from "next/server";
import { hybridSearchThoughts, enrichWithTopics } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { validateUserIdStrict, areTeammates } from "@/lib/users-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();
    const showArchived = searchParams.get("archived") === "true";
    const viewParam = searchParams.get("view");
    const authenticatedUser = getAuthenticatedUser(req);
    const requestedUser = viewParam === "all" ? undefined : validateUserIdStrict(viewParam);
    const userId = requestedUser
      ? (areTeammates(authenticatedUser, requestedUser) ? requestedUser : authenticatedUser)
      : (viewParam === "all" ? undefined : authenticatedUser);
    const viewer = userId !== authenticatedUser ? authenticatedUser : (viewParam === "all" ? authenticatedUser : undefined);

    if (!query) {
      return NextResponse.json({ thoughts: [] });
    }

    const limitParam = searchParams.get("limit");
    const searchLimit = limitParam ? Math.min(Math.max(1, Number(limitParam) || 30), 200) : 30;
    const thoughts = await hybridSearchThoughts(query, {
      includeArchived: showArchived,
      userId,
      viewer,
      limit: searchLimit,
    });
    return NextResponse.json({ thoughts: enrichWithTopics(thoughts) });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
