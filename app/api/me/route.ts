import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserConfig } from "@/lib/users-server";

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUser(req);
    const config = getUserConfig(userId);
    return NextResponse.json({
      userId,
      displayName: config.displayName,
      timezone: config.timezone,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
