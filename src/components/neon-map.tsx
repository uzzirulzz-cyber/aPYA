"use client";

/**
 * NeonMap — real interactive Leaflet map with dark "Midnight Tech" theme.
 *
 * Uses CartoDB Dark Matter tiles (free, no API key) so the map shows REAL
 * streets, buildings, parks, water — not a stylized canvas. All markers,
 * geofences, and routes are real Leaflet layers with custom neon styling.
 *
 * Props:
 *   - markers: Employee/device markers with lat/lon + neon color
 *   - geofences: Circle overlays with radius in meters
 *   - routePoints: Ordered polyline of route history
 *   - focusTarget: { lat, lon, zoom? } to animate to
 *   - onMapClick: (lat, lon) => void — for geofence drawing mode
 *   - drawMode: boolean — cursor becomes crosshair, clicks fire onMapClick
 *   - onMarkerClick: (id) => void
 *   - height: CSS height (default 100%)
 *   - showSearch: boolean — show address search bar (Nominatim geocoding)
 *   - onSearchSelect: (result) => void — fired when user picks a search result
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Input } from "@/components/ui/input";
import { Search, X, Crosshair, MapPin, Radio } from "lucide-react";

// ── Theme tokens (must match EmployeeTrackingView T constant) ─────────────
const NEON = {
  neonBlue: "#3b82f6",
  neonGreen: "#10b981",
  neonAmber: "#f59e0b",
  neonPink: "#ec4899",
  neonCyan: "#06b6d4",
  red: "#ef4444",
};

export interface NeonMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string; // hex
  isSelected?: boolean;
  isPulsing?: boolean;
  battery?: number;
  sublabel?: string;
}

export interface NeonGeofence {
  id: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  color: string;
  name: string;
  isActive: boolean;
}

export interface NeonRoutePoint {
  lat: number;
  lon: number;
}

export interface NeonMapFocus {
  lat: number;
  lon: number;
  zoom?: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  shortName: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

// ── Custom neon div-icon factory ──────────────────────────────────────────
function makeNeonIcon(marker: NeonMarker): L.DivIcon {
  const color = marker.color;
  const isSelected = marker.isSelected;
  const size = isSelected ? 22 : 18;
  const glowSize = isSelected ? 28 : 22;
  const battery = marker.battery;
  const batteryColor = battery == null ? "" : battery > 50 ? NEON.neonGreen : battery > 20 ? NEON.neonAmber : NEON.red;

  // Use SVG for crisp rendering at any zoom
  const html = `
    <div class="neon-marker-wrap" style="position: relative; width: ${glowSize * 2}px; height: ${glowSize * 2}px;">
      <div class="neon-marker-pulse" style="
        position: absolute; inset: 0; border-radius: 50%;
        background: ${color}; opacity: 0.15;
        ${marker.isPulsing ? "animation: neon-pulse 1.5s ease-out infinite;" : ""}
      "></div>
      <div class="neon-marker-glow" style="
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: ${size}px; height: ${size}px; border-radius: 50%;
        background: ${color}; opacity: 0.3;
        box-shadow: 0 0 ${isSelected ? 16 : 10}px ${color}, 0 0 ${isSelected ? 24 : 16}px ${color};
      "></div>
      <div class="neon-marker-core" style="
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: ${isSelected ? 10 : 8}px; height: ${isSelected ? 10 : 8}px;
        border-radius: 50%; background: ${color};
        border: 2px solid #ffffff;
      "></div>
      ${battery != null ? `
        <div style="
          position: absolute; top: -2px; right: -8px;
          font: 9px monospace; color: ${batteryColor};
          background: rgba(13,17,23,0.9); padding: 1px 3px;
          border-radius: 3px; border: 1px solid ${batteryColor}40;
          white-space: nowrap;
        ">${battery}%</div>
      ` : ""}
    </div>
  `;
  return L.divIcon({
    html,
    className: "neon-marker",
    iconSize: [glowSize * 2, glowSize * 2],
    iconAnchor: [glowSize, glowSize],
  });
}

// ── Helper: animate map to a target ───────────────────────────────────────
function FocusController({ focus }: { focus: NeonMapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lon], focus.zoom ?? 14, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [focus, map]);
  return null;
}

// ── Helper: capture map clicks ────────────────────────────────────────────
function ClickController({
  onClick,
  drawMode,
}: {
  onClick: (lat: number, lon: number) => void;
  drawMode: boolean;
}) {
  useMapEvents({
    click(e) {
      if (drawMode) {
        onClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// ── Address search component ──────────────────────────────────────────────
function AddressSearch({
  onSelect,
}: {
  onSelect: (r: GeocodeResult) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string) => {
    if (query.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const d = await res.json();
        setResults(d.results || []);
        setOpen(true);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 400);
  };

  const handleSelect = (r: GeocodeResult) => {
    onSelect(r);
    setQ(r.shortName);
    setOpen(false);
  };

  return (
    <div className="absolute top-3 left-3 z-[1000] w-72">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b949e] pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search address or place..."
          className="h-8 pl-8 pr-8 text-xs bg-[#0d1117]/95 border-[#3b82f6]/40 text-[#f0f6fc] placeholder:text-[#6e7681] backdrop-blur"
          style={{ boxShadow: "0 0 12px rgba(59,130,246,0.2)" }}
        />
        {q && (
          <button
            onClick={() => { setQ(""); setResults([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6e7681] hover:text-[#f0f6fc] cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (results.length > 0 || loading) && (
        <div
          className="mt-1 rounded-md border max-h-72 overflow-y-auto"
          style={{
            backgroundColor: "rgba(13, 17, 23, 0.97)",
            borderColor: "rgba(59, 130, 246, 0.3)",
            backdropFilter: "blur(12px)",
          }}
        >
          {loading && (
            <div className="p-3 text-xs text-[#6e7681] flex items-center gap-2">
              <Radio className="h-3 w-3 animate-spin" /> Searching...
            </div>
          )}
          {!loading && results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 hover:bg-[#3b82f6]/10 cursor-pointer border-b border-[#30363d]/50 last:border-0"
            >
              <div className="text-[11px] font-medium text-[#f0f6fc] truncate flex items-center gap-1.5">
                <MapPin className="h-2.5 w-2.5 text-[#3b82f6] shrink-0" />
                {r.shortName}
              </div>
              <div className="text-[9px] text-[#6e7681] truncate ml-4 font-mono">
                {r.lat.toFixed(4)}°N, {Math.abs(r.lon).toFixed(4)}°{r.lon >= 0 ? "E" : "W"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main NeonMap component ────────────────────────────────────────────────
export interface NeonMapProps {
  markers?: NeonMarker[];
  geofences?: NeonGeofence[];
  routePoints?: NeonRoutePoint[];
  focusTarget?: NeonMapFocus | null;
  onMapClick?: (lat: number, lon: number) => void;
  drawMode?: boolean;
  onMarkerClick?: (id: string) => void;
  height?: string;
  showSearch?: boolean;
  onSearchSelect?: (r: GeocodeResult) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
}

export function NeonMap({
  markers = [],
  geofences = [],
  routePoints = [],
  focusTarget = null,
  onMapClick,
  drawMode = false,
  onMarkerClick,
  height = "100%",
  showSearch = false,
  onSearchSelect,
  initialCenter = [34.1718, 73.2389], // default: Abbottabad (where the test data lives)
  initialZoom = 13,
}: NeonMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div
      className="relative w-full"
      style={{ height, backgroundColor: "#0d1117" }}
    >
      <style>{`
        @keyframes neon-pulse {
          0% { transform: scale(0.8); opacity: 0.4; }
          50% { transform: scale(1.4); opacity: 0.1; }
          100% { transform: scale(0.8); opacity: 0.4; }
        }
        .neon-marker { background: transparent !important; border: none !important; }
        .leaflet-container {
          background: #0d1117 !important;
          font-family: Inter, sans-serif;
        }
        .leaflet-tile {
          filter: brightness(0.85) contrast(1.1);
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(59, 130, 246, 0.4) !important;
          background: rgba(13, 17, 23, 0.92) !important;
          backdrop-filter: blur(8px);
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.2) !important;
        }
        .leaflet-control-zoom a {
          background: transparent !important;
          color: #3b82f6 !important;
          border-bottom: 1px solid rgba(48, 54, 61, 0.8) !important;
          transition: all 0.2s ease;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(59, 130, 246, 0.15) !important;
          color: #f0f6fc !important;
        }
        .leaflet-control-attribution {
          background: rgba(13, 17, 23, 0.85) !important;
          color: #6e7681 !important;
          backdrop-filter: blur(8px);
          border-top-left-radius: 4px;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: #3b82f6 !important;
        }
        .leaflet-popup-content-wrapper {
          background: rgba(13, 17, 23, 0.97) !important;
          color: #f0f6fc !important;
          border: 1px solid rgba(59, 130, 246, 0.4) !important;
          border-radius: 8px !important;
          backdrop-filter: blur(12px);
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.25), 0 8px 32px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-tip {
          background: rgba(13, 17, 23, 0.97) !important;
          border: 1px solid rgba(59, 130, 246, 0.4) !important;
        }
        .leaflet-popup-content {
          margin: 8px 12px !important;
          font-size: 12px !important;
        }
      `}</style>

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        zoomControl={true}
        attributionControl={true}
        className="w-full h-full"
        style={{ height: "100%", cursor: drawMode ? "crosshair" : "grab" }}
        ref={(m) => { mapRef.current = m; }}
      >
        {/* CartoDB Dark Matter tiles — free, no API key, real streets */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />

        {/* Geofences — real Leaflet Circle overlays */}
        {geofences.map((g) => (
          <Circle
            key={g.id}
            center={[g.lat, g.lon]}
            radius={g.radiusMeters}
            pathOptions={{
              color: g.color,
              fillColor: g.color,
              fillOpacity: g.isActive ? 0.12 : 0.04,
              opacity: g.isActive ? 0.8 : 0.3,
              weight: 2,
              dashArray: "8 5",
            }}
            eventHandlers={{
              click: () => onMarkerClick?.(g.id),
            }}
          />
        ))}

        {/* Route history — real Leaflet Polyline on streets */}
        {routePoints.length > 1 && (
          <>
            <Polyline
              positions={routePoints.map((p) => [p.lat, p.lon])}
              pathOptions={{
                color: NEON.neonAmber,
                weight: 5,
                opacity: 0.3,
              }}
            />
            <Polyline
              positions={routePoints.map((p) => [p.lat, p.lon])}
              pathOptions={{
                color: NEON.neonAmber,
                weight: 2.5,
                opacity: 0.9,
              }}
            />
          </>
        )}

        {/* Markers — custom neon div icons */}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lon]}
            icon={makeNeonIcon(m)}
            eventHandlers={{
              click: () => onMarkerClick?.(m.id),
            }}
          >
            {/* Popup with details */}
            <L.Popup>
              <div className="text-[#f0f6fc]">
                <div className="font-semibold text-sm" style={{ color: m.color }}>
                  {m.label}
                </div>
                {m.sublabel && (
                  <div className="text-[10px] text-[#8b949e] mt-0.5">{m.sublabel}</div>
                )}
                <div className="text-[9px] font-mono text-[#6e7681] mt-1">
                  {m.lat.toFixed(6)}°N, {Math.abs(m.lon).toFixed(6)}°{m.lon >= 0 ? "E" : "W"}
                </div>
              </div>
            </L.Popup>
          </Marker>
        ))}

        {/* Focus animation controller */}
        <FocusController focus={focusTarget} />

        {/* Map click controller (for geofence draw mode) */}
        {onMapClick && (
          <ClickController onClick={onMapClick} drawMode={drawMode} />
        )}
      </MapContainer>

      {/* Address search overlay */}
      {showSearch && onSearchSelect && (
        <AddressSearch onSelect={onSearchSelect} />
      )}

      {/* Draw mode indicator */}
      {drawMode && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-1.5 rounded-md text-[11px] font-mono font-medium pointer-events-none"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.5)",
            color: NEON.neonAmber,
            boxShadow: "0 0 16px rgba(245, 158, 11, 0.3)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Crosshair className="h-3 w-3 inline mr-1.5" />
          GEOFENCE PLACEMENT · CLICK MAP
        </div>
      )}
    </div>
  );
}
