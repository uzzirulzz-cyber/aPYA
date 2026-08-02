import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireOrg, writeAuditLog } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/time-entries?userId=X&status=open&from=ISO&to=ISO
export async function GET(req: Request) {
  const user = await requireOrg();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const entries = await withRetry(() =>
    db.timeEntry.findMany({
      where: {
        organizationId: user.organizationId!,
        ...(userId ? { userId } : {}),
        ...(status ? { status } : {}),
        ...(from || to
          ? {
              clockInAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { clockInAt: "desc" },
      take: 500,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        geofence: { select: { id: true, name: true, lat: true, lon: true, radiusMeters: true } },
      },
    })
  );

  return NextResponse.json(
    entries.map((e) => ({
      ...e,
      clockInAt: e.clockInAt.toISOString(),
      clockOutAt: e.clockOutAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }))
  );
}

// POST /api/time-entries — clock in or clock out
export async function POST(req: Request) {
  const user = await requireOrg();
  const body = (await req.json()) as {
    action: "clock_in" | "clock_out";
    lat?: number;
    lon?: number;
    photoUrl?: string;
    geofenceId?: string;
    notes?: string;
  };

  if (!body.action || !["clock_in", "clock_out"].includes(body.action)) {
    return NextResponse.json({ error: "action must be clock_in or clock_out" }, { status: 400 });
  }

  if (body.action === "clock_in") {
    // Check for any open time entry — close it first
    const openEntry = await withRetry(() =>
      db.timeEntry.findFirst({
        where: { userId: user.id, organizationId: user.organizationId!, status: "open" },
      })
    );
    if (openEntry) {
      await withRetry(() =>
        db.timeEntry.update({
          where: { id: openEntry.id },
          data: {
            status: "closed",
            clockOutAt: new Date(),
            clockOutLat: body.lat ?? null,
            clockOutLon: body.lon ?? null,
            durationSec: Math.floor((Date.now() - openEntry.clockInAt.getTime()) / 1000),
          },
        })
      );
    }

    const entry = await withRetry(() =>
      db.timeEntry.create({
        data: {
          organizationId: user.organizationId!,
          userId: user.id,
          geofenceId: body.geofenceId ?? null,
          clockInAt: new Date(),
          clockInLat: body.lat ?? null,
          clockInLon: body.lon ?? null,
          clockInPhotoUrl: body.photoUrl ?? null,
          status: "open",
          notes: body.notes ?? null,
        },
      })
    );

    if (body.geofenceId) {
      await withRetry(() =>
        db.geofenceEvent.create({
          data: {
            organizationId: user.organizationId!,
            geofenceId: body.geofenceId!,
            userId: user.id,
            event: "clock_in",
            lat: body.lat ?? 0,
            lon: body.lon ?? 0,
            photoUrl: body.photoUrl ?? null,
          },
        })
      );
    }

    await writeAuditLog({
      userId: user.id,
      organizationId: user.organizationId!,
      action: "clock_in",
      resourceType: "time_entry",
      resourceId: entry.id,
      details: `Clocked in at ${body.lat ?? "?"}, ${body.lon ?? "?"}`,
    }).catch(() => {});

    return NextResponse.json({
      ...entry,
      clockInAt: entry.clockInAt.toISOString(),
      clockOutAt: null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  }

  // clock_out
  const openEntry = await withRetry(() =>
    db.timeEntry.findFirst({
      where: { userId: user.id, organizationId: user.organizationId!, status: "open" },
    })
  );
  if (!openEntry) {
    return NextResponse.json({ error: "No open time entry to clock out" }, { status: 400 });
  }

  const updated = await withRetry(() =>
    db.timeEntry.update({
      where: { id: openEntry.id },
      data: {
        status: "closed",
        clockOutAt: new Date(),
        clockOutLat: body.lat ?? null,
        clockOutLon: body.lon ?? null,
        clockOutPhotoUrl: body.photoUrl ?? null,
        durationSec: Math.floor((Date.now() - openEntry.clockInAt.getTime()) / 1000),
      },
    })
  );

  if (openEntry.geofenceId) {
    await withRetry(() =>
      db.geofenceEvent.create({
        data: {
          organizationId: user.organizationId!,
          geofenceId: openEntry.geofenceId!,
          userId: user.id,
          event: "clock_out",
          lat: body.lat ?? 0,
          lon: body.lon ?? 0,
          photoUrl: body.photoUrl ?? null,
        },
      })
    );
  }

  await writeAuditLog({
    userId: user.id,
    organizationId: user.organizationId!,
    action: "clock_out",
    resourceType: "time_entry",
    resourceId: updated.id,
    details: `Clocked out at ${body.lat ?? "?"}, ${body.lon ?? "?"} (duration=${updated.durationSec}s)`,
  }).catch(() => {});

  return NextResponse.json({
    ...updated,
    clockInAt: updated.clockInAt.toISOString(),
    clockOutAt: updated.clockOutAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}
