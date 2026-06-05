import { NextRequest } from "next/server";
import { getThoughtImage, getThoughtById } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  let userId;
  try {
    userId = getAuthenticatedUser(req);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  // Ownership / visibility check
  const thought = getThoughtById(id);
  if (!thought) {
    return new Response("Not found", { status: 404 });
  }
  if (thought.user !== userId && thought.visibility !== "team") {
    return new Response("Not found", { status: 404 });
  }

  const dataUrl = getThoughtImage(id);
  if (!dataUrl) {
    return new Response("No image", { status: 404 });
  }

  // Parse data URL: data:<mediaType>;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return new Response("Invalid image data", { status: 500 });
  }

  const mediaType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  return new Response(buffer, {
    headers: {
      "Content-Type": mediaType,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
