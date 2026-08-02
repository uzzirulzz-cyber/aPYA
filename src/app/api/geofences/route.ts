import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireOrg, writeAuditLog } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/geofences — list all geofences for the org
export async function GET() {
  const user = await requireOrg();
  const geofences = await withRetry(() =>
    db.geofence.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { events: true, timeEntries: true } },
      },
    })
  );
  return NextResponse.json(
    geofences.map((g) => ({
      ...g,
      activeDays: JSON.parse(g.activeDays),
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }))
  );
}

// POST /api/geofences — create a new geofence
export async function POST(req: Request) {
  const user = await requireOrg();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name: string;
    description?: string;
    lat: number;
    lon: number;
    radiusMeters?: number;
    color?: string;
    type?: string;
    activeFrom?: string;
    activeTo?: string;
    activeDays?: number[];
  };

  if (!body.name || typeof body.lat !== "number" || typeof body.lon !== "number") {
    return NextResponse.json({ error: "Name, lat, lon are required" }, { status: 400 });
  }

  const geofence = await withRetry(() =>
    db.geofence.create({
      data: {
        organizationId: user.organizationId!,
        name: body.name,
        description: body.description ?? null,
        lat: body.lat,
        lon: body.lon,
        radiusMeters: body.radiusMeters ?? 100,
        color: body.color ?? "#14b8a6",
        type: body.type ?? "jobsite",
        activeFrom: body.activeFrom ?? null,
        activeTo: body.activeTo ?? null,
        activeDays: JSON.stringify(body.activeDays ?? [1, 2, 3, 4, 5]),
        createdById: user.id,
      },
    })
  );

  await writeAuditLog({
    userId: user.id,
    organizationId: user.organizationId!,
    action: "geofence_created",
    resourceType: "geofence",
    resourceId: geofence.id,
    details: `Created geofence "${geofence.name}" at ${geofence.lat}, ${geofence.lon} (r=${geofence.radiusMeters}m)`,
  }).catch(() => {});

  return NextResponse.json({
    ...geofence,
    activeDays: JSON.parse(geofence.activeDays),
    createdAt: geofence.createdAt.toISOString(),
    updatedAt: geofence.updatedAt.toISOString(),
  });
}
