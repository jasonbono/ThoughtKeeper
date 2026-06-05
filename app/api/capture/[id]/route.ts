import { NextRequest, NextResponse } from "next/server";
import { archiveThought, unarchiveThought, trashThought, restoreFromTrash, getThoughtById, updateThought, snoozeThought, getTopicsForThought } from "@/lib/db";
import { classify, generateSlimthought } from "@/lib/classify";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let userId;
  try {
    userId = getAuthenticatedUser(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thought = getThoughtById(id);
  if (!thought) {
    return NextResponse.json({ error: "Thought not found" }, { status: 404 });
  }
  if (thought.user !== userId && thought.visibility !== "team") {
    return NextResponse.json({ error: "Thought not found" }, { status: 404 });
  }

  const topics = getTopicsForThought(id).map((t) => t.name);

  return NextResponse.json({
    thought: {
      id: thought.id,
      raw_text: thought.raw_text,
      title: thought.title,
      format: thought.format,
      visibility: thought.visibility,
      created_at: thought.created_at,
      updated_at: thought.updated_at,
      due_at: thought.due_at,
      snoozed_until: thought.snoozed_until,
      user: thought.user,
      has_image: thought.has_image ?? (thought.image_data ? 1 : 0),
      char_count: thought.char_count,
      slimthought: thought.slimthought,
      topics,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let userId;
  try {
    userId = getAuthenticatedUser(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { archived?: boolean; trashed?: boolean; raw_text?: string; title?: string; due_at?: string | null; snoozed_until?: string | null; visibility?: string; mode?: string; topicIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // no body — treat as no-op
  }

  // Ownership check for mutations
  const existing = getThoughtById(id);
  if (!existing) {
    return NextResponse.json({ error: "Thought not found" }, { status: 404 });
  }
  if (existing.user !== userId) {
    return NextResponse.json({ error: "You can only modify your own thoughts" }, { status: 403 });
  }

  // Handle raw_text update: re-classify and update the capture
  if (body.raw_text !== undefined) {
    const text = body.raw_text.trim();
    if (!text) {
      return NextResponse.json({ error: "raw_text cannot be empty" }, { status: 400 });
    }
    try {
      const classification = await classify(text, userId);
      const updated = await updateThought(id, {
        raw_text: text,
        title: classification.title,
        format: classification.format,
      });
      if (updated) {
        // Regenerate slimthought async for long texts
        if (text.length > 150) {
          generateSlimthought(id, text).catch(err =>
            console.error("[slimthought] regeneration failed:", err)
          );
        }
        return NextResponse.json({
          updated: true,
          thought: {
            saved: true,
            id: updated.id,
            title: updated.title,
            format: updated.format,
            visibility: updated.visibility,
            raw_text: updated.raw_text,
            due_at: updated.due_at,
          },
        });
      }
      return NextResponse.json({ error: "Thought not found" }, { status: 404 });
    } catch (err) {
      console.error("Re-classification error:", err);
      return NextResponse.json({ error: "Failed to re-classify" }, { status: 502 });
    }
  }

  // Handle title-only update (no re-classification needed)
  if (body.title !== undefined && body.raw_text === undefined) {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    const updated = await updateThought(id, { title });
    if (updated) {
      return NextResponse.json({ updated: true });
    }
    return NextResponse.json({ error: "Thought not found" }, { status: 404 });
  }

  try {
    // Handle visibility change
    if (body.visibility !== undefined) {
      const vis = body.visibility;
      if (vis === "team" && body.mode !== "shared") {
        return NextResponse.json({ error: "Cannot share while in private mode" }, { status: 403 });
      }
      if (vis === "private" || vis === "team") {
        await updateThought(id, { visibility: vis });
      }
    }

    // Handle due_at change
    if (body.due_at !== undefined) {
      await updateThought(id, { due_at: body.due_at });
    }

    // Handle snoozed_until change (pulse snooze — doesn't bump updated_at)
    if (body.snoozed_until !== undefined) {
      await snoozeThought(id, body.snoozed_until ?? null);
    }

    if (body.trashed !== undefined) {
      if (body.trashed) {
        await trashThought(id);
      } else {
        await restoreFromTrash(id);
      }
    } else if (body.archived !== undefined) {
      if (body.archived === false) {
        await unarchiveThought(id);
      } else {
        await archiveThought(id);
      }
    }
    if (body.topicIds !== undefined) {
      await updateThought(id, { topicIds: body.topicIds });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Thought update error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
