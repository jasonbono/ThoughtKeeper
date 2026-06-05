import { getDb } from "@/lib/db";

export function GET() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return Response.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json(
      { status: "error", error: (err as Error).message },
      { status: 503 }
    );
  }
}
