import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/location-pings?userId=X&limit=100&since=ISO
export async function GET(req: Request) {
  const user = await requireOrg();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 1000);
  const since = url.searchParams.get("since");

  const pings = await withRetry(() =>
    db.locationPing.findMany({
      where: {
        organizationId: user.organizationId!,
        ...(userId ? { userId } : {}),
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
    })
  );

  return NextResponse.json(
    pings.map((p) => ({
      ...p,
      insideGeofenceIds: JSON.parse(p.insideGeofenceIds),
      createdAt: p.createdAt.toISOString(),
    }))
  );
}

// POST /api/location-pings — submit a location ping (mobile app / auto-capture)
export async function POST(req: Request) {
  const user = await requireOrg();
  const body = (await req.json()) as {
    lat: number;
    lon: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    altitude?: number;
    batteryPercent?: number;
    source?: string;
  };

  if (typeof body.lat !== "number" || typeof body.lon !== "number") {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  // Check which geofences this ping is inside
  const geofences = await withRetry(() =>
    db.geofence.findMany({
      where: { organizationId: user.organizationId!, isActive: true },
    })
  );

  const insideIds: string[] = [];
  for (const g of geofences) {
    const distM = haversineMeters(body.lat, body.lon, g.lat, g.lon);
    if (distM <= g.radiusMeters) {
      insideIds.push(g.id);
    }
  }

  const ping = await withRetry(() =>
    db.locationPing.create({
      data: {
        organizationId: user.organizationId!,
        userId: user.id,
        lat: body.lat,
        lon: body.lon,
        accuracy: body.accuracy ?? null,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        altitude: body.altitude ?? null,
        batteryPercent: body.batteryPercent ?? null,
        source: body.source ?? "mobile_app",
        insideGeofenceIds: JSON.stringify(insideIds),
      },
    })
  );

  // Generate geofence enter events for any new geofence the user just entered
  for (const gId of insideIds) {
    // Look at the last event for this user+geofence — only fire "enter" if previous was "exit" or none
    const lastEvent = await withRetry(() =>
      db.geofenceEvent.findFirst({
        where: { userId: user.id, geofenceId: gId },
        orderBy: { createdAt: "desc" },
      })
    );
    if (!lastEvent || lastEvent.event === "exit") {
      await withRetry(() =>
        db.geofenceEvent.create({
          data: {
            organizationId: user.organizationId!,
            geofenceId: gId,
            userId: user.id,
            event: "enter",
            lat: body.lat,
            lon: body.lon,
          },
        })
      );
    }
  }

  // Generate "exit" events for geofences the user just left
  const previousPing = await withRetry(() =>
    db.locationPing.findFirst({
      where: { userId: user.id, id: { not: ping.id } },
      orderBy: { createdAt: "desc" },
    })
  );
  if (previousPing) {
    const prevInside = JSON.parse(previousPing.insideGeofenceIds) as string[];
    const justLeft = prevInside.filter((id) => !insideIds.includes(id));
    for (const gId of justLeft) {
      await withRetry(() =>
        db.geofenceEvent.create({
          data: {
            organizationId: user.organizationId!,
            geofenceId: gId,
            userId: user.id,
            event: "exit",
            lat: body.lat,
            lon: body.lon,
          },
        })
      );
    }
  }

  return NextResponse.json({
    ...ping,
    insideGeofenceIds: insideIds,
    createdAt: ping.createdAt.toISOString(),
  });
}

// Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
