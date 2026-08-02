import { NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { requireOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/tracking/summary — full dashboard data in one call
// Returns: latest ping per user, geofences, recent events, open time entries, stats
export async function GET() {
  const user = await requireOrg();

  // 1. All org members
  const members = await withRetry(() =>
    db.user.findMany({
      where: { organizationId: user.organizationId! },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        lastActive: true,
        createdAt: true,
      },
    })
  );

  // 2. Latest location ping per member
  const latestPings: Record<string, any> = {};
  for (const m of members) {
    const ping = await withRetry(() =>
      db.locationPing.findFirst({
        where: { userId: m.id },
        orderBy: { createdAt: "desc" },
      })
    );
    if (ping) {
      latestPings[m.id] = {
        ...ping,
        insideGeofenceIds: JSON.parse(ping.insideGeofenceIds),
        createdAt: ping.createdAt.toISOString(),
      };
    }
  }

  // 3. All geofences
  const geofences = await withRetry(() =>
    db.geofence.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { events: true, timeEntries: true } } },
    })
  );

  // 4. Recent geofence events (last 50)
  const recentEvents = await withRetry(() =>
    db.geofenceEvent.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        geofence: { select: { id: true, name: true, color: true, type: true } },
      },
    })
  );

  // 5. Open time entries
  const openEntries = await withRetry(() =>
    db.timeEntry.findMany({
      where: { organizationId: user.organizationId!, status: "open" },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        geofence: { select: { id: true, name: true } },
      },
    })
  );

  // 6. Today's closed time entries (for hours-worked stats)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayEntries = await withRetry(() =>
    db.timeEntry.findMany({
      where: {
        organizationId: user.organizationId!,
        clockInAt: { gte: startOfDay },
      },
      select: { userId: true, durationSec: true, status: true },
    })
  );

  const totalSecondsToday = todayEntries.reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const hoursByUser: Record<string, number> = {};
  for (const e of todayEntries) {
    hoursByUser[e.userId] = (hoursByUser[e.userId] ?? 0) + (e.durationSec ?? 0);
  }

  return NextResponse.json({
    members: members.map((m) => ({
      ...m,
      lastActive: m.lastActive?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    latestPings,
    geofences: geofences.map((g) => ({
      ...g,
      activeDays: JSON.parse(g.activeDays),
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    recentEvents: recentEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    openEntries: openEntries.map((e) => ({
      ...e,
      clockInAt: e.clockInAt.toISOString(),
      clockOutAt: null,
      createdAt: e.createdAt.toISOString(),
    })),
    stats: {
      totalMembers: members.length,
      trackedMembers: Object.keys(latestPings).length,
      totalGeofences: geofences.length,
      activeGeofences: geofences.filter((g) => g.isActive).length,
      openShifts: openEntries.length,
      totalHoursToday: Math.round((totalSecondsToday / 3600) * 10) / 10,
      hoursByUser,
    },
  });
}
