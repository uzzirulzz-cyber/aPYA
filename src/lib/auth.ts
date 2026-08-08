// FORENSIQ server-side auth helpers — real password-based authentication
// with bcrypt-hashed passwords and HMAC-signed session cookies.
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "forensiq_session";
// NO hardcoded fallback secret — if NEXTAUTH_SECRET is not set, we use an
// empty string which makes all sessions invalid (HMAC will never match).
// This forces the operator to set NEXTAUTH_SECRET for auth to work.
const SESSION_SECRET = process.env.NEXTAUTH_SECRET ?? "";
if (!SESSION_SECRET) {
  console.error(
    "⚠️  NEXTAUTH_SECRET is not set! Session cookies cannot be verified. " +
      "Set NEXTAUTH_SECRET in your environment (use `openssl rand -base64 32`)."
  );
}
const BCRYPT_ROUNDS = 12;

/* ----------------------------- Password hashing ---------------------------- */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/* ------------------------------ Session tokens ----------------------------- */
// Token format: <userId>.<nonce>.<hmac>
// HMAC is computed over `${userId}.${nonce}` with SESSION_SECRET.

function signToken(userId: string, nonce: string): string {
  const mac = createHmac("sha256", SESSION_SECRET)
    .update(`${userId}.${nonce}`)
    .digest("base64url");
  return `${userId}.${nonce}.${mac}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, nonce, mac] = parts;
  const expected = createHmac("sha256", SESSION_SECRET)
    .update(`${userId}.${nonce}`)
    .digest("base64url");
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string) {
  const nonce = randomBytes(24).toString("base64url");
  const token = signToken(userId, nonce);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!user) return null;
  // Update lastActive (non-blocking)
  await db.user
    .update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    })
    .catch(() => {});
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated", 401);
  return user;
}

export async function requireOrg() {
  const user = await requireUser();
  if (!user.organizationId) throw new AuthError("No organization", 403);
  return user;
}

/* --------------------------- Audit log chaining ---------------------------- */
// Tamper-evident: each entry's SHA-256 checksum chains the previous entry's
// checksum + the entry's payload. Any modification breaks the chain.

export async function writeAuditLog(opts: {
  userId: string;
  organizationId: string;
  caseId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
}) {
  const last = await db.auditLog.findFirst({
    where: { organizationId: opts.organizationId },
    orderBy: { createdAt: "desc" },
  });
  const prevChecksum = last?.checksum ?? "GENESIS";
  const payload = `${prevChecksum}|${opts.userId}|${opts.action}|${opts.resourceType}|${opts.resourceId ?? ""}|${opts.details ?? ""}`;
  const checksum = createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  const checksumStr = `fnq_${checksum.slice(0, 16)}`;
  return db.auditLog.create({
    data: {
      userId: opts.userId,
      organizationId: opts.organizationId,
      caseId: opts.caseId,
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      details: opts.details,
      ipAddress: opts.ipAddress,
      checksum: checksumStr,
    },
  });
}

/* ------------------------------ License keys ------------------------------- */
// Real license-key validation. Format: FORENSIQ-YYYY-XXXXXXXX-XXXXXXXX
// Accepts 4+ alphanumeric characters per segment after the year.

export function isValidLicenseFormat(key: string): boolean {
  return /^FORENSIQ-\d{4}-[A-Z0-9]{4,}-[A-Z0-9]{4,}$/.test(key);
}
