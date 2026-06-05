import { NextRequest, NextResponse } from "next/server";
import { insertFeatureRequest, getFeatureRequestById, getFeatureRequests, archiveFeatureRequest, trashFeatureRequest } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { ADMIN_USER } from "@/lib/users";

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const includeArchived = req.nextUrl.searchParams.get("archived") === "true";
    // Only the admin user sees the full list; others see only their own
    const requests = userId === ADMIN_USER
      ? getFeatureRequests(undefined, includeArchived)
      : getFeatureRequests(userId, includeArchived);
    return NextResponse.json({ requests });
  } catch (err) {
    console.error("Feature requests GET error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const body = await req.json();
    const { text, title } = body as { text?: string; title?: string };

    if (!text?.trim() || !title?.trim()) {
      return NextResponse.json({ error: "text and title are required" }, { status: 400 });
    }

    const fr = await insertFeatureRequest({
      id: crypto.randomUUID(),
      user_id: userId,
      text: text.trim(),
      title: title.trim(),
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ request: fr });
  } catch (err) {
    console.error("Feature requests POST error:", err);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const { id, permanent } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const fr = getFeatureRequestById(id);
    if (!fr) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 });
    }
    if (fr.user_id !== userId && userId !== ADMIN_USER) {
      return NextResponse.json({ error: "You can only delete your own feature requests" }, { status: 403 });
    }
    if (permanent) {
      // permanent=true → hard remove (trash), permanent=false → soft remove (archive)
      await trashFeatureRequest(id, fr.user_id);
    } else {
      await archiveFeatureRequest(id, fr.user_id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Feature requests DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
