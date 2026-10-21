import { jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();
export const MinJwtSecretLength = 32;

const PlaceholderMarkers = ["change-me", "changeme", "not-for-production", "example"];
const KnownPlaceholders = ["development-only-change-me"];

const isPlaceholderSecret = (value: string) => {
  const lower = value.toLowerCase();
  return KnownPlaceholders.includes(lower) || PlaceholderMarkers.some((marker) => lower.includes(marker));
};

/** Fails fast (at module load) when JWT_SECRET is missing, too short or a known placeholder, instead of signing with "undefined" or a public value. */
export function requireJwtSecret(value: string | undefined): string {
  if (!value || value.length < MinJwtSecretLength || isPlaceholderSecret(value))
    throw new Error(
      `JWT_SECRET must be set to a real random secret of at least ${MinJwtSecretLength} characters (got ${value ? value.length : 0}${value && isPlaceholderSecret(value) ? ", looks like a placeholder" : ""}). Generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
    );
  return value;
}

const secret = requireJwtSecret(process.env.JWT_SECRET);

export const SessionExpirationSeconds = 60 * 60 * 24 * 7; // 1 week
// Probability to run cleanup (10%)
export const CleanupProbability = 0.1;

// Only send the ID in the cookie to the client
// We should store id -> user id and user data mapping in our database for max security
export interface Session {
  // this should be a crypto random string
  id: string;
  createdAt: number;
  lastAccessed: number;

  // Whether the user needs to change their password
  // Useful for password reset or setting up new user with initial password
  passwordChangeRequired?: boolean;
}

const CookieName = "hospeda_leads_session";

/** Spanish copy for a missing or expired session; the client keys behaviour off the 401 status, never this text. */
export const SESSION_EXPIRED_SERVER_MESSAGE = "Tu sesión venció. Volvé a ingresar.";

export class NotAuthenticatedError extends Error {
  constructor(message?: string) {
    super(message ?? SESSION_EXPIRED_SERVER_MESSAGE);
    this.name = "NotAuthenticatedError";
  }
}

/**
 * Returns the user session or throw an error. Make sure to handle the error (return a proper request)
 */
export async function getServerSessionOrThrow(
  request: Request
): Promise<Session> {
  // Note: if session is valid, also consider making the cookie rolling by using setSession

  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader
    .split(";")
    .reduce((cookies: Record<string, string>, cookie) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
      return cookies;
    }, {});
  const sessionCookie = cookies[CookieName];

  if (!sessionCookie) {
    throw new NotAuthenticatedError();
  }
  try {
    const { payload } = await jwtVerify(sessionCookie, encoder.encode(secret));
    return {
      id: payload.id as string,
      createdAt: payload.createdAt as number,
      lastAccessed: payload.lastAccessed as number,
      passwordChangeRequired: payload.passwordChangeRequired as boolean,
    };
  } catch (error) {
    throw new NotAuthenticatedError();
  }
}

export async function setServerSession(
  response: Response,
  session: Session
): Promise<void> {
  const token = await new SignJWT({
    id: session.id,
    createdAt: session.createdAt,
    lastAccessed: session.lastAccessed,
    passwordChangeRequired: session.passwordChangeRequired,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(encoder.encode(secret));

  const cookieValue = [
    `${CookieName}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SessionExpirationSeconds}`,
  ].join("; ");

  response.headers.set("Set-Cookie", cookieValue);
}

export function clearServerSession(response: Response) {
  // Clear the session cookie by setting an expired date
  const cookieValue = [
    `${CookieName}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0", // Expire immediately
  ].join("; ");

  response.headers.set("Set-Cookie", cookieValue);
}
