import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { normalizeSarCode } from "@/lib/sar-code";

export const dynamic = "force-dynamic";

/**
 * POST /api/invite/redeem
 * Body: { code: "SAR-XXXXXXXX" }
 *
 * Looks up a 12-char SAR invite code, validates it (exists, not expired,
 * not already used), and returns the invite payload so the client can
 * pre-fill the activation form.
 *
 * This endpoint is PUBLIC (no auth required) — the SAR code itself is
 * the secret. It's rate-limited by Vercel's edge network naturally.
 */
export async function POST(req: Request) {
  try {
    const { code } = (await req.json()) as { code: string };

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const normalized = normalizeSarCode(code);
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid code format. Expected SAR-XXXXXXXX (12 characters)." },
        { status: 400 }
      );
    }

    const invite = await withRetry(() =>
      db.inviteCode.findUnique({
        where: { code: normalized },
        include: {
          organization: {
            select: { id: true, name: true, licenseType: true },
          },
        },
      })
    );

    if (!invite) {
      return NextResponse.json({ error: "Code not found" }, { status: 404 });
    }

    if (invite.usedAt) {
      return NextResponse.json(
        { error: "This invite code has already been used.", usedAt: invite.usedAt.toISOString() },
        { status: 410 }
      );
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invite code has expired.", expiredAt: invite.expiresAt.toISOString() },
        { status: 410 }
      );
    }

    // Check if a user with this email already exists (edge case — someone
    // might have been added manually after the code was issued)
    const existingUser = await withRetry(() =>
      db.user.findUnique({ where: { email: invite.email } })
    );
    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists. Contact your administrator." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: invite.code,
      email: invite.email,
      name: invite.name,
      phone: invite.phone,
      role: invite.role,
      organization: invite.organization,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("[invite/redeem] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
