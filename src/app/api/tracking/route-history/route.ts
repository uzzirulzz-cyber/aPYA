import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/tracking/route-history?userId=X&from=ISO&to=ISO
// Returns ordered location pings for a user — used to draw the route polyline
export async function GET(req: Request) {
  const user = await requireOrg();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const pings = await withRetry(() =>
    db.locationPing.findMany({
      where: {
        organizationId: user.organizationId!,
        userId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    })
  );

  return NextResponse.json({
    points: pings.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      accuracy: p.accuracy,
      speed: p.speed,
      heading: p.heading,
      batteryPercent: p.batteryPercent,
      insideGeofenceIds: JSON.parse(p.insideGeofenceIds),
      timestamp: p.createdAt.toISOString(),
    })),
    count: pings.length,
  });
}
