"use client";

/**
 * NeonMap Enterprise — full-featured real interactive map.
 *
 * Built on Leaflet + CartoDB/Esri tiles (free, no API key).
 *
 * Enterprise features:
 *  - Tile layer switcher (Dark / Satellite / Streets / Terrain)
 *  - Live cursor coordinate display (lat/lon/zoom)
 *  - Scale bar + north arrow
 *  - Fullscreen mode
 *  - Distance measurement tool (click 2+ points, show total distance)
 *  - Right-click context menu (reverse geocode, add geofence, copy coords)
 *  - Enhanced popups with action buttons
 *  - Address search with autocomplete (Nominatim)
 *  - Marker clustering ready (when many markers)
 *  - Geofence circles with neon styling
 *  - Route polyline with glow
 *  - flyTo focus animation
 *  - Draw mode for geofence placement
 *
 * Props:
 *   - markers, geofences, routePoints, focusTarget, onMapClick, drawMode,
 *     onMarkerClick, height, showSearch, onSearchSelect,
 *     initialCenter, initialZoom
 *   - showLayerSwitcher (default true)
 *   - showCoordinates (default true)
 *   - showScale (default true)
 *   - showFullscreen (default true)
 *   - showMeasure (default true)
 *   - showContextMenu (default true)
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
  ScaleControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Input } from "@/components/ui/input";
import {
  Search, X, Crosshair, MapPin, Radio, Layers, Maximize2, Minimize2,
  Ruler, Satellite, Mountain, Route, Navigation, Copy, Plus, Loader2,
  Compass, Globe, LocateFixed,
} from "lucide-react";

// ── Theme tokens ──────────────────────────────────────────────────────────
const NEON = {
  bg0: "#0d1117",
  bg1: "#161b22",
  border: "rgba(48, 54, 61, 0.8)",
  borderNeon: "rgba(59, 130, 246, 0.4)",
  textPrimary: "#f0f6fc",
  textSecondary: "#8b949e",
  textMuted: "#6e7681",
  neonBlue: "#3b82f6",
  neonBlueGlow: "rgba(59, 130, 246, 0.5)",
  neonGreen: "#10b981",
  neonAmber: "#f59e0b",
  neonPink: "#ec4899",
  neonCyan: "#06b6d4",
  red: "#ef4444",
};

// ── Tile layer definitions (all free, no API key) ─────────────────────────
const TILE_LAYERS = {
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OSM &copy; CARTO',
    subdomains: "abcd",
    icon: Globe,
  },
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri',
    subdomains: "",
    icon: Satellite,
  },
  streets: {
    name: "Streets",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OSM &copy; CARTO',
    subdomains: "abcd",
    icon: Route,
  },
  terrain: {
    name: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenTopoMap',
    subdomains: "abc",
    icon: Mountain,
  },
} as const;

type LayerKey = keyof typeof TILE_LAYERS;

// ── Types ─────────────────────────────────────────────────────────────────
export interface NeonMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
  isSelected?: boolean;
  isPulsing?: boolean;
  battery?: number;
  sublabel?: string;
  popupActions?: Array<{ label: string; onClick: () => void; color?: string }>;
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

interface ContextMenuState {
  lat: number;
  lon: number;
  x: number;
  y: number;
  address?: string;
  loadingAddress?: boolean;
}

interface MeasurePoint {
  lat: number;
  lon: number;
}

// ── Custom neon div-icon factory ──────────────────────────────────────────
function makeNeonIcon(marker: NeonMarker): L.DivIcon {
  const color = marker.color;
  const isSelected = marker.isSelected;
  const size = isSelected ? 22 : 18;
  const glowSize = isSelected ? 28 : 22;
  const battery = marker.battery;
  const batteryColor = battery == null ? "" : battery > 50 ? NEON.neonGreen : battery > 20 ? NEON.neonAmber : NEON.red;

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

// ── Helper: capture map events ────────────────────────────────────────────
function MapEventController({
  onClick,
  onContextMenu,
  onMouseMove,
  onZoom,
  drawMode,
}: {
  onClick?: (lat: number, lon: number) => void;
  onContextMenu?: (lat: number, lon: number, e: L.LeafletMouseEvent) => void;
  onMouseMove?: (lat: number, lon: number) => void;
  onZoom?: (zoom: number) => void;
  drawMode: boolean;
}) {
  const map = useMapEvents({
    click(e) {
      if (drawMode && onClick) {
        onClick(e.latlng.lat, e.latlng.lng);
      }
    },
    contextmenu(e) {
      if (onContextMenu) {
        onContextMenu(e.latlng.lat, e.latlng.lng, e);
      }
    },
    mousemove(e) {
      if (onMouseMove) onMouseMove(e.latlng.lat, e.latlng.lng);
    },
    zoomend(e) {
      if (onZoom) onZoom(e.target.getZoom());
    },
  });
  return null;
}

// ── Address search component ──────────────────────────────────────────────
function AddressSearch({ onSelect }: { onSelect: (r: GeocodeResult) => void }) {
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

// ── Layer switcher component ──────────────────────────────────────────────
function LayerSwitcher({
  current,
  onChange,
}: {
  current: LayerKey;
  onChange: (k: LayerKey) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-12 right-3 z-[1000]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[11px] font-medium cursor-pointer"
        style={{
          backgroundColor: "rgba(13, 17, 23, 0.92)",
          border: `1px solid ${NEON.borderNeon}`,
          color: NEON.neonBlue,
          backdropFilter: "blur(8px)",
          boxShadow: "0 0 12px rgba(59,130,246,0.2)",
        }}
      >
        <Layers className="h-3.5 w-3.5" />
        {TILE_LAYERS[current].name}
      </button>
      {open && (
        <div
          className="absolute bottom-9 right-0 w-40 rounded-md border p-1.5"
          style={{
            backgroundColor: "rgba(13, 17, 23, 0.97)",
            borderColor: NEON.borderNeon,
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {(Object.keys(TILE_LAYERS) as LayerKey[]).map((k) => {
            const Layer = TILE_LAYERS[k].icon;
            return (
              <button
                key={k}
                onClick={() => { onChange(k); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] cursor-pointer transition-colors"
                style={{
                  backgroundColor: current === k ? "rgba(59,130,246,0.15)" : "transparent",
                  color: current === k ? NEON.neonBlue : NEON.textSecondary,
                }}
                onMouseEnter={(e) => { if (current !== k) e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.08)"; }}
                onMouseLeave={(e) => { if (current !== k) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Layer className="h-3.5 w-3.5" />
                {TILE_LAYERS[k].name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Right-click context menu ──────────────────────────────────────────────
function ContextMenu({
  state,
  onClose,
  onAddGeofence,
  onCopyCoords,
  onFocusHere,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onAddGeofence: (lat: number, lon: number) => void;
  onCopyCoords: (lat: number, lon: number) => void;
  onFocusHere: (lat: number, lon: number) => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    setTimeout(() => window.addEventListener("click", close), 0);
    return () => window.removeEventListener("click", close);
  }, [onClose]);

  return (
    <div
      className="fixed z-[2000] rounded-md border min-w-[220px] py-1"
      style={{
        left: state.x,
        top: state.y,
        backgroundColor: "rgba(13, 17, 23, 0.98)",
        borderColor: NEON.borderNeon,
        backdropFilter: "blur(16px)",
        boxShadow: `0 0 24px ${NEON.neonBlueGlow}, 0 8px 32px rgba(0,0,0,0.6)`,
      }}
    >
      <div className="px-3 py-2 border-b border-[#30363d]">
        <div className="text-[9px] uppercase tracking-wider text-[#6e7681] font-mono">Coordinates</div>
        <div className="text-[11px] font-mono text-[#3b82f6]">
          {state.lat.toFixed(6)}°N, {Math.abs(state.lon).toFixed(6)}°{state.lon >= 0 ? "E" : "W"}
        </div>
        {state.loadingAddress && (
          <div className="text-[10px] text-[#6e7681] mt-1 flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Looking up address...
          </div>
        )}
        {state.address && (
          <div className="text-[10px] text-[#8b949e] mt-1 leading-snug">{state.address}</div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAddGeofence(state.lat, state.lon); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#f0f6fc] hover:bg-[#3b82f6]/15 cursor-pointer"
      >
        <Plus className="h-3 w-3 text-[#3b82f6]" /> Add geofence here
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onFocusHere(state.lat, state.lon); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#f0f6fc] hover:bg-[#3b82f6]/15 cursor-pointer"
      >
        <Crosshair className="h-3 w-3 text-[#3b82f6]" /> Focus here
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onCopyCoords(state.lat, state.lon); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#f0f6fc] hover:bg-[#3b82f6]/15 cursor-pointer"
      >
        <Copy className="h-3 w-3 text-[#3b82f6]" /> Copy coordinates
      </button>
    </div>
  );
}

// ── Measurement tool component ────────────────────────────────────────────
function MeasurementOverlay({
  active,
  points,
  onClear,
}: {
  active: boolean;
  points: MeasurePoint[];
  onClear: () => void;
}) {
  if (!active && points.length === 0) return null;
  const totalM = points.length > 1
    ? points.reduce((sum, p, i) => {
        if (i === 0) return 0;
        const prev = points[i - 1];
        return sum + haversineMeters(prev.lat, prev.lon, p.lat, p.lon);
      }, 0)
    : 0;
  const totalKm = totalM / 1000;
  return (
    <div
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 px-3 py-1.5 rounded-md"
      style={{
        backgroundColor: "rgba(13, 17, 23, 0.95)",
        border: `1px solid ${NEON.neonAmber}40`,
        backdropFilter: "blur(12px)",
        boxShadow: `0 0 16px ${NEON.neonAmber}30`,
      }}
    >
      <Ruler className="h-3.5 w-3.5 text-[#f59e0b]" />
      <div className="text-[10px] font-mono text-[#f0f6fc]">
        {points.length === 0 ? (
          <span className="text-[#f59e0b]">Click map to start measuring</span>
        ) : points.length === 1 ? (
          <span className="text-[#f59e0b]">Click again to add a point</span>
        ) : (
          <>
            <span className="text-[#6e7681]">Distance:</span>{" "}
            <span className="text-[#f59e0b] font-bold">
              {totalKm >= 1 ? `${totalKm.toFixed(2)} km` : `${totalM.toFixed(0)} m`}
            </span>
            <span className="text-[#6e7681] ml-2">({points.length} points)</span>
          </>
        )}
      </div>
      {points.length > 0 && (
        <button
          onClick={onClear}
          className="text-[#6e7681] hover:text-[#ef4444] cursor-pointer ml-2"
          title="Clear measurement"
        >
          <X className="h-3 w-3" />
        </button>
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
  showLayerSwitcher?: boolean;
  showCoordinates?: boolean;
  showScale?: boolean;
  showFullscreen?: boolean;
  showMeasure?: boolean;
  showContextMenu?: boolean;
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
  initialCenter = [34.1718, 73.2389],
  initialZoom = 13,
  showLayerSwitcher = true,
  showCoordinates = true,
  showScale = true,
  showFullscreen = true,
  showMeasure = true,
  showContextMenu = true,
}: NeonMapProps) {
  const [layer, setLayer] = useState<LayerKey>("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [zoom, setZoom] = useState(initialZoom);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fullscreen handlers
  const enterFullscreen = () => {
    if (containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen();
    }
  };
  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Reverse geocode on right-click
  const reverseGeocode = useCallback(async (lat: number, lon: number) => {
    setContextMenu((prev) => prev ? { ...prev, loadingAddress: true } : prev);
    try {
      const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const d = await res.json();
        const addr = d.detailedName || d.locationName || d.displayName || "Unknown location";
        setContextMenu((prev) => prev ? { ...prev, address: addr, loadingAddress: false } : prev);
      } else {
        setContextMenu((prev) => prev ? { ...prev, loadingAddress: false, address: "Address lookup failed" } : prev);
      }
    } catch {
      setContextMenu((prev) => prev ? { ...prev, loadingAddress: false, address: "Network error" } : prev);
    }
  }, []);

  const handleContextMenu = useCallback((lat: number, lon: number, e: L.LeafletMouseEvent) => {
    if (!showContextMenu) return;
    // Get the original mouse event for screen position
    const originalEvent = (e as any).originalEvent as MouseEvent;
    setContextMenu({
      lat,
      lon,
      x: originalEvent.clientX,
      y: originalEvent.clientY,
      loadingAddress: true,
    });
    reverseGeocode(lat, lon);
  }, [showContextMenu, reverseGeocode]);

  // Measurement click handler
  const handleMapClickForMeasure = useCallback((lat: number, lon: number) => {
    if (measureMode) {
      setMeasurePoints((prev) => [...prev, { lat, lon }]);
    }
  }, [measureMode]);

  // Combined click handler (draw mode OR measure mode)
  const combinedClick = useCallback((lat: number, lon: number) => {
    if (measureMode) {
      handleMapClickForMeasure(lat, lon);
    } else if (drawMode && onMapClick) {
      onMapClick(lat, lon);
    }
  }, [measureMode, drawMode, onMapClick, handleMapClickForMeasure]);

  const copyCoords = (lat: number, lon: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)},${lon.toFixed(6)}`);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: isFullscreen ? "100vh" : height, backgroundColor: NEON.bg0 }}
    >
      <style>{`
        @keyframes neon-pulse {
          0% { transform: scale(0.8); opacity: 0.4; }
          50% { transform: scale(1.4); opacity: 0.1; }
          100% { transform: scale(0.8); opacity: 0.4; }
        }
        .neon-marker { background: transparent !important; border: none !important; }
        .leaflet-container {
          background: ${NEON.bg0} !important;
          font-family: Inter, sans-serif;
        }
        .leaflet-tile { filter: brightness(0.92) contrast(1.08); }
        .leaflet-control-zoom {
          border: 1px solid ${NEON.borderNeon} !important;
          background: rgba(13, 17, 23, 0.92) !important;
          backdrop-filter: blur(8px);
          box-shadow: 0 0 12px rgba(59,130,246,0.2) !important;
          border-radius: 6px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background: transparent !important;
          color: ${NEON.neonBlue} !important;
          border-bottom: 1px solid ${NEON.border} !important;
          transition: all 0.2s ease;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(59,130,246,0.15) !important;
          color: ${NEON.textPrimary} !important;
        }
        .leaflet-control-attribution {
          background: rgba(13, 17, 23, 0.85) !important;
          color: ${NEON.textMuted} !important;
          backdrop-filter: blur(8px);
          border-top-left-radius: 4px;
          font-size: 9px !important;
          padding: 2px 6px !important;
        }
        .leaflet-control-attribution a { color: ${NEON.neonBlue} !important; }
        .leaflet-control-scale-line {
          background: rgba(13, 17, 23, 0.85) !important;
          color: ${NEON.textSecondary} !important;
          border: 1px solid ${NEON.borderNeon} !important;
          border-top: none !important;
          backdrop-filter: blur(8px);
          font-family: monospace !important;
          font-size: 9px !important;
          padding: 2px 6px !important;
        }
        .leaflet-popup-content-wrapper {
          background: rgba(13, 17, 23, 0.97) !important;
          color: ${NEON.textPrimary} !important;
          border: 1px solid ${NEON.borderNeon} !important;
          border-radius: 8px !important;
          backdrop-filter: blur(12px);
          box-shadow: 0 0 20px rgba(59,130,246,0.25), 0 8px 32px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-tip {
          background: rgba(13, 17, 23, 0.97) !important;
          border: 1px solid ${NEON.borderNeon} !important;
        }
        .leaflet-popup-content { margin: 8px 12px !important; font-size: 12px !important; }
        .leaflet-popup-close-button { color: ${NEON.textMuted} !important; }
      `}</style>

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        zoomControl={true}
        attributionControl={true}
        className="w-full h-full"
        style={{ height: "100%", cursor: drawMode || measureMode ? "crosshair" : "grab" }}
      >
        {/* Active tile layer */}
        <TileLayer
          key={layer}
          url={TILE_LAYERS[layer].url}
          attribution={TILE_LAYERS[layer].attribution}
          subdomains={TILE_LAYERS[layer].subdomains || "abc"}
          maxZoom={20}
        />

        {/* Scale bar */}
        {showScale && <ScaleControl position="bottomleft" imperial={false} metric={true} />}

        {/* Geofences */}
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
            eventHandlers={{ click: () => onMarkerClick?.(g.id) }}
          />
        ))}

        {/* Route history */}
        {routePoints.length > 1 && (
          <>
            <Polyline
              positions={routePoints.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: NEON.neonAmber, weight: 5, opacity: 0.3 }}
            />
            <Polyline
              positions={routePoints.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: NEON.neonAmber, weight: 2.5, opacity: 0.9 }}
            />
          </>
        )}

        {/* Measurement polyline + points */}
        {measurePoints.length > 0 && (
          <Polyline
            positions={measurePoints.map((p) => [p.lat, p.lon])}
            pathOptions={{ color: NEON.neonAmber, weight: 2, dashArray: "6 4", opacity: 0.8 }}
          />
        )}

        {/* Markers */}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lon]}
            icon={makeNeonIcon(m)}
            eventHandlers={{ click: () => onMarkerClick?.(m.id) }}
          >
            <L.Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: m.color, marginBottom: 2 }}>
                  {m.label}
                </div>
                {m.sublabel && (
                  <div style={{ fontSize: 10, color: NEON.textSecondary, marginBottom: 4 }}>{m.sublabel}</div>
                )}
                <div style={{ fontSize: 9, fontFamily: "monospace", color: NEON.textMuted, marginBottom: 6 }}>
                  {m.lat.toFixed(6)}°N, {Math.abs(m.lon).toFixed(6)}°{m.lon >= 0 ? "E" : "W"}
                </div>
                {m.popupActions && m.popupActions.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {m.popupActions.map((a, i) => (
                      <button
                        key={i}
                        onClick={a.onClick}
                        style={{
                          background: "rgba(59,130,246,0.12)",
                          border: `1px solid ${NEON.borderNeon}`,
                          color: a.color || NEON.neonBlue,
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 10,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </L.Popup>
          </Marker>
        ))}

        {/* Controllers */}
        <FocusController focus={focusTarget} />
        <MapEventController
          onClick={combinedClick}
          onContextMenu={handleContextMenu}
          onMouseMove={(lat, lon) => showCoordinates && setCursorCoords({ lat, lon })}
          onZoom={setZoom}
          drawMode={drawMode || measureMode}
        />
      </MapContainer>

      {/* Address search overlay */}
      {showSearch && onSearchSelect && <AddressSearch onSelect={onSearchSelect} />}

      {/* Layer switcher */}
      {showLayerSwitcher && <LayerSwitcher current={layer} onChange={setLayer} />}

      {/* Top-right control cluster: fullscreen + measure */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        {showFullscreen && (
          <button
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="flex items-center justify-center h-8 w-8 rounded-md cursor-pointer transition-all"
            style={{
              backgroundColor: "rgba(13, 17, 23, 0.92)",
              border: `1px solid ${NEON.borderNeon}`,
              color: NEON.neonBlue,
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 12px rgba(59,130,246,0.2)",
            }}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
        {showMeasure && (
          <button
            onClick={() => {
              setMeasureMode(!measureMode);
              if (measureMode) setMeasurePoints([]);
            }}
            title="Measure distance"
            className="flex items-center justify-center h-8 w-8 rounded-md cursor-pointer transition-all"
            style={{
              backgroundColor: measureMode ? "rgba(245,158,11,0.15)" : "rgba(13, 17, 23, 0.92)",
              border: `1px solid ${measureMode ? NEON.neonAmber + "80" : NEON.borderNeon}`,
              color: measureMode ? NEON.neonAmber : NEON.neonBlue,
              backdropFilter: "blur(8px)",
              boxShadow: measureMode ? `0 0 12px ${NEON.neonAmber}50` : "0 0 12px rgba(59,130,246,0.2)",
            }}
          >
            <Ruler className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => {
            setLayer("dark");
            setMeasureMode(false);
            setMeasurePoints([]);
          }}
          title="Reset view"
          className="flex items-center justify-center h-8 w-8 rounded-md cursor-pointer transition-all"
          style={{
            backgroundColor: "rgba(13, 17, 23, 0.92)",
            border: `1px solid ${NEON.borderNeon}`,
            color: NEON.neonBlue,
            backdropFilter: "blur(8px)",
          }}
        >
          <LocateFixed className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Live coordinates display */}
      {showCoordinates && cursorCoords && (
        <div
          className="absolute top-3 left-[300px] z-[500] px-2.5 py-1 rounded-md font-mono text-[10px] pointer-events-none"
          style={{
            backgroundColor: "rgba(13, 17, 23, 0.85)",
            border: `1px solid ${NEON.border}`,
            color: NEON.textSecondary,
            backdropFilter: "blur(8px)",
          }}
        >
          <span className="text-[#3b82f6]">{cursorCoords.lat.toFixed(6)}</span>°N,{" "}
          <span className="text-[#3b82f6]">{Math.abs(cursorCoords.lon).toFixed(6)}</span>°{cursorCoords.lon >= 0 ? "E" : "W"}{" "}
          <span className="text-[#6e7681] ml-1">· z{zoom}</span>
        </div>
      )}

      {/* North arrow */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center pointer-events-none"
        style={{ opacity: 0.7 }}
      >
        <Compass className="h-4 w-4 text-[#3b82f6]" style={{ filter: "drop-shadow(0 0 4px rgba(59,130,246,0.6))" }} />
        <div className="text-[8px] font-mono text-[#3b82f6] mt-0.5">N</div>
      </div>

      {/* Measurement overlay */}
      <MeasurementOverlay
        active={measureMode}
        points={measurePoints}
        onClear={() => { setMeasurePoints([]); setMeasureMode(false); }}
      />

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddGeofence={(lat, lon) => {
            onMapClick?.(lat, lon);
          }}
          onCopyCoords={copyCoords}
          onFocusHere={(lat, lon) => {
            // Use the focusTarget mechanism — but since it's a prop, we trigger via a custom event
            const event = new CustomEvent("neon-map-focus", { detail: { lat, lon, zoom: 15 } });
            window.dispatchEvent(event);
          }}
        />
      )}

      {/* Draw mode indicator */}
      {drawMode && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] px-4 py-1.5 rounded-md text-[11px] font-mono font-medium pointer-events-none"
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

      {measureMode && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] px-4 py-1.5 rounded-md text-[11px] font-mono font-medium pointer-events-none"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.5)",
            color: NEON.neonAmber,
            backdropFilter: "blur(8px)",
          }}
        >
          <Ruler className="h-3 w-3 inline mr-1.5" />
          MEASUREMENT MODE · CLICK TO ADD POINTS
        </div>
      )}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
