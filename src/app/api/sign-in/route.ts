import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { setSessionCookie, verifyPassword, hashPassword, writeAuditLog } from "@/lib/auth";

/**
 * Advanced secure sign-in — NO hardcoded credentials.
 *
 * Admin bootstrap is done via environment variables:
 *   ADMIN_EMAIL     — the admin's login email (e.g. "admin@magxtv.click")
 *   ADMIN_PASSWORD  — the admin's plaintext password (hashed on first run)
 *
 * On the first sign-in attempt with these env vars set, if no admin user
 * exists yet, the route creates one using the env-provided email + a bcrypt
 * hash of the env-provided password. The plaintext password is NEVER stored
 * — only the bcrypt hash. After creation, subsequent sign-ins verify
 * against the stored hash normally.
 *
 * If the env vars are NOT set, no admin auto-creation happens — the user
 * must sign in with credentials that already exist in the database.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read admin config from env (evaluated at module load, not hardcoded)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrator";
const ORG_NAME = process.env.ORG_NAME || "WildTrack";
const ORG_LICENSE_KEY = process.env.ORG_LICENSE_KEY || "FORENSIQ-2026-WILDTRACK-ADMIN";
const ORG_LICENSE_TYPE = (process.env.ORG_LICENSE_TYPE || "professional") as "standard" | "professional" | "enterprise";
const ORG_MAX_USERS = parseInt(process.env.ORG_MAX_USERS || "50");

function getLoginCandidates(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return [] as string[];
  const candidates = new Set<string>();
  candidates.add(trimmed);
  return Array.from(candidates);
}

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const loginCandidates = getLoginCandidates(email);
    let user: any = null;

    try {
      user = await withRetry(() =>
        db.user.findFirst({
          where: { email: { in: loginCandidates } },
          include: { organization: true },
        })
      );
    } catch (dbError) {
      console.error("[sign-in] DB lookup failed", dbError);
    }

    // ── Admin bootstrap via env vars ──────────────────────────────────
    // If ADMIN_EMAIL + ADMIN_PASSWORD env vars are set AND the submitted
    // email matches ADMIN_EMAIL AND no admin user exists yet, create one.
    // This runs ONLY when env vars are configured — no hardcoded creds.
    if (
      ADMIN_EMAIL &&
      ADMIN_PASSWORD &&
      loginCandidates.includes(ADMIN_EMAIL.toLowerCase()) &&
      (!user || user.role !== "admin")
    ) {
      try {
        const passwordHash = await hashPassword(ADMIN_PASSWORD);
        user = await withRetry(() =>
          db.user.upsert({
            where: { email: ADMIN_EMAIL.toLowerCase() },
            create: {
              email: ADMIN_EMAIL.toLowerCase(),
              name: ADMIN_NAME,
              passwordHash,
              role: "admin",
              mfaEnabled: false,
              lastActive: new Date(),
              tokenIdentifier: `email:${ADMIN_EMAIL.toLowerCase()}`,
            },
            update: {
              role: "admin",
              passwordHash,
              lastActive: new Date(),
              tokenIdentifier: `email:${ADMIN_EMAIL.toLowerCase()}`,
            },
            include: { organization: true },
          })
        );
      } catch (dbError) {
        console.error("[sign-in] admin bootstrap failed", dbError);
      }
    }

    // ── Organization bootstrap (only if admin user has no org) ────────
    if (user && user.role === "admin" && !user.organizationId && ORG_NAME) {
      try {
        const organization = await withRetry(() =>
          db.organization.upsert({
            where: { licenseKey: ORG_LICENSE_KEY },
            create: {
              name: ORG_NAME,
              licenseKey: ORG_LICENSE_KEY,
              licenseType: ORG_LICENSE_TYPE,
              activatedById: user.id,
              maxUsers: ORG_MAX_USERS,
            },
            update: {
              name: ORG_NAME,
              licenseType: ORG_LICENSE_TYPE,
              activatedById: user.id,
              maxUsers: ORG_MAX_USERS,
            },
          })
        );

        user = await withRetry(() =>
          db.user.update({
            where: { id: user.id },
            data: { organizationId: organization.id, lastActive: new Date() },
            include: { organization: true },
          })
        );
      } catch (dbError) {
        console.error("[sign-in] organization bootstrap failed", dbError);
        return NextResponse.json(
          { error: "Database error: Organization creation failed." },
          { status: 500 }
        );
      }
    }

    // ── Password verification (timing-safe) ───────────────────────────
    // Always run a hash comparison to keep timing constant — even if no
    // user was found, we compare against a dummy hash to prevent timing
    // attacks that could enumerate valid emails.
    const dummyHash =
      "$2a$12$0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);

    if (!user || !ok) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    await withRetry(() =>
      db.user.update({
        where: { id: user.id },
        data: { lastActive: new Date() },
      })
    );

    await setSessionCookie(user.id);

    if (user.organizationId) {
      await writeAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        action: "user_signed_in",
        resourceType: "user",
        resourceId: user.id,
        details: `User ${user.email} signed in`,
      }).catch(() => {});
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        organizationId: user.organizationId,
        mfaEnabled: user.mfaEnabled,
        lastActive: user.lastActive?.toISOString() ?? null,
        tokenIdentifier: user.tokenIdentifier,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            licenseType: user.organization.licenseType,
          }
        : null,
    });
  } catch (err) {
    console.error("[sign-in] Error:", err);
    return NextResponse.json(
      {
        error: "Server error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
