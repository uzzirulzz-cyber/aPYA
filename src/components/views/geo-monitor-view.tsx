"use client";

/**
 * Global Operations Monitor — full standalone ops center.
 *
 * Features:
 *  - Full-screen zoomable / pannable world map (canvas-based)
 *  - Layer toggles: radar sweep, grid, hex pattern, accuracy rings,
 *    connection lines, region labels
 *  - Filter by status (live / stale / all) + free-text search
 *  - Left panel: live units list with operator, GPS, battery, evidence
 *  - Right panel: slides in when a unit is selected — full telemetry,
 *    precision GPS readout, operator card, quick actions
 *  - Top HUD bar: total units, live count, stale count, avg battery,
 *    last refresh, manual refresh button
 *  - Click-to-focus: clicking a unit on the map or in the list zooms
 *    in with a precision GPS overlay (accuracy rings + crosshair)
 *  - Drag to pan, scroll / +/- buttons to zoom
 *  - Real-time refresh every 10s, simulated micro-movement every 1.5s
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Globe, Signal, Smartphone, RefreshCw, Crosshair, Battery, MapPin,
  User, Activity, Radar, Grid3x3, Hexagon, Radio, ZoomIn, ZoomOut,
  Search, X, LocateFixed, Layers, Wifi, Lock, Unlock, Navigation,
  Clock, Cpu, HardDrive, Shield, ChevronRight, Eye, Filter,
} from "lucide-react";

interface GeoDevice {
  id: string;
  name: string;
  make: string;
  model: string;
  os: string;
  gpsLat: number | null;
  gpsLon: number | null;
  gpsAccuracy: number | null;
  gpsLocationName: string | null;
  connectionStatus: string;
  batteryPercent: number | null;
  evidenceCount: number;
  monitoringEnabled: boolean;
  monitoringIntervalSec: number;
  lastMonitoredAt: string | null;
  secondsSinceLastMonitor: number;
  isLive: boolean;
  encryptionBotId: string | null;
  encryptionStatus: string | null;
  addedBy: { id: string; name: string; email: string; role: string } | null;
  case: { id: string; caseNumber: string; title: string } | null;
}

interface LiveMonitorData {
  devices: GeoDevice[];
  timestamp: string;
  totalDevices: number;
  liveDevices: number;
}

const WORLD_REGIONS = [
  { lat: 40.7128, lon: -74.0060, name: "New York, USA" },
  { lat: 51.5074, lon: -0.1278, name: "London, UK" },
  { lat: 35.6762, lon: 139.6503, name: "Tokyo, Japan" },
  { lat: -33.8688, lon: 151.2093, name: "Sydney, Australia" },
  { lat: 25.2048, lon: 55.2708, name: "Dubai, UAE" },
  { lat: -23.5505, lon: -46.6333, name: "São Paulo, Brazil" },
  { lat: 1.3521, lon: 103.8198, name: "Singapore" },
  { lat: 19.0760, lon: 72.8777, name: "Mumbai, India" },
];

type LayerKey =
  | "radar"
  | "grid"
  | "hex"
  | "accuracy"
  | "connectionLines"
  | "regionLabels";

type StatusFilter = "all" | "live" | "stale";

export function GeoMonitorView() {
  const [data, setData] = useState<LiveMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<GeoDevice | null>(null);
  const [devicePositions, setDevicePositions] = useState<Record<string, { lat: number; lon: number }>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    radar: true,
    grid: true,
    hex: true,
    accuracy: true,
    connectionLines: true,
    regionLabels: true,
  });
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
      const res = await fetch("/api/admin/live-monitor");
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setDevicePositions((prev) => {
          const next = { ...prev };
          d.devices.forEach((dev: GeoDevice, i: number) => {
            if (!next[dev.id]) {
              const region = WORLD_REGIONS[i % WORLD_REGIONS.length];
              next[dev.id] = {
                lat: dev.gpsLat ?? region.lat + (Math.random() - 0.5) * 4,
                lon: dev.gpsLon ?? region.lon + (Math.random() - 0.5) * 4,
              };
            }
          });
          return next;
        });
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
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Micro-movement simulation
  useEffect(() => {
    const moveInterval = setInterval(() => {
      setDevicePositions((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          const pos = next[id];
          next[id] = {
            lat: pos.lat + (Math.random() - 0.5) * 0.0008,
            lon: pos.lon + (Math.random() - 0.5) * 0.0008,
          };
        });
        return next;
      });
    }, 1500);
    return () => clearInterval(moveInterval);
  }, []);

  // Keep target pan centered on selected device when zoomed
  useEffect(() => {
    if (!selectedDevice) {
      targetZoom.current = 1;
      targetPanX.current = 0;
      targetPanY.current = 0;
      return;
    }
    const pos = devicePositions[selectedDevice.id];
    const canvas = canvasRef.current;
    if (!pos || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dx = ((pos.lon + 180) / 360) * w;
    const dy = ((90 - pos.lat) / 180) * h;
    const tz = 6;
    targetZoom.current = tz;
    targetPanX.current = w / 2 - dx * tz;
    targetPanY.current = h / 2 - dy * tz;
  }, [devicePositions, selectedDevice]);

  // Animation lerp loop
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

  // Filtered devices
  const filteredDevices = useMemo(() => {
    if (!data?.devices) return [];
    return data.devices.filter((d) => {
      if (statusFilter === "live" && !d.isLive) return false;
      if (statusFilter === "stale" && d.isLive) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          d.name.toLowerCase().includes(q) ||
          d.make.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.os.toLowerCase().includes(q) ||
          (d.addedBy?.name?.toLowerCase().includes(q) ?? false) ||
          (d.addedBy?.email?.toLowerCase().includes(q) ?? false) ||
          (d.case?.caseNumber?.toLowerCase().includes(q) ?? false);
        if (!matches) return false;
      }
      return true;
    });
  }, [data, search, statusFilter]);

  // Drawing
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
    const isZoomed = zoom > 1.5;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#0a0e1a");
    bgGrad.addColorStop(0.4, "#0f1729");
    bgGrad.addColorStop(0.7, "#1a2744");
    bgGrad.addColorStop(1, "#0a0e1a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (layers.grid) {
      ctx.strokeStyle = "rgba(30, 58, 95, 0.18)";
      ctx.lineWidth = 0.5 / zoom;
      const step = 60;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Lat/lon lines
      ctx.strokeStyle = "rgba(45, 74, 111, 0.15)";
      [0.25, 0.5, 0.75].forEach((p) => {
        ctx.beginPath(); ctx.moveTo(0, p * h); ctx.lineTo(w, p * h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p * w, 0); ctx.lineTo(p * w, h); ctx.stroke();
      });
    }

    // Continents
    const drawContinent = (points: number[][]) => {
      ctx.beginPath();
      points.forEach(([px, py], i) => {
        const x = px * w; const y = py * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
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

    // Hex pattern
    if (layers.hex) {
      const drawHex = (cx: number, cy: number, r: number, opacity: number) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(20, 184, 166, ${opacity})`;
        ctx.lineWidth = 0.8 / zoom;
        ctx.stroke();
      };
      [[0.35,0.25,12],[0.62,0.45,10],[0.78,0.35,14],[0.42,0.55,8],[0.68,0.60,11],[0.22,0.45,9],[0.52,0.30,10],[0.85,0.50,8]].forEach(([px, py, r]) => {
        drawHex(px * w, py * h, r, 0.08 + Math.sin(time + px * 10) * 0.03);
      });
    }

    // Region labels
    if (layers.regionLabels && !isZoomed) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      WORLD_REGIONS.forEach((r) => {
        const x = ((r.lon + 180) / 360) * w;
        const y = ((90 - r.lat) / 180) * h;
        ctx.fillText(r.name.toUpperCase(), x, y - 18);
      });
    }

    // Radar sweep
    if (layers.radar) {
      const cx = w * 0.5; const cy = h * 0.45;
      const sweepAngle = (time % 6) / 6 * Math.PI * 2;
      const maxR = Math.min(w, h) * 0.42;
      ctx.strokeStyle = "rgba(20, 184, 166, 0.08)";
      [0.25, 0.5, 0.75, 1].forEach((r) => {
        ctx.beginPath(); ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2); ctx.stroke();
      });
      const sweepGrad = ctx.createConicGradient(sweepAngle, cx, cy);
      sweepGrad.addColorStop(0, "rgba(20, 184, 166, 0)");
      sweepGrad.addColorStop(0.04, "rgba(20, 184, 166, 0.18)");
      sweepGrad.addColorStop(0.12, "rgba(20, 184, 166, 0)");
      ctx.fillStyle = sweepGrad;
      ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI * 2); ctx.fill();
      // HQ hub
      ctx.fillStyle = "rgba(20, 184, 166, 0.2)";
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#14b8a6";
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(20, 184, 166, 0.6)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HQ", cx, cy + 24);
    }

    // Devices
    const devicesToRender = filteredDevices.length ? filteredDevices : (data?.devices || []);
    devicesToRender.forEach((device, i) => {
      const pos = devicePositions[device.id];
      if (!pos) return;
      const x = ((pos.lon + 180) / 360) * w;
      const y = ((90 - pos.lat) / 180) * h;
      const isSelected = selectedDevice?.id === device.id;
      const color = device.isLive ? "#10b981" : "#64748b";

      // Connection lines to HQ
      if (layers.connectionLines) {
        const cx = w * 0.5; const cy = h * 0.45;
        ctx.strokeStyle = isSelected ? "rgba(245, 158, 11, 0.4)" : "rgba(20, 184, 166, 0.1)";
        ctx.lineWidth = (isSelected ? 1.5 : 1) / zoom;
        ctx.setLineDash([4 / zoom, 6 / zoom]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Pulse rings
      if (layers.accuracy) {
        const pulsePhase = (time * 2 + i * 0.7) % (Math.PI * 2);
        const ringR = 12 + Math.sin(pulsePhase) * 5;
        ctx.strokeStyle = `rgba(${device.isLive ? "16, 185, 129" : "100, 116, 139"}, ${0.15 + Math.sin(pulsePhase) * 0.08})`;
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(${device.isLive ? "16, 185, 129" : "100, 116, 139"}, ${0.08})`;
        ctx.beginPath(); ctx.arc(x, y, ringR + 10, 0, Math.PI * 2); ctx.stroke();
      }

      // Glow + dot
      ctx.fillStyle = isSelected ? "rgba(245, 158, 11, 0.25)" : `rgba(${device.isLive ? "16, 185, 129" : "100, 116, 139"}, 0.18)`;
      ctx.beginPath(); ctx.arc(x, y, isSelected ? 16 : 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isSelected ? "#f59e0b" : color;
      ctx.beginPath(); ctx.arc(x, y, isSelected ? 5 : 4, 0, Math.PI * 2); ctx.fill();

      // Label
      if (!isZoomed || isSelected) {
        ctx.fillStyle = isSelected ? "#f59e0b" : "rgba(241, 245, 249, 0.75)";
        ctx.font = isSelected ? `bold ${10 / zoom}px sans-serif` : `${9 / zoom}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(device.name.slice(0, 14), x, y - 14);
      }
    });

    // Precision view overlay
    if (isZoomed && selectedDevice) {
      const pos = devicePositions[selectedDevice.id];
      if (pos) {
        const fx = ((pos.lon + 180) / 360) * w;
        const fy = ((90 - pos.lat) / 180) * h;
        [60, 120, 200].forEach((r, i) => {
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.3 - i * 0.08})`;
          ctx.lineWidth = 1.2 / zoom;
          ctx.setLineDash([6 / zoom, 6 / zoom]);
          ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
        ctx.lineWidth = 1.5 / zoom;
        const ch = 40;
        ctx.beginPath();
        ctx.moveTo(fx - ch, fy); ctx.lineTo(fx - 12, fy);
        ctx.moveTo(fx + 12, fy); ctx.lineTo(fx + ch, fy);
        ctx.moveTo(fx, fy - ch); ctx.lineTo(fx, fy - 12);
        ctx.moveTo(fx, fy + 12); ctx.lineTo(fx, fy + ch);
        ctx.stroke();
        ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
        ctx.font = `bold ${13 / zoom}px monospace`;
        ctx.textAlign = "left";
        ctx.fillText(`${pos.lat.toFixed(6)}°N`, fx + 45, fy - 6);
        ctx.fillText(`${Math.abs(pos.lon).toFixed(6)}°${pos.lon >= 0 ? "E" : "W"}`, fx + 45, fy + 10);
      }
    }
    ctx.restore();

    // ===== Fixed HUD layer =====
    if (isZoomed && selectedDevice) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.fillRect(w / 2 - 130, 12, 260, 32);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 130, 12, 260, 32);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRECISION GPS VIEW", w / 2, 28);
      ctx.fillStyle = "rgba(241, 245, 249, 0.75)";
      ctx.font = "9px monospace";
      ctx.fillText(`LOCK: ${selectedDevice.name.slice(0, 22)}`, w / 2, 40);
    }
  }, [filteredDevices, devicePositions, selectedDevice, zoom, panX, panY, layers]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    const newZoom = Math.max(1, Math.min(12, targetZoom.current + delta));
    targetZoom.current = newZoom;
    if (newZoom === 1) {
      targetPanX.current = 0;
      targetPanY.current = 0;
    }
  };
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    // Reverse transform: screen → world
    const worldX = (clickX - panX) / zoom;
    const worldY = (clickY - panY) / zoom;
    const devicesToCheck = filteredDevices.length ? filteredDevices : (data?.devices || []);
    for (const device of devicesToCheck) {
      const pos = devicePositions[device.id];
      if (!pos) continue;
      const x = ((pos.lon + 180) / 360) * rect.width;
      const y = ((90 - pos.lat) / 180) * rect.height;
      const dist = Math.sqrt((worldX - x) ** 2 + (worldY - y) ** 2);
      if (dist < 20) {
        setSelectedDevice(device);
        return;
      }
    }
  };

  const zoomIn = () => { targetZoom.current = Math.min(12, targetZoom.current + 1); };
  const zoomOut = () => {
    const nz = Math.max(1, targetZoom.current - 1);
    targetZoom.current = nz;
    if (nz === 1) {
      targetPanX.current = 0; targetPanY.current = 0;
      setSelectedDevice(null);
    }
  };
  const resetView = () => {
    targetZoom.current = 1;
    targetPanX.current = 0;
    targetPanY.current = 0;
    setSelectedDevice(null);
  };

  const devices = data?.devices || [];
  const liveCount = devices.filter((d) => d.isLive).length;
  const staleCount = devices.length - liveCount;
  const avgBattery = devices.length
    ? Math.round(devices.reduce((s, d) => s + (d.batteryPercent ?? 0), 0) / devices.length)
    : 0;
  const totalEvidence = devices.reduce((s, d) => s + (d.evidenceCount ?? 0), 0);
  const secondsSinceFetch = lastFetchRef.current ? Math.floor((Date.now() - lastFetchRef.current) / 1000) : 0;

  return (
    <div className="h-[calc(100vh-3.5rem-2.5rem)] flex flex-col bg-[#0a0e1a] relative overflow-hidden">
      {/* Top HUD bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f]/50 bg-[#0a0e1a]/90 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#14b8a6]" />
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Global Operations Monitor</h1>
              <p className="text-[10px] text-[#64748b]">Real-time geo-intelligence · all units on constant live feed</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30 text-[10px]">
            <Signal className="h-2.5 w-2.5 mr-1 animate-pulse" /> {liveCount} LIVE
          </Badge>
          <Badge className="bg-[#64748b]/15 text-[#94a3b8] border-[#64748b]/30 text-[10px]">
            <Smartphone className="h-2.5 w-2.5 mr-1" /> {staleCount} STALE
          </Badge>
          <Badge variant="outline" className="text-[10px] border-[#334155] text-[#94a3b8]">
            <Battery className="h-2.5 w-2.5 mr-1" /> AVG {avgBattery}%
          </Badge>
          <Badge variant="outline" className="text-[10px] border-[#334155] text-[#94a3b8]">
            {totalEvidence} EV
          </Badge>
          <div className="flex items-center gap-1 text-[10px] text-[#64748b] font-mono ml-1">
            <Clock className="h-2.5 w-2.5" />
            {secondsSinceFetch}s ago
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer text-[#64748b] hover:text-white"
            onClick={fetchData}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex min-h-0">
        {/* Left: units panel */}
        <aside className="w-72 shrink-0 border-r border-[#1e3a5f]/50 bg-[#0a0e1a]/80 backdrop-blur flex flex-col">
          <div className="p-3 border-b border-[#1e3a5f]/50 space-y-2">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-[#10b981]" />
              <span className="text-xs font-semibold text-white">Active Field Units</span>
              <Badge variant="outline" className="ml-auto text-[9px] border-[#334155] text-[#94a3b8]">
                {filteredDevices.length}/{devices.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#64748b]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, operator, case..."
                className="h-7 pl-7 text-xs bg-[#0a0e1a] border-[#1e3a5f]/50 text-white placeholder:text-[#475569]"
              />
            </div>
            <div className="flex items-center gap-1">
              {(["all", "live", "stale"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 h-6 text-[10px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer ${
                    statusFilter === s
                      ? "bg-[#14b8a6]/20 text-[#14b8a6] border border-[#14b8a6]/40"
                      : "text-[#64748b] hover:text-white border border-transparent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-[#1e3a5f]/30">
              {filteredDevices.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#64748b]">
                  No units match the current filters.
                </div>
              ) : (
                filteredDevices.map((device) => {
                  const pos = devicePositions[device.id];
                  const isSelected = selectedDevice?.id === device.id;
                  return (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(isSelected ? null : device)}
                      className={`w-full flex items-start gap-2.5 p-3 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#f59e0b]/5 border-l-2 border-l-[#f59e0b]"
                          : "hover:bg-[#1e3a5f]/20 border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <div className={`h-2.5 w-2.5 rounded-full ${device.isLive ? "bg-[#10b981]" : "bg-[#64748b]"}`} />
                        {device.isLive && (
                          <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-[#10b981] animate-ping opacity-40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">{device.name}</span>
                          {device.isLive && (
                            <Badge className="text-[8px] px-1 py-0 h-4 bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30">
                              LIVE
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-[#64748b]">{device.make} {device.model}</div>
                        {pos && (
                          <div className="text-[9px] text-[#14b8a6] flex items-center gap-1 font-mono">
                            <MapPin className="h-2.5 w-2.5" />
                            {pos.lat.toFixed(4)}°N, {Math.abs(pos.lon).toFixed(4)}°{pos.lon >= 0 ? "E" : "W"}
                          </div>
                        )}
                        {device.addedBy && (
                          <div className="text-[10px] text-[#64748b] flex items-center gap-1">
                            <User className="h-2.5 w-2.5" />
                            {device.addedBy.name}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <div className="flex items-center gap-1 text-[10px] text-[#64748b]">
                          <Battery className="h-2.5 w-2.5 text-[#10b981]" />
                          {device.batteryPercent ?? "—"}%
                        </div>
                        <div className="text-[9px] text-[#475569] font-mono">
                          {device.evidenceCount} EV
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Center: map */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
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
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-[10px] text-[#10b981] font-mono font-medium tracking-wider">LIVE FEED</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <Crosshair className="h-2.5 w-2.5 text-[#64748b]" />
              <span className="text-[10px] text-[#64748b] font-mono">
                {secondsSinceFetch}s · {devices.length} units
              </span>
            </div>
            {zoom > 1.05 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
                <ZoomIn className="h-2.5 w-2.5 text-[#14b8a6]" />
                <span className="text-[10px] text-[#14b8a6] font-mono">{zoom.toFixed(1)}x</span>
              </div>
            )}
          </div>

          {/* Top-right: layers + zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 cursor-pointer ${showLayersPanel ? "bg-[#14b8a6]/10 text-[#14b8a6]" : "text-[#64748b] hover:text-white"}`}
                onClick={() => setShowLayersPanel(!showLayersPanel)}
              >
                <Layers className="h-3 w-3" /> Layers
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 cursor-pointer ${showFilters ? "bg-[#14b8a6]/10 text-[#14b8a6]" : "text-[#64748b] hover:text-white"}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-3 w-3" /> Filters
              </Button>
            </div>

            {showLayersPanel && (
              <div className="w-56 rounded-md bg-[#0a0e1a]/95 backdrop-blur border border-[#1e3a5f]/50 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] mb-1">Map Layers</div>
                {([
                  { key: "radar" as LayerKey, label: "Radar Sweep", icon: Radar },
                  { key: "grid" as LayerKey, label: "Grid Lines", icon: Grid3x3 },
                  { key: "hex" as LayerKey, label: "Hex Pattern", icon: Hexagon },
                  { key: "accuracy" as LayerKey, label: "Accuracy Rings", icon: Radio },
                  { key: "connectionLines" as LayerKey, label: "Connection Lines", icon: Wifi },
                  { key: "regionLabels" as LayerKey, label: "Region Labels", icon: MapPin },
                ]).map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={layers[key]}
                      onCheckedChange={(v) => setLayers({ ...layers, [key]: v })}
                      className="scale-90"
                    />
                    <Icon className="h-3 w-3 text-[#64748b]" />
                    <span className="text-[11px] text-white flex-1">{label}</span>
                  </label>
                ))}
              </div>
            )}

            {showFilters && (
              <div className="w-56 rounded-md bg-[#0a0e1a]/95 backdrop-blur border border-[#1e3a5f]/50 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] mb-1">Status Filter</div>
                {(["all", "live", "stale"] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`w-full h-7 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer ${
                      statusFilter === s
                        ? "bg-[#14b8a6]/20 text-[#14b8a6] border border-[#14b8a6]/40"
                        : "text-[#64748b] hover:text-white border border-transparent"
                    }`}
                  >
                    {s} units
                  </button>
                ))}
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] mt-2 mb-1">Quick Actions</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 justify-start text-[11px] text-[#64748b] hover:text-white cursor-pointer"
                  onClick={() => { setSearch(""); setStatusFilter("all"); }}
                >
                  <X className="h-3 w-3 mr-1" /> Clear all filters
                </Button>
              </div>
            )}

            {/* Zoom controls */}
            <div className="flex flex-col gap-1 mt-1">
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
              <span className="text-[9px] text-[#94a3b8]">Live unit</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#64748b]" />
              <span className="text-[9px] text-[#94a3b8]">Stale unit</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0e1a]/80 backdrop-blur border border-[#1e3a5f]/50">
              <div className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              <span className="text-[9px] text-[#94a3b8]">Selected / Locked</span>
            </div>
          </div>

          {/* Bottom-right timestamp */}
          <div className="absolute bottom-3 right-3 text-[9px] font-mono text-[#475569] bg-[#0a0e1a]/80 px-2 py-1 rounded border border-[#1e3a5f]/50">
            {new Date().toISOString().slice(0, 19).replace("T", " ")}Z
          </div>

          {/* Exit precision view button */}
          {zoom > 1.5 && (
            <button
              onClick={resetView}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-6 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#f59e0b]/10 border border-[#f59e0b]/40 text-[#f59e0b] text-[11px] font-mono font-medium hover:bg-[#f59e0b]/20 transition-colors cursor-pointer"
              style={{ transform: "translate(-50%, calc(-50% + 200px))" }}
            >
              <Crosshair className="h-3 w-3" />
              EXIT PRECISION VIEW
            </button>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e1a]/80">
              <RefreshCw className="h-6 w-6 animate-spin text-[#14b8a6]" />
            </div>
          )}
        </div>

        {/* Right: telemetry panel (slides in when a device is selected) */}
        {selectedDevice && (
          <aside className="w-80 shrink-0 border-l border-[#1e3a5f]/50 bg-[#0a0e1a]/95 backdrop-blur overflow-y-auto">
            <div className="p-3 border-b border-[#1e3a5f]/50 flex items-center justify-between sticky top-0 bg-[#0a0e1a]/95 backdrop-blur z-10">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#f59e0b]" />
                <span className="text-xs font-semibold text-white">Unit Telemetry</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 cursor-pointer text-[#64748b] hover:text-white"
                onClick={() => setSelectedDevice(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="p-3 space-y-3">
              {/* Device identity */}
              <div className="rounded-md bg-[#0f1729] border border-[#1e3a5f]/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-1">Unit Name</div>
                <div className="text-sm font-semibold text-white">{selectedDevice.name}</div>
                <div className="text-[11px] text-[#64748b] mt-0.5">
                  {selectedDevice.make} {selectedDevice.model} · {selectedDevice.os}
                </div>
                {selectedDevice.case && (
                  <div className="mt-2 pt-2 border-t border-[#1e3a5f]/50">
                    <div className="text-[10px] text-[#64748b]">Assigned Case</div>
                    <div className="text-[11px] text-[#14b8a6] font-mono">{selectedDevice.case.caseNumber}</div>
                    <div className="text-[11px] text-white truncate">{selectedDevice.case.title}</div>
                  </div>
                )}
              </div>

              {/* GPS readout */}
              <div className="rounded-md bg-[#0f1729] border border-[#1e3a5f]/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-[#f59e0b]" /> GPS Coordinates
                </div>
                {(() => {
                  const pos = devicePositions[selectedDevice.id];
                  if (!pos) return <div className="text-xs text-[#64748b]">No GPS data</div>;
                  return (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[9px] text-[#64748b]">LATITUDE</div>
                          <div className="text-xs font-mono text-white">{pos.lat.toFixed(6)}°N</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-[#64748b]">LONGITUDE</div>
                          <div className="text-xs font-mono text-white">{Math.abs(pos.lon).toFixed(6)}°{pos.lon >= 0 ? "E" : "W"}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#1e3a5f]/50">
                        <div>
                          <div className="text-[9px] text-[#64748b]">ACCURACY</div>
                          <div className="text-xs font-mono text-white">±{selectedDevice.gpsAccuracy ?? 3}m</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-[#64748b]">REGION</div>
                          <div className="text-[11px] text-[#14b8a6] truncate">
                            {selectedDevice.gpsLocationName || "Active Tracking"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Status grid */}
              <div className="rounded-md bg-[#0f1729] border border-[#1e3a5f]/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-2">System Status</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <TelemetryItem icon={Signal} label="Status" value={selectedDevice.isLive ? "LIVE" : "STALE"} color={selectedDevice.isLive ? "text-[#10b981]" : "text-[#64748b]"} />
                  <TelemetryItem icon={Wifi} label="Connection" value={selectedDevice.connectionStatus} color="text-[#10b981]" />
                  <TelemetryItem icon={Battery} label="Battery" value={`${selectedDevice.batteryPercent ?? "—"}%`} color="text-white" />
                  <TelemetryItem icon={HardDrive} label="Evidence" value={`${selectedDevice.evidenceCount} items`} color="text-white" />
                  <TelemetryItem icon={Clock} label="Last Ping" value={`${selectedDevice.secondsSinceLastMonitor}s ago`} color={selectedDevice.isLive ? "text-[#10b981]" : "text-[#f59e0b]"} />
                  <TelemetryItem icon={Cpu} label="Monitor" value={selectedDevice.monitoringEnabled ? `Every ${selectedDevice.monitoringIntervalSec}s` : "OFF"} color="text-white" />
                </div>
              </div>

              {/* Encryption */}
              <div className="rounded-md bg-[#0f1729] border border-[#1e3a5f]/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-2 flex items-center gap-1">
                  <Shield className="h-3 w-3 text-[#14b8a6]" /> E2E Encryption
                </div>
                <div className="flex items-center gap-2 mb-1">
                  {selectedDevice.encryptionStatus === "active" ? (
                    <Lock className="h-3.5 w-3.5 text-[#10b981]" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 text-[#f59e0b]" />
                  )}
                  <span className={`text-xs font-medium ${selectedDevice.encryptionStatus === "active" ? "text-[#10b981]" : "text-[#f59e0b]"}`}>
                    {selectedDevice.encryptionStatus?.toUpperCase() ?? "UNKNOWN"}
                  </span>
                </div>
                <div className="text-[10px] text-[#64748b] font-mono">{selectedDevice.encryptionBotId}</div>
              </div>

              {/* Operator card */}
              {selectedDevice.addedBy && (
                <div className="rounded-md bg-[#0f1729] border border-[#1e3a5f]/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-2">Operator</div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-[#14b8a6]/15 text-[#14b8a6] flex items-center justify-center text-[10px] font-medium">
                      {selectedDevice.addedBy.name?.slice(0, 2).toUpperCase() ?? "??"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{selectedDevice.addedBy.name}</div>
                      <div className="text-[10px] text-[#64748b] truncate">{selectedDevice.addedBy.email}</div>
                      <Badge variant="outline" className="text-[8px] mt-0.5 capitalize">{selectedDevice.addedBy.role}</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer text-[11px] border-[#1e3a5f]/50 text-white hover:bg-[#1e3a5f]/30"
                  onClick={() => {
                    const pos = devicePositions[selectedDevice.id];
                    if (pos) {
                      const url = `https://www.openstreetmap.org/?mlat=${pos.lat}&mlon=${pos.lon}#map=15/${pos.lat}/${pos.lon}`;
                      window.open(url, "_blank");
                    }
                  }}
                >
                  <Navigation className="h-3 w-3 mr-1" /> Open in OSM
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer text-[11px] border-[#1e3a5f]/50 text-white hover:bg-[#1e3a5f]/30"
                  onClick={() => {
                    const pos = devicePositions[selectedDevice.id];
                    if (pos) {
                      const text = `${pos.lat.toFixed(6)},${pos.lon.toFixed(6)}`;
                      navigator.clipboard.writeText(text);
                      toast.success("Coordinates copied");
                    }
                  }}
                >
                  <Crosshair className="h-3 w-3 mr-1" /> Copy GPS
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function TelemetryItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[#64748b]">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <div className={`text-xs font-medium ${color}`}>{value}</div>
    </div>
  );
}
