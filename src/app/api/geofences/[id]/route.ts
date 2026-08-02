import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireOrg, writeAuditLog } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrg();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await withRetry(() =>
    db.geofence.findFirst({ where: { id, organizationId: user.organizationId! } })
  );
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<{
    name: string;
    description: string;
    lat: number;
    lon: number;
    radiusMeters: number;
    color: string;
    type: string;
    activeFrom: string;
    activeTo: string;
    activeDays: number[];
    isActive: boolean;
  }>;

  const updated = await withRetry(() =>
    db.geofence.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.description != null ? { description: body.description } : {}),
        ...(body.lat != null ? { lat: body.lat } : {}),
        ...(body.lon != null ? { lon: body.lon } : {}),
        ...(body.radiusMeters != null ? { radiusMeters: body.radiusMeters } : {}),
        ...(body.color != null ? { color: body.color } : {}),
        ...(body.type != null ? { type: body.type } : {}),
        ...(body.activeFrom != null ? { activeFrom: body.activeFrom } : {}),
        ...(body.activeTo != null ? { activeTo: body.activeTo } : {}),
        ...(body.activeDays != null ? { activeDays: JSON.stringify(body.activeDays) } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      },
    })
  );

  await writeAuditLog({
    userId: user.id,
    organizationId: user.organizationId!,
    action: "geofence_updated",
    resourceType: "geofence",
    resourceId: id,
    details: `Updated geofence "${updated.name}"`,
  }).catch(() => {});

  return NextResponse.json({
    ...updated,
    activeDays: JSON.parse(updated.activeDays),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrg();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await withRetry(() =>
    db.geofence.findFirst({ where: { id, organizationId: user.organizationId! } })
  );
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await withRetry(() => db.geofence.delete({ where: { id } }));

  await writeAuditLog({
    userId: user.id,
    organizationId: user.organizationId!,
    action: "geofence_deleted",
    resourceType: "geofence",
    resourceId: id,
    details: `Deleted geofence "${existing.name}"`,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
