"use client";

/**
 * Employee GPS Tracking — FieldServicely-style integration.
 *
 * Layout:
 *   ┌──── TOP HUD: stats ────┐
 *   │ members | tracked | geofences | open shifts | hours today │
 *   ├──────────┬──────────────────────────────┬─────────────────┤
 *   │ LEFT     │       Live Map Canvas         │ RIGHT           │
 *   │ Employees│   (geofences + pings + draw)  │ Activity Feed   │
 *   │ + filter │                               │ + open shifts   │
 *   │ 288px    │                               │ 320px           │
 *   ├──────────┴──────────────────────────────┴─────────────────┤
 *   │ BOTTOM: Timesheet + Geofence manager (collapsible)        │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Modes:
 *   - View: pan/zoom the map, click employees to focus
 *   - Draw Geofence: click on map to drop a geofence center, then
 *     configure name/radius in the dialog
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
  Globe, Users, MapPin, Clock, Plus, Trash2, Pencil, Crosshair,
  Activity, Battery, Signal, Radio, ZoomIn, ZoomOut, LocateFixed,
  ShieldCheck, LogIn, LogOut, Search, X, Layers, Navigation,
  Route, Calendar, TrendingUp, AlertTriangle, CheckCircle2,
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

const GEOFENCE_COLORS = ["#14b8a6", "#f59e0b", "#3b82f6", "#a855f7", "#ec4899", "#10b981", "#ef4444"];
const GEOFENCE_TYPES = [
  { value: "jobsite", label: "Job Site" },
  { value: "office", label: "Office" },
  { value: "restricted", label: "Restricted Zone" },
  { value: "client_site", label: "Client Site" },
];

// World regions used for initial geofence placement hints
const WORLD_REGIONS = [
  { lat: 40.7128, lon: -74.0060, name: "New York" },
  { lat: 51.5074, lon: -0.1278, name: "London" },
  { lat: 34.1718, lon: 73.2389, name: "Abbottabad" },
];

type MapMode = "view" | "drawGeofence";

export function EmployeeTrackingView() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showRouteFor, setShowRouteFor] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lon: number; timestamp: string }>>([]);

  // Geofence creation
  const [mapMode, setMapMode] = useState<MapMode>("view");
  const [pendingGeofence, setPendingGeofence] = useState<{ lat: number; lon: number } | null>(null);
  const [geofenceForm, setGeofenceForm] = useState({
    name: "",
    description: "",
    radiusMeters: 150,
    color: GEOFENCE_COLORS[0],
    type: "jobsite",
  });
  const [editGeofence, setEditGeofence] = useState<Geofence | null>(null);

  // Zoom / pan
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

  // Fetch route history when showRouteFor changes
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

  // Keep target pan centered on selected member
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

  // Animation loop
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
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [data, search]);

  // Map drawing
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

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#0a0e1a");
    bgGrad.addColorStop(0.5, "#0f1729");
    bgGrad.addColorStop(1, "#0a0e1a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(30, 58, 95, 0.18)";
    ctx.lineWidth = 0.5 / zoom;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Continents
    const drawContinent = (pts: number[][]) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px * w, py * h);
        else ctx.lineTo(px * w, py * h);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(30, 58, 95, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(45, 74, 111, 0.4)";
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    };
    drawContinent([[0.15,0.12],[0.32,0.08],[0.36,0.15],[0.34,0.28],[0.28,0.32],[0.18,0.28],[0.14,0.20],[0.15,0.12]]);
    drawContinent([[0.26,0.38],[0.34,0.36],[0.36,0.48],[0.33,0.62],[0.28,0.65],[0.24,0.55],[0.25,0.42],[0.26,0.38]]);
    drawContinent([[0.46,0.14],[0.55,0.12],[0.57,0.18],[0.54,0.24],[0.48,0.24],[0.45,0.19],[0.46,0.14]]);
    drawContinent([[0.45,0.28],[0.54,0.26],[0.58,0.34],[0.56,0.50],[0.51,0.56],[0.46,0.50],[0.44,0.36],[0.45,0.28]]);
    drawContinent([[0.58,0.10],[0.78,0.08],[0.84,0.14],[0.82,0.28],[0.75,0.32],[0.66,0.30],[0.58,0.22],[0.58,0.10]]);
    drawContinent([[0.74,0.50],[0.84,0.48],[0.87,0.56],[0.84,0.64],[0.76,0.66],[0.72,0.58],[0.74,0.50]]);

    // Geofences
    const geofences = data?.geofences ?? [];
    geofences.forEach((g) => {
      const cx = ((g.lon + 180) / 360) * w;
      const cy = ((90 - g.lat) / 180) * h;
      // Convert meters → pixels (approximate, scaled to map)
      const radiusPx = metersToPixels(g.radiusMeters, g.lat, w);

      // Fill
      ctx.fillStyle = hexToRgba(g.color, g.isActive ? 0.12 : 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = hexToRgba(g.color, g.isActive ? 0.7 : 0.3);
      ctx.lineWidth = (selectedMemberId && data?.latestPings[selectedMemberId]?.insideGeofenceIds.includes(g.id) ? 2 : 1.2) / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center dot
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3 / zoom, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = hexToRgba(g.color, 0.95);
      ctx.font = `bold ${10 / zoom}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(g.name.slice(0, 16), cx, cy - radiusPx - 6 / zoom);
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.font = `${9 / zoom}px monospace`;
      ctx.fillText(`r=${g.radiusMeters}m`, cx, cy - radiusPx - 18 / zoom);
    });

    // Route history polyline (if any)
    if (routePoints.length > 1) {
      ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      routePoints.forEach((p, i) => {
        const x = ((p.lon + 180) / 360) * w;
        const y = ((90 - p.lat) / 180) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Dots at each point
      ctx.fillStyle = "rgba(245, 158, 11, 0.8)";
      routePoints.forEach((p) => {
        const x = ((p.lon + 180) / 360) * w;
        const y = ((90 - p.lat) / 180) * h;
        ctx.beginPath();
        ctx.arc(x, y, 2 / zoom, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Employee pings
    filteredMembers.forEach((m) => {
      const ping = data?.latestPings[m.id];
      if (!ping) return;
      const x = ((ping.lon + 180) / 360) * w;
      const y = ((90 - ping.lat) / 180) * h;
      const isSelected = selectedMemberId === m.id;
      const isInside = ping.insideGeofenceIds.length > 0;
      const color = isInside ? "#10b981" : "#3b82f6";

      // Pulse
      const pulsePhase = (time * 1.5) % (Math.PI * 2);
      ctx.strokeStyle = `rgba(${isInside ? "16, 185, 129" : "59, 130, 246"}, ${0.2 + Math.sin(pulsePhase) * 0.1})`;
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(x, y, 14 + Math.sin(pulsePhase) * 4, 0, Math.PI * 2);
      ctx.stroke();

      // Glow
      ctx.fillStyle = isSelected ? "rgba(245, 158, 11, 0.25)" : `rgba(${isInside ? "16, 185, 129" : "59, 130, 246"}, 0.18)`;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 16 : 12, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = isSelected ? "#f59e0b" : color;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = isSelected ? "#f59e0b" : "rgba(241, 245, 249, 0.85)";
      ctx.font = isSelected ? `bold ${10 / zoom}px sans-serif` : `${9 / zoom}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(m.name?.slice(0, 14) ?? m.email.slice(0, 14), x, y - 14);

      // Battery indicator
      if (ping.batteryPercent != null) {
        ctx.fillStyle = ping.batteryPercent > 50 ? "#10b981" : ping.batteryPercent > 20 ? "#f59e0b" : "#ef4444";
        ctx.font = `${8 / zoom}px monospace`;
        ctx.fillText(`${ping.batteryPercent}%`, x + 12, y + 3);
      }
    });

    // Pending geofence preview (draw mode)
    if (pendingGeofence) {
      const cx = ((pendingGeofence.lon + 180) / 360) * w;
      const cy = ((90 - pendingGeofence.lat) / 180) * h;
      const radiusPx = metersToPixels(geofenceForm.radiusMeters, pendingGeofence.lat, w);
      ctx.fillStyle = hexToRgba(geofenceForm.color, 0.15);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(geofenceForm.color, 0.8);
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Crosshair
      ctx.strokeStyle = hexToRgba(geofenceForm.color, 1);
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
      ctx.stroke();
    }

    ctx.restore();

    // Mode banner
    if (mapMode === "drawGeofence") {
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.fillRect(w / 2 - 180, 12, 360, 32);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 180, 12, 360, 32);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GEOFENCE PLACEMENT MODE", w / 2, 28);
      ctx.fillStyle = "rgba(241, 245, 249, 0.7)";
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
      // Convert canvas coords → lat/lon
      const lon = (worldX / rect.width) * 360 - 180;
      const lat = 90 - (worldY / rect.height) * 180;
      setPendingGeofence({ lat, lon });
      return;
    }

    if (isDragging.current) return;

    // Click on member
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

  // Geofence create
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
      setGeofenceForm({ name: "", description: "", radiusMeters: 150, color: GEOFENCE_COLORS[0], type: "jobsite" });
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

  // Manual clock in/out (admin action on behalf — for demo / testing)
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

  // Keyboard: Esc cancels draw mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mapMode === "drawGeofence") {
          setMapMode("view");
          setPendingGeofence(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mapMode]);

  const stats = data?.stats;
  const secondsSinceFetch = lastFetchRef.current ? Math.floor((Date.now() - lastFetchRef.current) / 1000) : 0;

  return (
    <div className="h-[calc(100vh-3.5rem-2.5rem)] flex flex-col bg-[#0a0e1a] relative overflow-hidden">
      {/* Top HUD bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f]/50 bg-[#0a0e1a]/90 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#14b8a6]" />
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Employee GPS Tracking</h1>
              <p className="text-[10px] text-[#64748b]">FieldServicely-style · geofenced attendance · live map · timesheets</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#14b8a6]/15 text-[#14b8a6] border-[#14b8a6]/30 text-[10px]">
            <Users className="h-2.5 w-2.5 mr-1" /> {stats?.totalMembers ?? 0} members
          </Badge>
          <Badge className="bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30 text-[10px]">
            <Signal className="h-2.5 w-2.5 mr-1" /> {stats?.trackedMembers ?? 0} tracked
          </Badge>
          <Badge variant="outline" className="text-[10px] border-[#334155] text-[#94a3b8]">
            <MapPin className="h-2.5 w-2.5 mr-1" /> {stats?.totalGeofences ?? 0} geofences
          </Badge>
          <Badge variant="outline" className="text-[10px] border-[#334155] text-[#94a3b8]">
            <Clock className="h-2.5 w-2.5 mr-1" /> {stats?.openShifts ?? 0} open shifts
          </Badge>
          <Badge variant="outline" className="text-[10px] border-[#334155] text-[#f59e0b]">
            <TrendingUp className="h-2.5 w-2.5 mr-1" /> {stats?.totalHoursToday ?? 0}h today
          </Badge>
          <div className="flex items-center gap-1 text-[10px] text-[#64748b] font-mono ml-1">
            <Clock className="h-2.5 w-2.5" /> {secondsSinceFetch}s
          </div>
          <Button variant="ghost" size="sm" className="h-7 cursor-pointer text-[#64748b] hover:text-white" onClick={fetchData}>
            <Activity className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Employees */}
        <aside className="w-72 shrink-0 border-r border-[#1e3a5f]/50 bg-[#0a0e1a]/80 backdrop-blur flex flex-col">
          <div className="p-3 border-b border-[#1e3a5f]/50 space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-[#14b8a6]" />
              <span className="text-xs font-semibold text-white">Field Employees</span>
              <Badge variant="outline" className="ml-auto text-[9px] border-[#334155] text-[#94a3b8]">
                {filteredMembers.length}/{data?.members.length ?? 0}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#64748b]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, role..."
                className="h-7 pl-7 text-xs bg-[#0a0e1a] border-[#1e3a5f]/50 text-white placeholder:text-[#475569]"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-[#1e3a5f]/30">
              {filteredMembers.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#64748b]">No employees match.</div>
              ) : (
                filteredMembers.map((m) => {
                  const ping = data?.latestPings[m.id];
                  const isSelected = selectedMemberId === m.id;
                  const isInside = ping?.insideGeofenceIds.length ?? 0 > 0;
                  const openEntry = data?.openEntries.find((e) => e.user.id === m.id);
                  const hoursToday = (data?.stats.hoursByUser[m.id] ?? 0) / 3600;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMemberId(isSelected ? null : m.id)}
                      className={`p-3 cursor-pointer transition-all ${isSelected ? "bg-[#f59e0b]/5 border-l-2 border-l-[#f59e0b]" : "hover:bg-[#1e3a5f]/20 border-l-2 border-l-transparent"}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative shrink-0">
                          <div className="h-8 w-8 rounded-full bg-[#14b8a6]/15 text-[#14b8a6] flex items-center justify-center text-[10px] font-medium">
                            {m.name?.slice(0, 2).toUpperCase() ?? m.email.slice(0, 2).toUpperCase()}
                          </div>
                          {ping && (
                            <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0a0e1a] ${isInside ? "bg-[#10b981]" : "bg-[#3b82f6]"}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-white truncate">{m.name ?? m.email}</div>
                          <div className="text-[10px] text-[#64748b] truncate">{m.email}</div>
                          {ping ? (
                            <>
                              <div className="text-[9px] text-[#14b8a6] font-mono mt-0.5">
                                {ping.lat.toFixed(4)}°N, {Math.abs(ping.lon).toFixed(4)}°{ping.lon >= 0 ? "E" : "W"}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {isInside && (
                                  <Badge className="text-[8px] h-3.5 px-1 bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30">
                                    <MapPin className="h-2 w-2 mr-0.5" /> IN GEOFENCE
                                  </Badge>
                                )}
                                {openEntry && (
                                  <Badge className="text-[8px] h-3.5 px-1 bg-[#14b8a6]/15 text-[#14b8a6] border-[#14b8a6]/30">
                                    <Clock className="h-2 w-2 mr-0.5" /> ON SHIFT
                                  </Badge>
                                )}
                                {ping.batteryPercent != null && (
                                  <span className="text-[9px] text-[#64748b] flex items-center gap-0.5">
                                    <Battery className="h-2 w-2" /> {ping.batteryPercent}%
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-[#475569] mt-0.5">
                                {hoursToday > 0 ? `${hoursToday.toFixed(1)}h today` : "No hours today"}
                              </div>
                            </>
                          ) : (
                            <div className="text-[9px] text-[#475569] mt-0.5">No location data</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Selected member actions */}
          {selectedMemberId && (
            <div className="p-3 border-t border-[#1e3a5f]/50 space-y-2 bg-[#0a0e1a]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b]">Selected Member Actions</div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] cursor-pointer border-[#1e3a5f]/50 text-white hover:bg-[#1e3a5f]/30"
                  onClick={() => setShowRouteFor(showRouteFor === selectedMemberId ? null : selectedMemberId)}
                >
                  <Route className="h-3 w-3 mr-1" /> {showRouteFor === selectedMemberId ? "Hide Route" : "Route"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] cursor-pointer border-[#1e3a5f]/50 text-white hover:bg-[#1e3a5f]/30"
                  onClick={() => {
                    const ping = data?.latestPings[selectedMemberId];
                    if (ping) {
                      navigator.clipboard.writeText(`${ping.lat.toFixed(6)},${ping.lon.toFixed(6)}`);
                      toast.success("Coordinates copied");
                    }
                  }}
                >
                  <Crosshair className="h-3 w-3 mr-1" /> Copy GPS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] cursor-pointer border-[#10b981]/40 text-[#10b981] hover:bg-[#10b981]/10"
                  onClick={() => manualClock(selectedMemberId, "clock_in")}
                >
                  <LogIn className="h-3 w-3 mr-1" /> Clock In
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] cursor-pointer border-[#f59e0b]/40 text-[#f59e0b] hover:bg-[#f59e0b]/10"
                  onClick={() => manualClock(selectedMemberId, "clock_out")}
                >
                  <LogOut className="h-3 w-3 mr-1" /> Clock Out
                </Button>
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

          {/* Top-left status */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-[10px] text-[#10b981] font-mono font-medium tracking-wider">LIVE TRACKING</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <Clock className="h-2.5 w-2.5 text-[#64748b]" />
              <span className="text-[10px] text-[#64748b] font-mono">{secondsSinceFetch}s · {data?.members.length ?? 0} employees</span>
            </div>
            {zoom > 1.05 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
                <ZoomIn className="h-2.5 w-2.5 text-[#14b8a6]" />
                <span className="text-[10px] text-[#14b8a6] font-mono">{zoom.toFixed(1)}x</span>
              </div>
            )}
          </div>

          {/* Top-right: mode + zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              {mapMode === "view" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 cursor-pointer bg-[#14b8a6]/10 text-[#14b8a6] border border-[#14b8a6]/30 hover:bg-[#14b8a6]/20"
                  onClick={() => { setMapMode("drawGeofence"); setPendingGeofence(null); }}
                >
                  <Plus className="h-3 w-3" /> Draw Geofence
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 cursor-pointer bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30"
                  onClick={() => { setMapMode("view"); setPendingGeofence(null); }}
                >
                  <X className="h-3 w-3" /> Cancel Draw
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 bg-[#0a0e1a]/80 border border-[#1e3a5f]/50 cursor-pointer" onClick={zoomIn}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 bg-[#0a0e1a]/80 border border-[#1e3a5f]/50 cursor-pointer" onClick={zoomOut}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 bg-[#0a0e1a]/80 border border-[#1e3a5f]/50 cursor-pointer" onClick={resetView} title="Reset view">
                <LocateFixed className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Bottom-left legend */}
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-[9px] text-[#94a3b8]">Inside geofence</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#3b82f6]" />
              <span className="text-[9px] text-[#94a3b8]">Outside / roaming</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              <span className="text-[9px] text-[#94a3b8]">Selected / locked</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full border border-[#14b8a6]" />
              <span className="text-[9px] text-[#94a3b8]">Geofence boundary</span>
            </div>
          </div>

          {/* Bottom-right timestamp */}
          <div className="absolute bottom-3 right-3 text-[9px] font-mono text-[#475569] bg-[#0a0e1a]/80 px-2 py-1 rounded border border-[#1e3a5f]/50">
            {new Date().toISOString().slice(0, 19).replace("T", " ")}Z
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e1a]/80">
              <Activity className="h-6 w-6 animate-spin text-[#14b8a6]" />
            </div>
          )}
        </div>

        {/* RIGHT: Activity feed */}
        <aside className="w-80 shrink-0 border-l border-[#1e3a5f]/50 bg-[#0a0e1a]/95 backdrop-blur flex flex-col">
          <div className="p-3 border-b border-[#1e3a5f]/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#14b8a6]" />
              <span className="text-xs font-semibold text-white">Activity Feed</span>
            </div>
            <Badge variant="outline" className="text-[9px] border-[#334155] text-[#94a3b8]">
              {data?.recentEvents.length ?? 0}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-[#1e3a5f]/30">
              {data?.recentEvents.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#64748b]">
                  No events yet. Geofence entries/exits and clock in/out will appear here.
                </div>
              ) : (
                data?.recentEvents.map((ev) => {
                  const isEnter = ev.event === "enter" || ev.event === "clock_in";
                  const isExit = ev.event === "exit" || ev.event === "clock_out";
                  const Icon = isEnter ? LogIn : isExit ? LogOut : Activity;
                  const color = isEnter ? "text-[#10b981]" : isExit ? "text-[#f59e0b]" : "text-[#3b82f6]";
                  return (
                    <div key={ev.id} className="p-3 flex items-start gap-2.5">
                      <div className={`mt-0.5 ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-white">
                          <span className="font-medium">{ev.user.name ?? ev.user.email}</span>{" "}
                          <span className="text-[#64748b]">{ev.event.replace("_", " ")}</span>{" "}
                          <span className="font-medium" style={{ color: ev.geofence.color }}>
                            {ev.geofence.name}
                          </span>
                        </div>
                        <div className="text-[9px] text-[#64748b] font-mono mt-0.5">
                          {ev.lat.toFixed(4)}, {ev.lon.toFixed(4)} · {timeAgo(ev.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Open shifts summary */}
          {data && data.openEntries.length > 0 && (
            <div className="p-3 border-t border-[#1e3a5f]/50 bg-[#0a0e1a]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] mb-2">Open Shifts ({data.openEntries.length})</div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {data.openEntries.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-[11px]">
                    <Clock className="h-3 w-3 text-[#14b8a6] shrink-0" />
                    <span className="text-white truncate flex-1">{e.user.name}</span>
                    <span className="text-[#64748b] font-mono">{timeAgo(e.clockInAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* BOTTOM: Geofence management + Timesheet (collapsible) */}
      <BottomPanels
        geofences={data?.geofences ?? []}
        timeEntries={data?.openEntries ?? []}
        onDeleteGeofence={deleteGeofence}
        onToggleGeofence={toggleGeofenceActive}
        onEditGeofence={setEditGeofence}
        onRefresh={fetchData}
      />

      {/* Pending geofence dialog */}
      <Dialog open={!!pendingGeofence} onOpenChange={(v) => { if (!v) { setPendingGeofence(null); setMapMode("view"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Geofence</DialogTitle>
            <DialogDescription>
              Center: {pendingGeofence?.lat.toFixed(6)}°N, {pendingGeofence && Math.abs(pendingGeofence.lon).toFixed(6)}°{pendingGeofence && pendingGeofence.lon >= 0 ? "E" : "W"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input value={geofenceForm.name} onChange={(e) => setGeofenceForm({ ...geofenceForm, name: e.target.value })} placeholder="Main Office" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={geofenceForm.description} onChange={(e) => setGeofenceForm({ ...geofenceForm, description: e.target.value })} placeholder="Headquarters — clock-in zone" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Radius (meters)</Label>
                <Input
                  type="number"
                  min={10}
                  max={5000}
                  value={geofenceForm.radiusMeters}
                  onChange={(e) => setGeofenceForm({ ...geofenceForm, radiusMeters: parseInt(e.target.value) || 100 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={geofenceForm.type} onValueChange={(v) => setGeofenceForm({ ...geofenceForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GEOFENCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex gap-2">
                {GEOFENCE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setGeofenceForm({ ...geofenceForm, color: c })}
                    className={`h-7 w-7 rounded-full border-2 cursor-pointer transition-transform ${geofenceForm.color === c ? "scale-110 border-white" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingGeofence(null); setMapMode("view"); }} className="cursor-pointer">Cancel</Button>
            <Button onClick={saveGeofence} className="cursor-pointer bg-[#14b8a6] hover:bg-[#14b8a6]/90">
              <Plus className="h-4 w-4 mr-1" /> Create Geofence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit geofence dialog */}
      <Dialog open={!!editGeofence} onOpenChange={(v) => { if (!v) setEditGeofence(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Geofence</DialogTitle>
            <DialogDescription>{editGeofence?.name}</DialogDescription>
          </DialogHeader>
          {editGeofence && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={editGeofence.name} onChange={(e) => setEditGeofence({ ...editGeofence, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Radius (m)</Label>
                  <Input
                    type="number"
                    value={editGeofence.radiusMeters}
                    onChange={(e) => setEditGeofence({ ...editGeofence, radiusMeters: parseInt(e.target.value) || 100 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={editGeofence.type} onValueChange={(v) => setEditGeofence({ ...editGeofence, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GEOFENCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditGeofence(null)} className="cursor-pointer">Cancel</Button>
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
              className="cursor-pointer bg-[#14b8a6] hover:bg-[#14b8a6]/90"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Bottom panels: geofence list + timesheet
function BottomPanels({
  geofences,
  timeEntries,
  onDeleteGeofence,
  onToggleGeofence,
  onEditGeofence,
  onRefresh,
}: {
  geofences: Geofence[];
  timeEntries: TimeEntry[];
  onDeleteGeofence: (id: string, name: string) => void;
  onToggleGeofence: (g: Geofence) => void;
  onEditGeofence: (g: Geofence) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<"geofences" | "timesheet">("geofences");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="border-t border-[#1e3a5f]/50 bg-[#0a0e1a]">
        <button
          onClick={() => setCollapsed(false)}
          className="w-full px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#64748b] hover:text-white cursor-pointer flex items-center justify-center gap-2"
        >
          <Layers className="h-3 w-3" /> Expand Geofences & Timesheet
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[#1e3a5f]/50 bg-[#0a0e1a] h-44 shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#1e3a5f]/50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("geofences")}
            className={`px-3 py-1 text-[11px] font-medium rounded cursor-pointer ${tab === "geofences" ? "bg-[#14b8a6]/15 text-[#14b8a6] border border-[#14b8a6]/30" : "text-[#64748b] hover:text-white border border-transparent"}`}
          >
            <MapPin className="h-3 w-3 inline mr-1" /> Geofences ({geofences.length})
          </button>
          <button
            onClick={() => setTab("timesheet")}
            className={`px-3 py-1 text-[11px] font-medium rounded cursor-pointer ${tab === "timesheet" ? "bg-[#14b8a6]/15 text-[#14b8a6] border border-[#14b8a6]/30" : "text-[#64748b] hover:text-white border border-transparent"}`}
          >
            <Calendar className="h-3 w-3 inline mr-1" /> Open Shifts ({timeEntries.length})
          </button>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] text-[#64748b] hover:text-white cursor-pointer"
        >
          Collapse ▼
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "geofences" ? (
          geofences.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-[#64748b]">
              No geofences yet. Click "Draw Geofence" on the map to create one.
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0a0e1a] border-b border-[#1e3a5f]/50">
                <tr className="text-left text-[#64748b]">
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Type</th>
                  <th className="px-3 py-1.5 font-medium">Center</th>
                  <th className="px-3 py-1.5 font-medium">Radius</th>
                  <th className="px-3 py-1.5 font-medium">Events</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e3a5f]/30">
                {geofences.map((g) => (
                  <tr key={g.id} className="hover:bg-[#1e3a5f]/20">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-white font-medium">{g.name}</span>
                      </div>
                      {g.description && <div className="text-[9px] text-[#64748b]">{g.description}</div>}
                    </td>
                    <td className="px-3 py-2 capitalize text-[#94a3b8]">{g.type.replace("_", " ")}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#94a3b8]">
                      {g.lat.toFixed(4)}, {g.lon.toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-[#94a3b8]">{g.radiusMeters}m</td>
                    <td className="px-3 py-2 text-[#94a3b8]">{g._count?.events ?? 0}</td>
                    <td className="px-3 py-2">
                      {g.isActive ? (
                        <Badge className="text-[9px] bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30">ACTIVE</Badge>
                      ) : (
                        <Badge className="text-[9px] bg-[#64748b]/15 text-[#94a3b8] border-[#64748b]/30">PAUSED</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onToggleGeofence(g)}
                        className="text-[#64748b] hover:text-[#14b8a6] cursor-pointer p-1"
                        title={g.isActive ? "Pause" : "Activate"}
                      >
                        {g.isActive ? <ShieldCheck className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3 opacity-50" />}
                      </button>
                      <button
                        onClick={() => onEditGeofence(g)}
                        className="text-[#64748b] hover:text-white cursor-pointer p-1"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDeleteGeofence(g.id, g.name)}
                        className="text-[#64748b] hover:text-[#ef4444] cursor-pointer p-1"
                      >
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
            <div className="p-4 text-center text-[11px] text-[#64748b]">
              No open shifts. Use "Clock In" on a selected employee to start a shift.
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0a0e1a] border-b border-[#1e3a5f]/50">
                <tr className="text-left text-[#64748b]">
                  <th className="px-3 py-1.5 font-medium">Employee</th>
                  <th className="px-3 py-1.5 font-medium">Clock In</th>
                  <th className="px-3 py-1.5 font-medium">Location</th>
                  <th className="px-3 py-1.5 font-medium">Geofence</th>
                  <th className="px-3 py-1.5 font-medium">Duration</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e3a5f]/30">
                {timeEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-[#1e3a5f]/20">
                    <td className="px-3 py-2 text-white font-medium">{e.user.name}</td>
                    <td className="px-3 py-2 text-[#94a3b8] font-mono">{new Date(e.clockInAt).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#94a3b8]">
                      {e.clockInLat?.toFixed(4) ?? "—"}, {e.clockInLon?.toFixed(4) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[#14b8a6]">{e.geofence?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-[#f59e0b] font-mono">{timeAgo(e.clockInAt)}</td>
                    <td className="px-3 py-2">
                      <Badge className="text-[9px] bg-[#14b8a6]/15 text-[#14b8a6] border-[#14b8a6]/30">OPEN</Badge>
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

// ============================================================================
// Utilities
// ============================================================================

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Approximate meters → pixels at given latitude for a world map of width w
function metersToPixels(meters: number, lat: number, mapWidth: number): number {
  // 1 degree of longitude ≈ 111320 * cos(lat) meters
  // Map width covers 360 degrees
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
