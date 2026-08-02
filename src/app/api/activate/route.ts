import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { decodeInvite } from "@/lib/invite-token";
import { setSessionCookie, hashPassword, writeAuditLog } from "@/lib/auth";
import { normalizeSarCode } from "@/lib/sar-code";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { token, sar, password } = (await req.json()) as {
      token?: string;
      sar?: string;
      password: string;
    };

    if ((!token && !sar) || !password) {
      return NextResponse.json({ error: "Invite token or SAR code, and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Resolve invite payload from either long token OR short SAR code
    let payload: { orgId: string; email: string; name: string; phone?: string; role: string } | null = null;
    let sarCodeRecord: { id: string; code: string } | null = null;

    if (sar) {
      const normalized = normalizeSarCode(sar);
      if (!normalized) {
        return NextResponse.json({ error: "Invalid SAR code format. Expected SAR-XXXXXXXX." }, { status: 400 });
      }
      const record = await withRetry(() =>
        db.inviteCode.findUnique({ where: { code: normalized } })
      );
      if (!record) {
        return NextResponse.json({ error: "SAR code not found" }, { status: 404 });
      }
      if (record.usedAt) {
        return NextResponse.json({ error: "This SAR code has already been used" }, { status: 410 });
      }
      if (record.expiresAt < new Date()) {
        return NextResponse.json({ error: "This SAR code has expired" }, { status: 410 });
      }
      payload = {
        orgId: record.organizationId,
        email: record.email,
        name: record.name,
        phone: record.phone ?? undefined,
        role: record.role,
      };
      sarCodeRecord = { id: record.id, code: record.code };
    } else if (token) {
      payload = decodeInvite(token);
      if (!payload) {
        return NextResponse.json({ error: "Invalid or expired invitation link" }, { status: 400 });
      }
    }

    if (!payload) {
      return NextResponse.json({ error: "Could not resolve invite" }, { status: 400 });
    }

    // Check if user already exists
    const existing = await withRetry(() =>
      db.user.findUnique({ where: { email: payload!.email } })
    );

    if (existing) {
      return NextResponse.json({ error: "This email is already registered" }, { status: 400 });
    }

    // Check organization
    const org = await withRetry(() =>
      db.organization.findUnique({ where: { id: payload!.orgId } })
    );

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Check member limit
    const memberCount = await withRetry(() =>
      db.user.count({ where: { organizationId: org.id } })
    );

    if (memberCount >= org.maxUsers) {
      return NextResponse.json(
        { error: `Organization has reached its ${org.maxUsers}-user limit` },
        { status: 400 }
      );
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await withRetry(() =>
      db.user.create({
        data: {
          email: payload!.email,
          name: payload!.name,
          phone: payload!.phone || null,
          passwordHash,
          role: payload!.role || "investigator",
          organizationId: org.id,
          mfaEnabled: false,
          lastActive: new Date(),
          tokenIdentifier: `email:${payload!.email}`,
        },
        include: { organization: true },
      })
    );

    // Mark SAR code as used (if applicable)
    if (sarCodeRecord) {
      await withRetry(() =>
        db.inviteCode.update({
          where: { id: sarCodeRecord!.id },
          data: {
            usedAt: new Date(),
            usedById: user.id,
          },
        })
      );
      await writeAuditLog({
        userId: user.id,
        organizationId: org.id,
        action: "invite_code_redeemed",
        resourceType: "invite_code",
        resourceId: sarCodeRecord.code,
        details: `User ${user.email} redeemed SAR code ${sarCodeRecord.code}`,
      }).catch(() => {});
    }

    await setSessionCookie(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        organizationId: user.organizationId,
        organization: user.organization
          ? { id: user.organization.id, name: user.organization.name, licenseType: user.organization.licenseType }
          : null,
      },
    });
  } catch (err) {
    console.error("[activate] Error:", err);
    return NextResponse.json(
      { error: "Server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const sar = url.searchParams.get("sar") ?? "";

    // SAR code lookup
    if (sar) {
      const normalized = normalizeSarCode(sar);
      if (!normalized) {
        return NextResponse.json({ error: "Invalid SAR code format" }, { status: 400 });
      }
      const record = await withRetry(() =>
        db.inviteCode.findUnique({
          where: { code: normalized },
          include: {
            organization: { select: { id: true, name: true, licenseKey: true } },
          },
        })
      );
      if (!record) {
        return NextResponse.json({ error: "SAR code not found" }, { status: 404 });
      }
      if (record.usedAt) {
        return NextResponse.json({ error: "This SAR code has already been used" }, { status: 410 });
      }
      if (record.expiresAt < new Date()) {
        return NextResponse.json({ error: "This SAR code has expired" }, { status: 410 });
      }
      return NextResponse.json({
        organization: record.organization,
        invitee: {
          name: record.name,
          email: record.email,
          phone: record.phone,
          role: record.role,
        },
        code: record.code,
        expiresAt: record.expiresAt.toISOString(),
      });
    }

    // Long token lookup (existing behavior)
    if (!token) {
      return NextResponse.json({ error: "Token or SAR code required" }, { status: 400 });
    }

    const payload = decodeInvite(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired invitation link" }, { status: 400 });
    }

    const org = await withRetry(() =>
      db.organization.findUnique({
        where: { id: payload.orgId },
        select: { id: true, name: true, licenseKey: true },
      })
    );

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      organization: org,
      invitee: {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        role: payload.role,
      },
    });
  } catch (err) {
    console.error("[activate-get] Error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
