import { NextRequest, NextResponse } from "next/server";
import { insertTemplate, getAllVisibleTemplates, getTemplateById, updateTemplate, archiveTemplate } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const includeArchived = req.nextUrl.searchParams.get("archived") === "true";
    const templates = getAllVisibleTemplates(userId, includeArchived);
    return NextResponse.json(
      { templates },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (err) {
    console.error("Templates GET error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const body = await req.json();
    const { title, content, mode } = body as { title?: string; content?: string; mode?: string };

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    const visibility = mode === "shared" ? "team" : "private";

    const template = await insertTemplate({
      id: crypto.randomUUID(),
      user_id: userId,
      title: title.trim(),
      content: content.trim(),
      visibility,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ template });
  } catch (err) {
    console.error("Templates POST error:", err);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const body = await req.json();
    const { id, title, content, visibility, mode } = body as {
      id?: string; title?: string; content?: string; visibility?: string; mode?: string;
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = getTemplateById(id);
    if (!existing || existing.user_id !== userId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Handle visibility change with same mode guard as thoughts
    if (visibility !== undefined) {
      if (visibility === "team" && mode !== "shared") {
        return NextResponse.json({ error: "Cannot share while in private mode" }, { status: 403 });
      }
    }

    const fields: { title?: string; content?: string; visibility?: "private" | "team" } = {};
    if (visibility === "private" || visibility === "team") fields.visibility = visibility;
    if (title !== undefined) fields.title = title.trim();
    if (content !== undefined) fields.content = content.trim();

    const updated = await updateTemplate(id, userId, fields);
    if (!updated) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    return NextResponse.json({ updated: true, template: updated });
  } catch (err) {
    console.error("Templates PATCH error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = getTemplateById(id);
    if (!existing || existing.user_id !== userId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await archiveTemplate(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Templates DELETE error:", err);
    return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
  }
}
