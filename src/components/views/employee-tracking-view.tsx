"use client";

/**
 * Employee GPS Tracking — Neon Navigation Theme.
 *
 * Visual style: "Midnight Tech / Cyberpunk Lite"
 *   - Deep charcoal-navy base (#0d1117, #161b22)
 *   - Neon blue primary (#3b82f6) for routes, active states, CTAs
 *   - Magenta (#ec4899), amber (#f59e0b), green (#10b981) for action clusters
 *   - Schematic/wireframe map with glowing route lines and pulse rings
 *   - Translucent dark panels with neon borders + glow
 *   - Monospace coordinates, bold data values
 *
 * Layout:
 *   ┌──── TOP HUD: stats (neon badges) ────┐
 *   ├──────────┬──────────────────────────────┬─────────────────┤
 *   │ LEFT     │       Neon Map Canvas         │ RIGHT           │
 *   │ Employees│   (wireframe + glow routes)   │ Activity Feed   │
 *   │ + filter │                               │ + open shifts   │
 *   │ 288px    │                               │ 320px           │
 *   ├──────────┴──────────────────────────────┴─────────────────┤
 *   │ BOTTOM: Timesheet + Geofence manager (collapsible)        │
 *   └────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, MapPin, Clock, Plus, Trash2, Pencil, Crosshair,
  Activity, Battery, Signal, ZoomIn, ZoomOut, LocateFixed,
  ShieldCheck, LogIn, LogOut, Search, X, Layers, Navigation,
  Route, Calendar, TrendingUp, Globe, Target, Flag, Share2,
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  phone: string | null;
  lastActive: string | null;
  createdAt: string;
}

interface LatestPing {
  id: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  batteryPercent: number | null;
  source: string;
  insideGeofenceIds: string[];
  createdAt: string;
}

interface Geofence {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lon: number;
  radiusMeters: number;
  color: string;
  type: string;
  activeFrom: string | null;
  activeTo: string | null;
  activeDays: number[];
  isActive: boolean;
  createdAt: string;
  _count?: { events: number; timeEntries: number };
}

interface GeofenceEvent {
  id: string;
  event: string;
  lat: number;
  lon: number;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; avatar: string | null };
  geofence: { id: string; name: string; color: string; type: string };
}

interface TimeEntry {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  clockInLat: number | null;
  clockInLon: number | null;
  durationSec: number | null;
  status: string;
  notes: string | null;
  user: { id: string; name: string; email: string; avatar: string | null };
  geofence: { id: string; name: string } | null;
}

interface SummaryData {
  members: Member[];
  latestPings: Record<string, LatestPing>;
  geofences: Geofence[];
  recentEvents: GeofenceEvent[];
  openEntries: TimeEntry[];
  stats: {
    totalMembers: number;
    trackedMembers: number;
    totalGeofences: number;
    activeGeofences: number;
    openShifts: number;
    totalHoursToday: number;
    hoursByUser: Record<string, number>;
  };
}

// ── THEME TOKENS ──────────────────────────────────────────────────────────
const T = {
  // Base backgrounds
  bg0: "#0d1117",          // deepest
  bg1: "#161b22",          // panel
  bg2: "#1c2230",          // raised
  // Borders
  border: "rgba(48, 54, 61, 0.8)",
  borderNeon: "rgba(59, 130, 246, 0.4)",
  // Neon accents
  neonBlue: "#3b82f6",
  neonBlueGlow: "rgba(59, 130, 246, 0.5)",
  neonPink: "#ec4899",
  neonAmber: "#f59e0b",
  neonGreen: "#10b981",
  neonCyan: "#06b6d4",
  // Text
  textPrimary: "#f0f6fc",
  textSecondary: "#8b949e",
  textMuted: "#6e7681",
  // Map
  mapBg: "#0d1117",
  mapLandmass: "rgba(48, 54, 61, 0.5)",
  mapRoad: "rgba(72, 81, 92, 0.4)",
  mapGrid: "rgba(59, 130, 246, 0.06)",
};

const GEOFENCE_COLORS = [
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#10b981", name: "Green" },
  { hex: "#a855f7", name: "Purple" },
  { hex: "#06b6d4", name: "Cyan" },
];
const GEOFENCE_TYPES = [
  { value: "jobsite", label: "Job Site" },
  { value: "office", label: "Office" },
  { value: "restricted", label: "Restricted Zone" },
  { value: "client_site", label: "Client Site" },
];

type MapMode = "view" | "drawGeofence";

export function EmployeeTrackingView() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showRouteFor, setShowRouteFor] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lon: number; timestamp: string }>>([]);

  const [mapMode, setMapMode] = useState<MapMode>("view");
  const [pendingGeofence, setPendingGeofence] = useState<{ lat: number; lon: number } | null>(null);
  const [geofenceForm, setGeofenceForm] = useState({
    name: "",
    description: "",
    radiusMeters: 150,
    color: GEOFENCE_COLORS[0].hex,
    type: "jobsite",
  });
  const [editGeofence, setEditGeofence] = useState<Geofence | null>(null);

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const targetZoom = useRef(1);
  const targetPanX = useRef(0);
  const targetPanY = useRef(0);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/tracking/summary");
      if (res.ok) {
        const d = await res.json();
        setData(d);
        lastFetchRef.current = Date.now();
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!showRouteFor) {
      setRoutePoints([]);
      return;
    }
    const today = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    (async () => {
      try {
        const url = `/api/tracking/route-history?userId=${showRouteFor}&from=${startOfDay.toISOString()}&to=${today.toISOString()}`;
        const res = await fetch(url);
        if (res.ok) {
          const d = await res.json();
          setRoutePoints(d.points || []);
        }
      } catch {
        // silent
      }
    })();
  }, [showRouteFor, data]);

  useEffect(() => {
    if (!selectedMemberId || !data) {
      targetZoom.current = 1;
      targetPanX.current = 0;
      targetPanY.current = 0;
      return;
    }
    const ping = data.latestPings[selectedMemberId];
    const canvas = canvasRef.current;
    if (!ping || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = ((ping.lon + 180) / 360) * rect.width;
    const dy = ((90 - ping.lat) / 180) * rect.height;
    const tz = 5;
    targetZoom.current = tz;
    targetPanX.current = rect.width / 2 - dx * tz;
    targetPanY.current = rect.height / 2 - dy * tz;
  }, [selectedMemberId, data]);

  useEffect(() => {
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      setZoom((prev) => {
        const next = prev + (targetZoom.current - prev) * 0.12;
        return Math.abs(next - prev) < 0.001 ? prev : next;
      });
      setPanX((prev) => {
        const next = prev + (targetPanX.current - prev) * 0.12;
        return Math.abs(next - prev) < 0.3 ? prev : next;
      });
      setPanY((prev) => {
        const next = prev + (targetPanY.current - prev) * 0.12;
        return Math.abs(next - prev) < 0.3 ? prev : next;
      });
    };
    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  const filteredMembers = useMemo(() => {
    if (!data?.members) return [];
    return data.members.filter((m) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
    });
  }, [data, search]);

  // ── MAP DRAWING ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const time = Date.now() / 1000;

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Background — deep navy gradient
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h));
    bgGrad.addColorStop(0, "#11161f");
    bgGrad.addColorStop(0.6, T.bg0);
    bgGrad.addColorStop(1, "#06090f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid (blueprint feel)
    ctx.strokeStyle = T.mapGrid;
    ctx.lineWidth = 0.5 / zoom;
    const gridStep = 40;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Continent wireframe (schematic style)
    const drawContinent = (pts: number[][]) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px * w, py * h);
        else ctx.lineTo(px * w, py * h);
      });
      ctx.closePath();
      ctx.fillStyle = T.mapLandmass;
      ctx.fill();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.15)";
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    };
    drawContinent([[0.15,0.12],[0.32,0.08],[0.36,0.15],[0.34,0.28],[0.28,0.32],[0.18,0.28],[0.14,0.20],[0.15,0.12]]);
    drawContinent([[0.26,0.38],[0.34,0.36],[0.36,0.48],[0.33,0.62],[0.28,0.65],[0.24,0.55],[0.25,0.42],[0.26,0.38]]);
    drawContinent([[0.46,0.14],[0.55,0.12],[0.57,0.18],[0.54,0.24],[0.48,0.24],[0.45,0.19],[0.46,0.14]]);
    drawContinent([[0.45,0.28],[0.54,0.26],[0.58,0.34],[0.56,0.50],[0.51,0.56],[0.46,0.50],[0.44,0.36],[0.45,0.28]]);
    drawContinent([[0.58,0.10],[0.78,0.08],[0.84,0.14],[0.82,0.28],[0.75,0.32],[0.66,0.30],[0.58,0.22],[0.58,0.10]]);
    drawContinent([[0.74,0.50],[0.84,0.48],[0.87,0.56],[0.84,0.64],[0.76,0.66],[0.72,0.58],[0.74,0.50]]);

    // Latitude/longitude lines (faint neon)
    ctx.strokeStyle = "rgba(59, 130, 246, 0.08)";
    ctx.lineWidth = 0.5 / zoom;
    [0.25, 0.5, 0.75].forEach((p) => {
      ctx.beginPath(); ctx.moveTo(0, p * h); ctx.lineTo(w, p * h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p * w, 0); ctx.lineTo(p * w, h); ctx.stroke();
    });

    // Geofences (neon-bordered circles with glow)
    const geofences = data?.geofences ?? [];
    geofences.forEach((g) => {
      const cx = ((g.lon + 180) / 360) * w;
      const cy = ((90 - g.lat) / 180) * h;
      const radiusPx = metersToPixels(g.radiusMeters, g.lat, w);

      // Glow fill
      ctx.fillStyle = hexToRgba(g.color, g.isActive ? 0.08 : 0.03);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Outer glow
      ctx.shadowColor = g.color;
      ctx.shadowBlur = 12 / zoom;
      ctx.strokeStyle = hexToRgba(g.color, g.isActive ? 0.8 : 0.3);
      ctx.lineWidth = (selectedMemberId && data?.latestPings[selectedMemberId]?.insideGeofenceIds.includes(g.id) ? 2.5 : 1.5) / zoom;
      ctx.setLineDash([8 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Center crosshair
      ctx.strokeStyle = hexToRgba(g.color, 0.9);
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
      ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
      ctx.stroke();

      // Label with background pill
      const label = g.name.slice(0, 16);
      ctx.font = `bold ${10 / zoom}px sans-serif`;
      const labelW = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(13, 17, 23, 0.9)";
      ctx.fillRect(cx - labelW / 2, cy - radiusPx - 18 / zoom, labelW, 14 / zoom);
      ctx.strokeStyle = hexToRgba(g.color, 0.5);
      ctx.lineWidth = 0.5 / zoom;
      ctx.strokeRect(cx - labelW / 2, cy - radiusPx - 18 / zoom, labelW, 14 / zoom);
      ctx.fillStyle = g.color;
      ctx.textAlign = "center";
      ctx.fillText(label, cx, cy - radiusPx - 7 / zoom);
    });

    // Route history polyline with neon glow
    if (routePoints.length > 1) {
      // Outer glow
      ctx.shadowColor = T.neonAmber;
      ctx.shadowBlur = 16 / zoom;
      ctx.strokeStyle = hexToRgba(T.neonAmber, 0.7);
      ctx.lineWidth = 3 / zoom;
      ctx.beginPath();
      routePoints.forEach((p, i) => {
        const x = ((p.lon + 180) / 360) * w;
        const y = ((90 - p.lat) / 180) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Inner bright line
      ctx.shadowBlur = 0;
      ctx.strokeStyle = T.neonAmber;
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      routePoints.forEach((p, i) => {
        const x = ((p.lon + 180) / 360) * w;
        const y = ((90 - p.lat) / 180) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Waypoint dots
      ctx.fillStyle = T.neonAmber;
      ctx.shadowColor = T.neonAmber;
      ctx.shadowBlur = 8 / zoom;
      routePoints.forEach((p) => {
        const x = ((p.lon + 180) / 360) * w;
        const y = ((90 - p.lat) / 180) * h;
        ctx.beginPath();
        ctx.arc(x, y, 2.5 / zoom, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    }

    // Employee markers
    filteredMembers.forEach((m) => {
      const ping = data?.latestPings[m.id];
      if (!ping) return;
      const x = ((ping.lon + 180) / 360) * w;
      const y = ((90 - ping.lat) / 180) * h;
      const isSelected = selectedMemberId === m.id;
      const isInside = ping.insideGeofenceIds.length > 0;
      const color = isSelected ? T.neonAmber : isInside ? T.neonGreen : T.neonBlue;

      // Pulsing ripple rings
      const pulsePhase = (time * 1.2) % (Math.PI * 2);
      const ringR1 = 14 + Math.sin(pulsePhase) * 6;
      const ringR2 = 22 + Math.sin(pulsePhase + 1) * 8;
      ctx.strokeStyle = hexToRgba(color, 0.3 - Math.sin(pulsePhase) * 0.1);
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(x, y, ringR1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(color, 0.15 - Math.sin(pulsePhase + 1) * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, ringR2, 0, Math.PI * 2);
      ctx.stroke();

      // Glow halo
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 24 / zoom : 16 / zoom;
      ctx.fillStyle = hexToRgba(color, 0.25);
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 14 : 10, 0, Math.PI * 2);
      ctx.fill();

      // Solid center dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner white core
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 2.5 : 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Label with pill background
      const label = (m.name || m.email).slice(0, 14);
      ctx.font = isSelected ? `bold ${11 / zoom}px sans-serif` : `${10 / zoom}px sans-serif`;
      const labelW = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(13, 17, 23, 0.92)";
      ctx.fillRect(x - labelW / 2, y - 28 / zoom, labelW, 14 / zoom);
      ctx.strokeStyle = hexToRgba(color, 0.6);
      ctx.lineWidth = 0.5 / zoom;
      ctx.strokeRect(x - labelW / 2, y - 28 / zoom, labelW, 14 / zoom);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(label, x, y - 18 / zoom);

      // Battery indicator
      if (ping.batteryPercent != null) {
        const bat = ping.batteryPercent;
        const batColor = bat > 50 ? T.neonGreen : bat > 20 ? T.neonAmber : "#ef4444";
        ctx.fillStyle = batColor;
        ctx.font = `${9 / zoom}px monospace`;
        ctx.textAlign = "left";
        ctx.fillText(`${bat}%`, x + 10, y + 4);
      }
    });

    // Pending geofence preview
    if (pendingGeofence) {
      const cx = ((pendingGeofence.lon + 180) / 360) * w;
      const cy = ((90 - pendingGeofence.lat) / 180) * h;
      const radiusPx = metersToPixels(geofenceForm.radiusMeters, pendingGeofence.lat, w);
      ctx.shadowColor = geofenceForm.color;
      ctx.shadowBlur = 12 / zoom;
      ctx.fillStyle = hexToRgba(geofenceForm.color, 0.15);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(geofenceForm.color, 0.9);
      ctx.lineWidth = 1.8 / zoom;
      ctx.setLineDash([8 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      // Crosshair
      ctx.strokeStyle = geofenceForm.color;
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }

    ctx.restore();

    // ── Fixed HUD overlays ───────────────────────────────────────────────
    if (mapMode === "drawGeofence") {
      ctx.fillStyle = "rgba(245, 158, 11, 0.12)";
      ctx.fillRect(w / 2 - 180, 12, 360, 32);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 180, 12, 360, 32);
      ctx.fillStyle = T.neonAmber;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("◇ GEOFENCE PLACEMENT MODE ◇", w / 2, 28);
      ctx.fillStyle = T.textSecondary;
      ctx.font = "9px monospace";
      ctx.fillText("Click on map to set center · Esc to cancel", w / 2, 40);
    }
  }, [data, filteredMembers, selectedMemberId, routePoints, pendingGeofence, geofenceForm, zoom, panX, panY, mapMode]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mapMode === "drawGeofence") return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPanX(dragStart.current.px + dx);
    setPanY(dragStart.current.py + dy);
    targetPanX.current = dragStart.current.px + dx;
    targetPanY.current = dragStart.current.py + dy;
  };
  const handleMouseUp = () => {
    isDragging.current = false;
    dragStart.current = null;
  };
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    targetZoom.current = Math.max(1, Math.min(15, targetZoom.current + delta));
    if (targetZoom.current === 1) {
      targetPanX.current = 0;
      targetPanY.current = 0;
    }
  };
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const worldX = (clickX - panX) / zoom;
    const worldY = (clickY - panY) / zoom;

    if (mapMode === "drawGeofence") {
      const lon = (worldX / rect.width) * 360 - 180;
      const lat = 90 - (worldY / rect.height) * 180;
      setPendingGeofence({ lat, lon });
      return;
    }
    if (isDragging.current) return;

    for (const m of filteredMembers) {
      const ping = data?.latestPings[m.id];
      if (!ping) continue;
      const x = ((ping.lon + 180) / 360) * rect.width;
      const y = ((90 - ping.lat) / 180) * rect.height;
      const dist = Math.sqrt((worldX - x) ** 2 + (worldY - y) ** 2);
      if (dist < 20) {
        setSelectedMemberId(selectedMemberId === m.id ? null : m.id);
        return;
      }
    }
  };

  const zoomIn = () => { targetZoom.current = Math.min(15, targetZoom.current + 1); };
  const zoomOut = () => {
    const nz = Math.max(1, targetZoom.current - 1);
    targetZoom.current = nz;
    if (nz === 1) {
      targetPanX.current = 0; targetPanY.current = 0;
      setSelectedMemberId(null);
    }
  };
  const resetView = () => {
    targetZoom.current = 1;
    targetPanX.current = 0;
    targetPanY.current = 0;
    setSelectedMemberId(null);
    setShowRouteFor(null);
  };

  const saveGeofence = async () => {
    if (!pendingGeofence) return;
    if (!geofenceForm.name.trim()) {
      toast.error("Geofence name is required");
      return;
    }
    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: geofenceForm.name,
          description: geofenceForm.description,
          lat: pendingGeofence.lat,
          lon: pendingGeofence.lon,
          radiusMeters: geofenceForm.radiusMeters,
          color: geofenceForm.color,
          type: geofenceForm.type,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create geofence");
        return;
      }
      toast.success(`Geofence "${geofenceForm.name}" created`);
      setPendingGeofence(null);
      setGeofenceForm({ name: "", description: "", radiusMeters: 150, color: GEOFENCE_COLORS[0].hex, type: "jobsite" });
      setMapMode("view");
      fetchData();
    } catch {
      toast.error("Network error");
    }
  };

  const deleteGeofence = async (id: string, name: string) => {
    if (!confirm(`Delete geofence "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/geofences/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Geofence deleted");
        fetchData();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const toggleGeofenceActive = async (g: Geofence) => {
    try {
      const res = await fetch(`/api/geofences/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !g.isActive }),
      });
      if (res.ok) {
        toast.success(`Geofence ${!g.isActive ? "activated" : "deactivated"}`);
        fetchData();
      }
    } catch {
      toast.error("Network error");
    }
  };

  const manualClock = async (memberId: string, action: "clock_in" | "clock_out") => {
    const ping = data?.latestPings[memberId];
    try {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          lat: ping?.lat,
          lon: ping?.lon,
          geofenceId: ping?.insideGeofenceIds[0],
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed");
        return;
      }
      toast.success(action === "clock_in" ? "Clocked in" : "Clocked out");
      fetchData();
    } catch {
      toast.error("Network error");
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mapMode === "drawGeofence") {
        setMapMode("view");
        setPendingGeofence(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mapMode]);

  const stats = data?.stats;
  const secondsSinceFetch = lastFetchRef.current ? Math.floor((Date.now() - lastFetchRef.current) / 1000) : 0;

  return (
    <div
      className="h-[calc(100vh-3.5rem-2.5rem)] flex flex-col relative overflow-hidden"
      style={{ backgroundColor: T.bg0, color: T.textPrimary }}
    >
      {/* Top HUD bar */}
      <div
        className="flex items-center justify-between px-4 py-2 z-20"
        style={{
          backgroundColor: "rgba(13, 17, 23, 0.92)",
          borderBottom: `1px solid ${T.borderNeon}`,
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.12)",
                border: `1px solid ${T.borderNeon}`,
                boxShadow: `0 0 12px ${T.neonBlueGlow}`,
              }}
            >
              <Navigation className="h-4 w-4" style={{ color: T.neonBlue }} />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight" style={{ color: T.textPrimary }}>
                Employee GPS Tracking
              </h1>
              <p className="text-[10px] font-mono" style={{ color: T.textMuted }}>
                LIVE · GEOFENCED ATTENDANCE · ROUTE HISTORY
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatPill icon={<Users className="h-2.5 w-2.5" />} value={stats?.totalMembers ?? 0} label="members" color={T.neonCyan} />
          <StatPill icon={<Signal className="h-2.5 w-2.5" />} value={stats?.trackedMembers ?? 0} label="tracked" color={T.neonGreen} />
          <StatPill icon={<MapPin className="h-2.5 w-2.5" />} value={stats?.totalGeofences ?? 0} label="geofences" color={T.neonBlue} />
          <StatPill icon={<Clock className="h-2.5 w-2.5" />} value={stats?.openShifts ?? 0} label="open" color={T.neonAmber} />
          <StatPill icon={<TrendingUp className="h-2.5 w-2.5" />} value={stats?.totalHoursToday ?? 0} label="h today" color={T.neonPink} />
          <div className="flex items-center gap-1 text-[10px] font-mono ml-1" style={{ color: T.textMuted }}>
            <Clock className="h-2.5 w-2.5" /> {secondsSinceFetch}s
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer"
            style={{ color: T.textSecondary }}
            onClick={fetchData}
          >
            <Activity className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Employees */}
        <aside
          className="w-72 shrink-0 flex flex-col"
          style={{
            backgroundColor: "rgba(13, 17, 23, 0.85)",
            borderRight: `1px solid ${T.border}`,
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="p-3 space-y-2" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5" style={{ color: T.neonBlue }} />
              <span className="text-xs font-semibold" style={{ color: T.textPrimary }}>Field Employees</span>
              <Badge
                className="ml-auto text-[9px] font-mono"
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  color: T.neonBlue,
                  border: `1px solid ${T.borderNeon}`,
                }}
              >
                {filteredMembers.length}/{data?.members.length ?? 0}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: T.textMuted }} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, role..."
                className="h-7 pl-7 text-xs"
                style={{
                  backgroundColor: T.bg1,
                  borderColor: T.border,
                  color: T.textPrimary,
                }}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div>
              {filteredMembers.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: T.textMuted }}>
                  No employees match.
                </div>
              ) : (
                filteredMembers.map((m) => {
                  const ping = data?.latestPings[m.id];
                  const isSelected = selectedMemberId === m.id;
                  const isInside = (ping?.insideGeofenceIds.length ?? 0) > 0;
                  const openEntry = data?.openEntries.find((e) => e.user.id === m.id);
                  const hoursToday = (data?.stats.hoursByUser[m.id] ?? 0) / 3600;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMemberId(isSelected ? null : m.id)}
                      className="p-3 cursor-pointer transition-all"
                      style={{
                        borderBottom: `1px solid ${T.border}`,
                        borderLeft: `2px solid ${isSelected ? T.neonAmber : "transparent"}`,
                        backgroundColor: isSelected ? "rgba(245, 158, 11, 0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.06)"; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative shrink-0">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-medium"
                            style={{
                              backgroundColor: "rgba(59, 130, 246, 0.15)",
                              color: T.neonBlue,
                              border: `1px solid ${T.borderNeon}`,
                            }}
                          >
                            {m.name?.slice(0, 2).toUpperCase() ?? m.email.slice(0, 2).toUpperCase()}
                          </div>
                          {ping && (
                            <div
                              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: isInside ? T.neonGreen : T.neonBlue,
                                border: `1.5px solid ${T.bg0}`,
                                boxShadow: `0 0 6px ${isInside ? T.neonGreen : T.neonBlue}`,
                              }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: T.textPrimary }}>
                            {m.name ?? m.email}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: T.textMuted }}>{m.email}</div>
                          {ping ? (
                            <>
                              <div className="text-[9px] font-mono mt-0.5" style={{ color: T.neonCyan }}>
                                {ping.lat.toFixed(4)}°N, {Math.abs(ping.lon).toFixed(4)}°{ping.lon >= 0 ? "E" : "W"}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {isInside && (
                                  <NeonBadge color={T.neonGreen} icon={<MapPin className="h-2 w-2 mr-0.5" />}>
                                    IN ZONE
                                  </NeonBadge>
                                )}
                                {openEntry && (
                                  <NeonBadge color={T.neonBlue} icon={<Clock className="h-2 w-2 mr-0.5" />}>
                                    ON SHIFT
                                  </NeonBadge>
                                )}
                                {ping.batteryPercent != null && (
                                  <span className="text-[9px] flex items-center gap-0.5" style={{ color: T.textMuted }}>
                                    <Battery className="h-2 w-2" /> {ping.batteryPercent}%
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] mt-0.5" style={{ color: T.textMuted }}>
                                {hoursToday > 0 ? `${hoursToday.toFixed(1)}h today` : "No hours today"}
                              </div>
                            </>
                          ) : (
                            <div className="text-[9px] mt-0.5" style={{ color: T.textMuted }}>No location data</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Selected member actions — neon circular buttons */}
          {selectedMemberId && (
            <div className="p-3 space-y-2" style={{ borderTop: `1px solid ${T.border}`, backgroundColor: T.bg0 }}>
              <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>
                ◆ Quick Actions
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <NeonActionButton color={T.neonAmber} onClick={() => setShowRouteFor(showRouteFor === selectedMemberId ? null : selectedMemberId)} title="Route">
                  <Route className="h-3.5 w-3.5" />
                </NeonActionButton>
                <NeonActionButton color={T.neonCyan} onClick={() => {
                  const ping = data?.latestPings[selectedMemberId];
                  if (ping) {
                    navigator.clipboard.writeText(`${ping.lat.toFixed(6)},${ping.lon.toFixed(6)}`);
                    toast.success("Coordinates copied");
                  }
                }} title="Copy GPS">
                  <Crosshair className="h-3.5 w-3.5" />
                </NeonActionButton>
                <NeonActionButton color={T.neonGreen} onClick={() => manualClock(selectedMemberId, "clock_in")} title="Clock In">
                  <LogIn className="h-3.5 w-3.5" />
                </NeonActionButton>
                <NeonActionButton color={T.neonPink} onClick={() => manualClock(selectedMemberId, "clock_out")} title="Clock Out">
                  <LogOut className="h-3.5 w-3.5" />
                </NeonActionButton>
              </div>
            </div>
          )}
        </aside>

        {/* CENTER: map */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${mapMode === "drawGeofence" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
            style={{ width: "100%", height: "100%", display: "block" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onClick={handleCanvasClick}
          />

          {/* Top-left status overlay */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{
                backgroundColor: "rgba(13, 17, 23, 0.85)",
                border: `1px solid ${T.borderNeon}`,
                backdropFilter: "blur(8px)",
              }}
            >
              <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: T.neonGreen, boxShadow: `0 0 6px ${T.neonGreen}` }} />
              <span className="text-[10px] font-mono font-medium tracking-wider" style={{ color: T.neonGreen }}>
                LIVE TRACKING
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{ backgroundColor: "rgba(13, 17, 23, 0.85)", border: `1px solid ${T.border}`, backdropFilter: "blur(8px)" }}
            >
              <Clock className="h-2.5 w-2.5" style={{ color: T.textMuted }} />
              <span className="text-[10px] font-mono" style={{ color: T.textSecondary }}>
                {secondsSinceFetch}s · {data?.members.length ?? 0} units
              </span>
            </div>
            {zoom > 1.05 && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                style={{ backgroundColor: "rgba(13, 17, 23, 0.85)", border: `1px solid ${T.borderNeon}`, backdropFilter: "blur(8px)" }}
              >
                <ZoomIn className="h-2.5 w-2.5" style={{ color: T.neonBlue }} />
                <span className="text-[10px] font-mono" style={{ color: T.neonBlue }}>{zoom.toFixed(1)}x</span>
              </div>
            )}
          </div>

          {/* Top-right: mode + zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              {mapMode === "view" ? (
                <NeonCTAButton color={T.neonBlue} onClick={() => { setMapMode("drawGeofence"); setPendingGeofence(null); }}>
                  <Plus className="h-3 w-3" /> Draw Geofence
                </NeonCTAButton>
              ) : (
                <NeonCTAButton color={T.neonAmber} onClick={() => { setMapMode("view"); setPendingGeofence(null); }}>
                  <X className="h-3 w-3" /> Cancel
                </NeonCTAButton>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <NeonIconButton color={T.neonBlue} onClick={zoomIn} title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </NeonIconButton>
              <NeonIconButton color={T.neonBlue} onClick={zoomOut} title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </NeonIconButton>
              <NeonIconButton color={T.neonBlue} onClick={resetView} title="Reset view">
                <LocateFixed className="h-3.5 w-3.5" />
              </NeonIconButton>
            </div>
          </div>

          {/* Bottom-left legend */}
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <LegendItem color={T.neonGreen} label="Inside geofence" />
            <LegendItem color={T.neonBlue} label="Outside / roaming" />
            <LegendItem color={T.neonAmber} label="Selected / locked" />
            <LegendItem color={T.neonAmber} label="Route history" filled={false} />
          </div>

          {/* Bottom-right timestamp */}
          <div
            className="absolute bottom-3 right-3 text-[9px] font-mono px-2 py-1 rounded"
            style={{
              color: T.textMuted,
              backgroundColor: "rgba(13, 17, 23, 0.85)",
              border: `1px solid ${T.border}`,
              backdropFilter: "blur(8px)",
            }}
          >
            {new Date().toISOString().slice(0, 19).replace("T", " ")}Z
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(13, 17, 23, 0.8)" }}>
              <Activity className="h-6 w-6 animate-spin" style={{ color: T.neonBlue }} />
            </div>
          )}
        </div>

        {/* RIGHT: Activity feed */}
        <aside
          className="w-80 shrink-0 flex flex-col"
          style={{
            backgroundColor: "rgba(13, 17, 23, 0.92)",
            borderLeft: `1px solid ${T.border}`,
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="p-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" style={{ color: T.neonBlue }} />
              <span className="text-xs font-semibold" style={{ color: T.textPrimary }}>Activity Feed</span>
            </div>
            <Badge
              className="text-[9px] font-mono"
              style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", color: T.neonBlue, border: `1px solid ${T.borderNeon}` }}
            >
              {data?.recentEvents.length ?? 0}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            <div>
              {data?.recentEvents.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: T.textMuted }}>
                  No events yet. Geofence entries/exits and clock in/out will appear here.
                </div>
              ) : (
                data?.recentEvents.map((ev) => {
                  const isEnter = ev.event === "enter" || ev.event === "clock_in";
                  const isExit = ev.event === "exit" || ev.event === "clock_out";
                  const Icon = isEnter ? LogIn : isExit ? LogOut : Activity;
                  const color = isEnter ? T.neonGreen : isExit ? T.neonAmber : T.neonBlue;
                  return (
                    <div
                      key={ev.id}
                      className="p-3 flex items-start gap-2.5"
                      style={{ borderBottom: `1px solid ${T.border}` }}
                    >
                      <div
                        className="mt-0.5 p-1 rounded"
                        style={{ backgroundColor: hexToRgba(color, 0.12), color, boxShadow: `0 0 8px ${hexToRgba(color, 0.3)}` }}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px]" style={{ color: T.textPrimary }}>
                          <span className="font-medium">{ev.user.name ?? ev.user.email}</span>{" "}
                          <span style={{ color: T.textMuted }}>{ev.event.replace("_", " ")}</span>{" "}
                          <span className="font-medium" style={{ color: ev.geofence.color }}>
                            {ev.geofence.name}
                          </span>
                        </div>
                        <div className="text-[9px] font-mono mt-0.5" style={{ color: T.textMuted }}>
                          {ev.lat.toFixed(4)}, {ev.lon.toFixed(4)} · {timeAgo(ev.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {data && data.openEntries.length > 0 && (
            <div className="p-3" style={{ borderTop: `1px solid ${T.border}`, backgroundColor: T.bg0 }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>
                ◆ Open Shifts ({data.openEntries.length})
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {data.openEntries.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-[11px]">
                    <Clock className="h-3 w-3 shrink-0" style={{ color: T.neonBlue }} />
                    <span className="truncate flex-1" style={{ color: T.textPrimary }}>{e.user.name}</span>
                    <span className="font-mono" style={{ color: T.textMuted }}>{timeAgo(e.clockInAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* BOTTOM: Geofence + Timesheet */}
      <BottomPanels
        geofences={data?.geofences ?? []}
        timeEntries={data?.openEntries ?? []}
        onDeleteGeofence={deleteGeofence}
        onToggleGeofence={toggleGeofenceActive}
        onEditGeofence={setEditGeofence}
      />

      {/* Pending geofence dialog */}
      <Dialog open={!!pendingGeofence} onOpenChange={(v) => { if (!v) { setPendingGeofence(null); setMapMode("view"); } }}>
        <DialogContent className="max-w-md" style={{ backgroundColor: T.bg1, border: `1px solid ${T.borderNeon}` }}>
          <DialogHeader>
            <DialogTitle style={{ color: T.textPrimary }}>Create Geofence</DialogTitle>
            <DialogDescription style={{ color: T.textSecondary }}>
              Center: {pendingGeofence?.lat.toFixed(6)}°N, {pendingGeofence && Math.abs(pendingGeofence.lon).toFixed(6)}°{pendingGeofence && pendingGeofence.lon >= 0 ? "E" : "W"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: T.textSecondary }}>Name *</Label>
              <Input
                value={geofenceForm.name}
                onChange={(e) => setGeofenceForm({ ...geofenceForm, name: e.target.value })}
                placeholder="Main Office"
                style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: T.textSecondary }}>Description</Label>
              <Input
                value={geofenceForm.description}
                onChange={(e) => setGeofenceForm({ ...geofenceForm, description: e.target.value })}
                placeholder="Headquarters — clock-in zone"
                style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: T.textSecondary }}>Radius (m)</Label>
                <Input
                  type="number"
                  min={10}
                  max={5000}
                  value={geofenceForm.radiusMeters}
                  onChange={(e) => setGeofenceForm({ ...geofenceForm, radiusMeters: parseInt(e.target.value) || 100 })}
                  style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: T.textSecondary }}>Type</Label>
                <Select value={geofenceForm.type} onValueChange={(v) => setGeofenceForm({ ...geofenceForm, type: v })}>
                  <SelectTrigger style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ backgroundColor: T.bg1, borderColor: T.border }}>
                    {GEOFENCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: T.textSecondary }}>Color</Label>
              <div className="flex gap-2">
                {GEOFENCE_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setGeofenceForm({ ...geofenceForm, color: c.hex })}
                    className="h-8 w-8 rounded-full border-2 cursor-pointer transition-transform"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: geofenceForm.color === c.hex ? T.textPrimary : "transparent",
                      transform: geofenceForm.color === c.hex ? "scale(1.15)" : "scale(1)",
                      boxShadow: geofenceForm.color === c.hex ? `0 0 12px ${c.hex}` : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingGeofence(null); setMapMode("view"); }} className="cursor-pointer" style={{ color: T.textSecondary }}>Cancel</Button>
            <Button
              onClick={saveGeofence}
              className="cursor-pointer"
              style={{ backgroundColor: T.neonBlue, color: "#fff", boxShadow: `0 0 12px ${T.neonBlueGlow}` }}
            >
              <Plus className="h-4 w-4 mr-1" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit geofence dialog */}
      <Dialog open={!!editGeofence} onOpenChange={(v) => { if (!v) setEditGeofence(null); }}>
        <DialogContent className="max-w-md" style={{ backgroundColor: T.bg1, border: `1px solid ${T.borderNeon}` }}>
          <DialogHeader>
            <DialogTitle style={{ color: T.textPrimary }}>Edit Geofence</DialogTitle>
            <DialogDescription style={{ color: T.textSecondary }}>{editGeofence?.name}</DialogDescription>
          </DialogHeader>
          {editGeofence && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: T.textSecondary }}>Name</Label>
                <Input
                  value={editGeofence.name}
                  onChange={(e) => setEditGeofence({ ...editGeofence, name: e.target.value })}
                  style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: T.textSecondary }}>Radius (m)</Label>
                  <Input
                    type="number"
                    value={editGeofence.radiusMeters}
                    onChange={(e) => setEditGeofence({ ...editGeofence, radiusMeters: parseInt(e.target.value) || 100 })}
                    style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: T.textSecondary }}>Type</Label>
                  <Select value={editGeofence.type} onValueChange={(v) => setEditGeofence({ ...editGeofence, type: v })}>
                    <SelectTrigger style={{ backgroundColor: T.bg0, borderColor: T.border, color: T.textPrimary }}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ backgroundColor: T.bg1, borderColor: T.border }}>
                      {GEOFENCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditGeofence(null)} className="cursor-pointer" style={{ color: T.textSecondary }}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!editGeofence) return;
                try {
                  const res = await fetch(`/api/geofences/${editGeofence.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: editGeofence.name,
                      radiusMeters: editGeofence.radiusMeters,
                      type: editGeofence.type,
                    }),
                  });
                  if (res.ok) {
                    toast.success("Geofence updated");
                    setEditGeofence(null);
                    fetchData();
                  }
                } catch {
                  toast.error("Network error");
                }
              }}
              className="cursor-pointer"
              style={{ backgroundColor: T.neonBlue, color: "#fff", boxShadow: `0 0 12px ${T.neonBlueGlow}` }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components (themed) ───────────────────────────────────────────────

function StatPill({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono"
      style={{
        backgroundColor: hexToRgba(color, 0.1),
        color,
        border: `1px solid ${hexToRgba(color, 0.3)}`,
      }}
    >
      {icon}
      <span className="font-bold">{value}</span>
      <span style={{ opacity: 0.7 }}>{label}</span>
    </div>
  );
}

function NeonBadge({ color, icon, children }: { color: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[8px] px-1 py-0 h-3.5 rounded font-mono font-medium"
      style={{
        backgroundColor: hexToRgba(color, 0.12),
        color,
        border: `1px solid ${hexToRgba(color, 0.3)}`,
      }}
    >
      {icon}{children}
    </span>
  );
}

function NeonActionButton({
  color,
  onClick,
  title,
  children,
}: {
  color: string;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg cursor-pointer transition-all hover:scale-105"
      style={{
        backgroundColor: hexToRgba(color, 0.08),
        border: `1px solid ${hexToRgba(color, 0.4)}`,
        color,
        boxShadow: `0 0 8px ${hexToRgba(color, 0.2)}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hexToRgba(color, 0.15);
        e.currentTarget.style.boxShadow = `0 0 16px ${hexToRgba(color, 0.4)}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = hexToRgba(color, 0.08);
        e.currentTarget.style.boxShadow = `0 0 8px ${hexToRgba(color, 0.2)}`;
      }}
    >
      {children}
    </button>
  );
}

function NeonCTAButton({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 h-7 rounded-md text-[11px] font-semibold cursor-pointer transition-all"
      style={{
        backgroundColor: hexToRgba(color, 0.12),
        color,
        border: `1px solid ${hexToRgba(color, 0.5)}`,
        boxShadow: `0 0 12px ${hexToRgba(color, 0.3)}`,
      }}
    >
      {children}
    </button>
  );
}

function NeonIconButton({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center h-7 w-7 rounded-md cursor-pointer transition-all"
      style={{
        backgroundColor: "rgba(13, 17, 23, 0.85)",
        border: `1px solid ${hexToRgba(color, 0.4)}`,
        color,
        backdropFilter: "blur(8px)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hexToRgba(color, 0.15);
        e.currentTarget.style.boxShadow = `0 0 12px ${hexToRgba(color, 0.5)}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(13, 17, 23, 0.85)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </button>
  );
}

function LegendItem({ color, label, filled = true }: { color: string; label: string; filled?: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded"
      style={{
        backgroundColor: "rgba(13, 17, 23, 0.85)",
        border: `1px solid ${T.border}`,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: filled ? color : "transparent",
          border: filled ? "none" : `1.5px solid ${color}`,
          boxShadow: filled ? `0 0 6px ${color}` : "none",
        }}
      />
      <span className="text-[9px]" style={{ color: T.textSecondary }}>{label}</span>
    </div>
  );
}

// Bottom panels
function BottomPanels({
  geofences,
  timeEntries,
  onDeleteGeofence,
  onToggleGeofence,
  onEditGeofence,
}: {
  geofences: Geofence[];
  timeEntries: TimeEntry[];
  onDeleteGeofence: (id: string, name: string) => void;
  onToggleGeofence: (g: Geofence) => void;
  onEditGeofence: (g: Geofence) => void;
}) {
  const [tab, setTab] = useState<"geofences" | "timesheet">("geofences");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div style={{ borderTop: `1px solid ${T.border}`, backgroundColor: T.bg0 }}>
        <button
          onClick={() => setCollapsed(false)}
          className="w-full px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
          style={{ color: T.textMuted }}
        >
          <Layers className="h-3 w-3" /> Expand Geofences & Shifts
        </button>
      </div>
    );
  }

  return (
    <div
      className="h-44 shrink-0 flex flex-col"
      style={{ borderTop: `1px solid ${T.border}`, backgroundColor: T.bg0 }}
    >
      <div className="flex items-center justify-between px-4 py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("geofences")}
            className="px-3 py-1 text-[11px] font-medium rounded cursor-pointer flex items-center gap-1"
            style={{
              backgroundColor: tab === "geofences" ? hexToRgba(T.neonBlue, 0.12) : "transparent",
              color: tab === "geofences" ? T.neonBlue : T.textMuted,
              border: tab === "geofences" ? `1px solid ${hexToRgba(T.neonBlue, 0.4)}` : "1px solid transparent",
            }}
          >
            <MapPin className="h-3 w-3" /> Geofences ({geofences.length})
          </button>
          <button
            onClick={() => setTab("timesheet")}
            className="px-3 py-1 text-[11px] font-medium rounded cursor-pointer flex items-center gap-1"
            style={{
              backgroundColor: tab === "timesheet" ? hexToRgba(T.neonBlue, 0.12) : "transparent",
              color: tab === "timesheet" ? T.neonBlue : T.textMuted,
              border: tab === "timesheet" ? `1px solid ${hexToRgba(T.neonBlue, 0.4)}` : "1px solid transparent",
            }}
          >
            <Calendar className="h-3 w-3" /> Open Shifts ({timeEntries.length})
          </button>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] cursor-pointer"
          style={{ color: T.textMuted }}
        >
          Collapse ▼
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "geofences" ? (
          geofences.length === 0 ? (
            <div className="p-4 text-center text-[11px]" style={{ color: T.textMuted }}>
              No geofences yet. Click &quot;Draw Geofence&quot; on the map to create one.
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0" style={{ backgroundColor: T.bg0, borderBottom: `1px solid ${T.border}` }}>
                <tr className="text-left" style={{ color: T.textMuted }}>
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Type</th>
                  <th className="px-3 py-1.5 font-medium">Center</th>
                  <th className="px-3 py-1.5 font-medium">Radius</th>
                  <th className="px-3 py-1.5 font-medium">Events</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {geofences.map((g) => (
                  <tr key={g.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color, boxShadow: `0 0 6px ${g.color}` }} />
                        <span className="font-medium" style={{ color: T.textPrimary }}>{g.name}</span>
                      </div>
                      {g.description && <div className="text-[9px]" style={{ color: T.textMuted }}>{g.description}</div>}
                    </td>
                    <td className="px-3 py-2 capitalize" style={{ color: T.textSecondary }}>{g.type.replace("_", " ")}</td>
                    <td className="px-3 py-2 font-mono text-[10px]" style={{ color: T.textSecondary }}>
                      {g.lat.toFixed(4)}, {g.lon.toFixed(4)}
                    </td>
                    <td className="px-3 py-2" style={{ color: T.textSecondary }}>{g.radiusMeters}m</td>
                    <td className="px-3 py-2" style={{ color: T.textSecondary }}>{g._count?.events ?? 0}</td>
                    <td className="px-3 py-2">
                      {g.isActive ? (
                        <NeonBadge color={T.neonGreen}>ACTIVE</NeonBadge>
                      ) : (
                        <NeonBadge color={T.textMuted}>PAUSED</NeonBadge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => onToggleGeofence(g)} className="cursor-pointer p-1" style={{ color: T.textMuted }} title={g.isActive ? "Pause" : "Activate"}>
                        <ShieldCheck className="h-3 w-3" style={{ opacity: g.isActive ? 1 : 0.4 }} />
                      </button>
                      <button onClick={() => onEditGeofence(g)} className="cursor-pointer p-1" style={{ color: T.textMuted }}>
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => onDeleteGeofence(g.id, g.name)} className="cursor-pointer p-1" style={{ color: T.textMuted }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          timeEntries.length === 0 ? (
            <div className="p-4 text-center text-[11px]" style={{ color: T.textMuted }}>
              No open shifts. Use &quot;Clock In&quot; on a selected employee to start a shift.
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0" style={{ backgroundColor: T.bg0, borderBottom: `1px solid ${T.border}` }}>
                <tr className="text-left" style={{ color: T.textMuted }}>
                  <th className="px-3 py-1.5 font-medium">Employee</th>
                  <th className="px-3 py-1.5 font-medium">Clock In</th>
                  <th className="px-3 py-1.5 font-medium">Location</th>
                  <th className="px-3 py-1.5 font-medium">Geofence</th>
                  <th className="px-3 py-1.5 font-medium">Duration</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td className="px-3 py-2 font-medium" style={{ color: T.textPrimary }}>{e.user.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: T.textSecondary }}>{new Date(e.clockInAt).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 font-mono text-[10px]" style={{ color: T.textSecondary }}>
                      {e.clockInLat?.toFixed(4) ?? "—"}, {e.clockInLon?.toFixed(4) ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: T.neonBlue }}>{e.geofence?.name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: T.neonAmber }}>{timeAgo(e.clockInAt)}</td>
                    <td className="px-3 py-2">
                      <NeonBadge color={T.neonBlue}>OPEN</NeonBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function metersToPixels(meters: number, lat: number, mapWidth: number): number {
  const metersPerDegree = 111320 * Math.cos((lat * Math.PI) / 180);
  const degrees = meters / metersPerDegree;
  return (degrees / 360) * mapWidth;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
