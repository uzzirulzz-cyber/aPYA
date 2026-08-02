import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createEncodedInvite } from "@/lib/invite-token";
import { generateSarCode } from "@/lib/sar-code";
import { writeAuditLog } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const admin = await requireUser();

    if (admin.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { name, email, phone, role = "investigator" } = (await req.json()) as {
      name: string;
      email: string;
      phone?: string;
      role?: string;
    };

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await withRetry(() => db.user.findUnique({ where: { email: email.toLowerCase() } }));
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 });
    }

    if (!admin.organizationId) {
      return NextResponse.json({ error: "You are not part of an organization" }, { status: 403 });
    }

    const org = await withRetry(() =>
      db.organization.findUnique({ where: { id: admin.organizationId! } })
    );

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Enforce org seat limit
    const currentMembers = await withRetry(() =>
      db.user.count({ where: { organizationId: org.id } })
    );
    if (currentMembers >= org.maxUsers) {
      return NextResponse.json(
        { error: `Seat limit reached (${currentMembers}/${org.maxUsers}). Upgrade your license to add more members.` },
        { status: 403 }
      );
    }

    // Generate the long HMAC token (backwards compat)
    const token = createEncodedInvite({
      orgId: org.id,
      email: email.toLowerCase(),
      name,
      phone,
      role,
    });

    // Generate a unique 12-char SAR code — retry on rare collision
    let sarCode = generateSarCode();
    let attempts = 0;
    while (attempts < 5) {
      const existingCode = await withRetry(() => db.inviteCode.findUnique({ where: { code: sarCode } }));
      if (!existingCode) break;
      sarCode = generateSarCode();
      attempts++;
    }

    // Persist the SAR code → payload mapping
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await withRetry(() =>
      db.inviteCode.create({
        data: {
          organizationId: org.id,
          code: sarCode,
          email: email.toLowerCase(),
          name,
          phone: phone ?? null,
          role,
          createdById: admin.id,
          expiresAt,
        },
      })
    );

    await writeAuditLog({
      userId: admin.id,
      organizationId: org.id,
      action: "invite_code_created",
      resourceType: "invite_code",
      resourceId: sarCode,
      details: `Created SAR invite code ${sarCode} for ${name} <${email}>`,
    }).catch(() => {});

    return NextResponse.json({
      token,
      link: `/activate?token=${encodeURIComponent(token)}`,
      // NEW: 12-char SAR code + shareable link
      sarCode,
      sarLink: `/activate?sar=${sarCode}`,
      fullSarLink: `${typeof req.headers.get("origin") === "string" ? req.headers.get("origin") : ""}/activate?sar=${sarCode}`,
      expiresAt: expiresAt.toISOString(),
      invitee: { name, email, phone, role },
    });
  } catch (err) {
    console.error("[invite] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

// GET /api/invite — list all SAR codes for the org (admin only)
export async function GET() {
  const admin = await requireUser();
  if (admin.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (!admin.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }
  const codes = await withRetry(() =>
    db.inviteCode.findMany({
      where: { organizationId: admin.organizationId! },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        usedBy: { select: { id: true, name: true, email: true } },
      },
    })
  );
  return NextResponse.json(
    codes.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      usedAt: c.usedAt?.toISOString() ?? null,
    }))
  );
}
