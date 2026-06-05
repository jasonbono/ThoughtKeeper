import { NextRequest, NextResponse } from "next/server";
import { classify } from "@/lib/classify";
import { insertThought } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("text" in body) ||
    typeof (body as Record<string, unknown>).text !== "string"
  ) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const text = ((body as Record<string, unknown>).text as string).trim();
  let userId;
  try {
    userId = getAuthenticatedUser(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed, retryAfter } = checkRateLimit(`capture:${userId}`, 60, 60000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  if (!text) {
    return NextResponse.json({ error: "text cannot be empty" }, { status: 400 });
  }

  if (text.length > 20000) {
    return NextResponse.json({ error: "text exceeds 20000 characters" }, { status: 400 });
  }

  let classification: { format: string; title: string; due_at?: string | null };
  try {
    classification = await classify(text, userId);
  } catch (err) {
    console.error("Classification error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 502 });
  }

  const id = crypto.randomUUID();
  const now = new Date();
  // Client-provided due_at takes priority; otherwise use what Haiku extracted
  const clientDueAt = ((body as Record<string, unknown>).due_at as string | undefined) ?? null;
  const dueAt = clientDueAt || classification.due_at || null;
  const imageData = (body as Record<string, unknown>).image_data as string | undefined;

  if (imageData && imageData.length > 5_000_000) {
    return NextResponse.json({ error: "image_data exceeds 5MB" }, { status: 400 });
  }
  // Derive visibility from mode — server enforces the switch, not the client
  const mode = (body as Record<string, unknown>).mode as string | undefined;
  const visibility = mode === "shared" ? "team" : "private";

  let verified;
  try {
    verified = await insertThought({
      id,
      raw_text: text,
      title: classification.title,
      format: classification.format,
      created_at: now,
      due_at: dueAt,
      user: userId,
      visibility,
      image_data: imageData ?? null,
    });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "Failed to save thought" }, { status: 500 });
  }

  return NextResponse.json({
    thought: {
      id: verified.id,
      title: verified.title,
      format: verified.format,
      visibility: verified.visibility,
      raw_text: verified.raw_text,
      created_at: verified.created_at,
      due_at: verified.due_at,
    },
  });
}
