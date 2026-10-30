import { db } from "./db";
import { User } from "./User";

import { getServerSessionOrThrow, NotAuthenticatedError, SessionExpirationSeconds } from "./getSetServerSession";
import { shouldTouchSession } from "./sessionTouch";

const SESSION_CLEANUP_PROBABILITY = 0.01;

export async function getServerUserSession(request: Request) {
  const session = await getServerSessionOrThrow(request);

  // Occasionally clean up expired sessions
  if (Math.random() < SESSION_CLEANUP_PROBABILITY) {
    try {
      await db
        .deleteFrom("sessions")
        .where("expiresAt", "<", new Date())
        .execute();
    } catch (cleanupError) {
      // Log but don't fail the request if cleanup fails
      console.error("Session cleanup error:", cleanupError);
    }
  }

  // Query the sessions and users tables in a single join query
  const results = await db
    .selectFrom("sessions")
    .innerJoin("users", "sessions.userId", "users.id")
    .select([
      "sessions.id as sessionId",
      "sessions.createdAt as sessionCreatedAt",
      "sessions.lastAccessed as sessionLastAccessed",
      "users.id",
      "users.email",
      "users.displayName",
      "users.fullName",
      "users.role",
      "users.avatarUrl",
    ])
    .where("sessions.id", "=", session.id)
    .where("sessions.expiresAt", ">", new Date())
    .limit(1)
    .execute();

  if (results.length === 0) {
    throw new NotAuthenticatedError();
  }

  const result = results[0];
  const user = {
    id: result.id,
    email: result.email,
    displayName: result.displayName,
    fullName: result.fullName,
    avatarUrl: result.avatarUrl,
    role: result.role,
  };

  const now = new Date();
  const shouldTouch = shouldTouchSession({ lastAccessed: result.sessionLastAccessed, now });
  const effectiveLastAccessed = shouldTouch ? now : result.sessionLastAccessed ?? now;
  if (shouldTouch) {
    await db
      .updateTable("sessions")
      .set({ lastAccessed: now, expiresAt: new Date(now.getTime() + SessionExpirationSeconds * 1000) })
      .where("id", "=", session.id)
      .execute();
  }

  return {
    user: user satisfies User,
    // make sure to update the session in cookie
    session: {
      ...session,
      lastAccessed: effectiveLastAccessed,
    },
  };
}
