import { type NextRequest } from "next/server";
import { type UserId, getUserIdByEmail, DEFAULT_USER } from "./users-server";

const CF_EMAIL_HEADER = "cf-access-authenticated-user-email";

/**
 * Extract the authenticated UserId from a Cloudflare Access request.
 * In development (no Cloudflare), falls back to DEFAULT_USER.
 */
export function getAuthenticatedUser(req: NextRequest): UserId {
  const email = req.headers.get(CF_EMAIL_HEADER);
  const userId = getUserIdByEmail(email);
  if (userId) return userId;

  // Local dev fallback — no Cloudflare header present
  if (process.env.NODE_ENV === "development") {
    return DEFAULT_USER;
  }

  throw new Error("Unauthorized: unknown user");
}
