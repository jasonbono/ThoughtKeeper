import { NextRequest, NextResponse } from "next/server";
import { getTrashedThoughts, enrichWithTopics } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const thoughts = getTrashedThoughts(userId);
    return NextResponse.json({ thoughts: enrichWithTopics(thoughts) });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "Failed to fetch trashed thoughts" }, { status: 500 });
  }
}
