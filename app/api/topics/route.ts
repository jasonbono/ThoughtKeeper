import { NextRequest, NextResponse } from "next/server";
import { getUserTopics, createUserTopic } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const topics = getUserTopics(userId);
    return NextResponse.json(
      { topics: topics.map((t) => ({ id: t.id, name: t.name })) },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "Failed to fetch topics" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const body = await req.json();
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const topic = await createUserTopic(userId, name);
    return NextResponse.json({ topic: { id: topic.id, name: topic.name } });
  } catch (err) {
    console.error("Create topic error:", err);
    return NextResponse.json({ error: "Failed to create topic" }, { status: 500 });
  }
}
