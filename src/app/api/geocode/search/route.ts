import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/geocode/search?q=<address> — forward geocodes a text query to
// lat/lon using OpenStreetMap Nominatim (free, no API key). Returns up to
// 5 results so the user can pick the best match.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 3) {
    return NextResponse.json({ error: "Query must be at least 3 characters", results: [] }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
      {
        headers: { "User-Agent": "FORENSIQ/4.2.1" },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Geocode search failed", results: [] }, { status: 502 });
    }

    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      type?: string;
      class?: string;
      address?: Record<string, string>;
    }>;

    const results = data.map((r) => {
      const addr = r.address || {};
      const city = addr.city || addr.town || addr.village || addr.hamlet || null;
      const region = addr.state || addr.county || null;
      const country = addr.country || null;
      const road = addr.road || null;
      const shortName = [road, city, region, country].filter(Boolean).join(", ") || r.display_name;
      return {
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        displayName: r.display_name,
        shortName,
        city,
        region,
        country,
        road,
        type: r.type,
        category: r.class,
      };
    });

    return NextResponse.json({ results, query: q });
  } catch {
    return NextResponse.json({ error: "Geocode search failed", results: [] }, { status: 502 });
  }
}
