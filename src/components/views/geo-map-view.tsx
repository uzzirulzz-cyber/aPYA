"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin, Radio, Smartphone, User, RefreshCw, Activity, Signal, Battery, Globe, Crosshair } from "lucide-react";

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
  addedBy: { id: string; name: string; email: string } | null;
  case: { id: string; caseNumber: string; title: string } | null;
}

interface LiveMonitorData {
  devices: GeoDevice[];
  timestamp: string;
  totalDevices: number;
  liveDevices: number;
}

// World regions for simulated positions
const WORLD_REGIONS = [
  { lat: 40.7128, lon: -74.0060, name: "New York, USA", region: "NA" },
  { lat: 51.5074, lon: -0.1278, name: "London, UK", region: "EU" },
  { lat: 35.6762, lon: 139.6503, name: "Tokyo, Japan", region: "AS" },
  { lat: -33.8688, lon: 151.2093, name: "Sydney, Australia", region: "OC" },
  { lat: 25.2048, lon: 55.2708, name: "Dubai, UAE", region: "ME" },
  { lat: -23.5505, lon: -46.6333, name: "São Paulo, Brazil", region: "SA" },
  { lat: 55.7558, lon: 37.6173, name: "Moscow, Russia", region: "EU" },
  { lat: 1.3521, lon: 103.8198, name: "Singapore", region: "AS" },
  { lat: 48.8566, lon: 2.3522, name: "Paris, France", region: "EU" },
  { lat: 34.0522, lon: -118.2437, name: "Los Angeles, USA", region: "NA" },
  { lat: 19.0760, lon: 72.8777, name: "Mumbai, India", region: "AS" },
  { lat: -26.2041, lon: 28.0473, name: "Johannesburg, SA", region: "AF" },
];

interface GeoMapViewProps {
  focusUserId?: string | null;
  onFocusCleared?: () => void;
}

export function GeoMapView({ focusUserId, onFocusCleared }: GeoMapViewProps = {}) {
  const [data, setData] = useState<LiveMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<GeoDevice | null>(null);
  const [devicePositions, setDevicePositions] = useState<Record<string, { lat: number; lon: number }>>({});
  // Zoom & pan state (animated toward target each frame)
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const targetZoom = useRef(1);
  const targetPanX = useRef(0);
  const targetPanY = useRef(0);
  const focusDeviceId = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live-monitor");
      if (res.ok) {
        const d = await res.json();
        const enhancedDevices = d.devices.map((dev: GeoDevice, i: number) => ({
          ...dev,
          isLive: true,
          connectionStatus: "connected",
          batteryPercent: dev.batteryPercent ?? 75 + Math.floor(Math.random() * 25),
        }));
        setData({ ...d, devices: enhancedDevices, liveDevices: enhancedDevices.length });

        setDevicePositions((prev) => {
          const next = { ...prev };
          enhancedDevices.forEach((dev: GeoDevice, i: number) => {
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
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // When focusUserId changes, find a matching device and lock focus on it.
  useEffect(() => {
    if (!focusUserId) {
      focusDeviceId.current = null;
      targetZoom.current = 1;
      targetPanX.current = 0;
      targetPanY.current = 0;
      return;
    }
    if (!data?.devices?.length) return;

    const matchingDevice = data.devices.find((d) => d.addedBy?.id === focusUserId);
    if (!matchingDevice) {
      toast.info("No live field units assigned to this member yet.");
      onFocusCleared?.();
      return;
    }
    focusDeviceId.current = matchingDevice.id;
    setSelectedDevice(matchingDevice);
  }, [focusUserId, data, onFocusCleared]);

  // Recompute target pan whenever positions update or focus changes.
  useEffect(() => {
    if (!focusDeviceId.current) {
      targetZoom.current = 1;
      targetPanX.current = 0;
      targetPanY.current = 0;
      return;
    }
    const pos = devicePositions[focusDeviceId.current];
    const canvas = canvasRef.current;
    if (!pos || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dx = ((pos.lon + 180) / 360) * w;
    const dy = ((90 - pos.lat) / 180) * h;
    const targetZoomVal = 7;
    targetZoom.current = targetZoomVal;
    targetPanX.current = w / 2 - dx * targetZoomVal;
    targetPanY.current = h / 2 - dy * targetZoomVal;
  }, [devicePositions, focusUserId]);

  // Animation loop: lerp current zoom/pan toward target.
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

  useEffect(() => {
    const moveInterval = setInterval(() => {
      setDevicePositions((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          const pos = next[id];
          next[id] = {
            lat: pos.lat + (Math.random() - 0.5) * 0.0005,
            lon: pos.lon + (Math.random() - 0.5) * 0.0005,
          };
        });
        return next;
      });
    }, 1500);
    return () => clearInterval(moveInterval);
  }, []);

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

    // ===== World layer (zoomable / pannable) =====
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    const isZoomed = zoom > 1.5;

    // Shutterstock theme: Blue gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#0f1729");
    bgGrad.addColorStop(0.4, "#1a2744");
    bgGrad.addColorStop(0.7, "#243656");
    bgGrad.addColorStop(1, "#0f1729");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines (subtle)
    ctx.strokeStyle = "rgba(30, 58, 95, 0.2)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw world map outlines (Shutterstock style - dark blue continents)
    const drawContinent = (points: number[][]) => {
      ctx.beginPath();
      points.forEach(([px, py], i) => {
        const x = px * w;
        const y = py * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(30, 58, 95, 0.15)";
      ctx.fill();
      ctx.strokeStyle = "rgba(45, 74, 111, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    // Simplified continent shapes
    drawContinent([[0.15,0.12],[0.32,0.08],[0.36,0.15],[0.34,0.28],[0.28,0.32],[0.18,0.28],[0.14,0.20],[0.15,0.12]]); // NA
    drawContinent([[0.26,0.38],[0.34,0.36],[0.36,0.48],[0.33,0.62],[0.28,0.65],[0.24,0.55],[0.25,0.42],[0.26,0.38]]); // SA
    drawContinent([[0.46,0.14],[0.55,0.12],[0.57,0.18],[0.54,0.24],[0.48,0.24],[0.45,0.19],[0.46,0.14]]); // EU
    drawContinent([[0.45,0.28],[0.54,0.26],[0.58,0.34],[0.56,0.50],[0.51,0.56],[0.46,0.50],[0.44,0.36],[0.45,0.28]]); // AF
    drawContinent([[0.58,0.10],[0.78,0.08],[0.84,0.14],[0.82,0.28],[0.75,0.32],[0.66,0.30],[0.58,0.22],[0.58,0.10]]); // AS
    drawContinent([[0.74,0.50],[0.84,0.48],[0.87,0.56],[0.84,0.64],[0.76,0.66],[0.72,0.58],[0.74,0.50]]); // AU

    // Latitude/longitude lines
    ctx.strokeStyle = "rgba(45, 74, 111, 0.12)";
    [0.25, 0.5, 0.75].forEach((p) => {
      ctx.beginPath(); ctx.moveTo(0, p * h); ctx.lineTo(w, p * h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p * w, 0); ctx.lineTo(p * w, h); ctx.stroke();
    });

    // Hexagonal patterns (Shutterstock style)
    const drawHex = (cx: number, cy: number, r: number, opacity: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(20, 184, 166, ${opacity})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    };

    // Scattered hexagons
    [[0.35,0.25,12],[0.62,0.45,10],[0.78,0.35,14],[0.42,0.55,8],[0.68,0.60,11],[0.22,0.45,9],[0.52,0.30,10],[0.85,0.50,8]].forEach(([px, py, r]) => {
      drawHex(px * w, py * h, r, 0.08 + Math.sin(time + px * 10) * 0.03);
    });

    // Data panel rectangles (Shutterstock style)
    const drawDataPanel = (x: number, y: number, width: number, height: number) => {
      ctx.fillStyle = "rgba(15, 23, 41, 0.6)";
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = "rgba(45, 74, 111, 0.4)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, width, height);
      // Corner accents
      ctx.fillStyle = "rgba(20, 184, 166, 0.3)";
      ctx.fillRect(x, y, 8, 1);
      ctx.fillRect(x, y, 1, 8);
      ctx.fillRect(x + width - 8, y + height - 1, 8, 1);
      ctx.fillRect(x + width - 1, y + height - 8, 1, 8);
    };

    drawDataPanel(w * 0.48, h * 0.12, 50, 30);
    drawDataPanel(w * 0.78, h * 0.20, 45, 25);
    drawDataPanel(w * 0.32, h * 0.48, 40, 22);
    drawDataPanel(w * 0.65, h * 0.55, 42, 24);

    // Orange/amber accent circles (Shutterstock style)
    const drawAmberCircle = (x: number, y: number, baseR: number, phase: number) => {
      const r = baseR + Math.sin(time * 0.8 + phase) * 3;
      const opacity = 0.15 + Math.sin(time * 0.8 + phase) * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(245, 158, 11, ${opacity})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245, 158, 11, ${opacity * 0.5})`;
      ctx.fill();
    };

    drawAmberCircle(w * 0.45, h * 0.30, 15, 0);
    drawAmberCircle(w * 0.68, h * 0.40, 12, 2);
    drawAmberCircle(w * 0.25, h * 0.35, 10, 4);

    // Radar sweep from center
    const cx = w * 0.5;
    const cy = h * 0.45;
    const sweepAngle = (time % 6) / 6 * Math.PI * 2;
    const maxR = Math.min(w, h) * 0.38;

    // Radar circles
    ctx.strokeStyle = "rgba(20, 184, 166, 0.06)";
    [0.25, 0.5, 0.75, 1].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshair lines
    ctx.strokeStyle = "rgba(20, 184, 166, 0.04)";
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();

    // Radar sweep
    const sweepGrad = ctx.createConicGradient(sweepAngle, cx, cy);
    sweepGrad.addColorStop(0, "rgba(20, 184, 166, 0)");
    sweepGrad.addColorStop(0.03, "rgba(20, 184, 166, 0.12)");
    sweepGrad.addColorStop(0.1, "rgba(20, 184, 166, 0)");
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    // HQ Center hub
    ctx.fillStyle = "rgba(20, 184, 166, 0.15)";
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14b8a6";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(20, 184, 166, 0.5)";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("HQ", cx, cy + 24);

    // Draw devices
    const devices = data?.devices || [];

    devices.forEach((device, i) => {
      const pos = devicePositions[device.id];
      if (!pos) return;

      const x = ((pos.lon + 180) / 360) * w;
      const y = ((90 - pos.lat) / 180) * h;
      const isSelected = selectedDevice?.id === device.id;

      // Connection line to HQ
      ctx.strokeStyle = "rgba(20, 184, 166, 0.06)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pulse rings (teal glow)
      const pulsePhase = (time * 2 + i * 0.7) % (Math.PI * 2);
      const ringR = 12 + Math.sin(pulsePhase) * 5;

      ctx.strokeStyle = `rgba(16, 185, 129, ${0.1 + Math.sin(pulsePhase) * 0.06})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(16, 185, 129, ${0.06 + Math.sin(pulsePhase + 1) * 0.04})`;
      ctx.beginPath();
      ctx.arc(x, y, ringR + 10, 0, Math.PI * 2);
      ctx.stroke();

      // Device glow
      ctx.fillStyle = isSelected ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.15)";
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 16 : 12, 0, Math.PI * 2);
      ctx.fill();

      // Device dot
      ctx.fillStyle = isSelected ? "#f59e0b" : "#10b981";
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = isSelected ? "#f59e0b" : "rgba(241, 245, 249, 0.75)";
      ctx.font = isSelected ? "bold 10px sans-serif" : "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(device.name.slice(0, 12), x, y - 14);

      // Live indicator
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(x + 10, y - 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Precision view overlay (only when zoomed in on a target)
    if (isZoomed && focusDeviceId.current) {
      const pos = devicePositions[focusDeviceId.current];
      if (pos) {
        const fx = ((pos.lon + 180) / 360) * w;
        const fy = ((90 - pos.lat) / 180) * h;

        // Accuracy circles (GPS-style)
        [60, 120, 200].forEach((r, i) => {
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.25 - i * 0.06})`;
          ctx.lineWidth = 1.2 / zoom;
          ctx.setLineDash([6 / zoom, 6 / zoom]);
          ctx.beginPath();
          ctx.arc(fx, fy, r, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.setLineDash([]);

        // Crosshair on target
        ctx.strokeStyle = "rgba(245, 158, 11, 0.8)";
        ctx.lineWidth = 1.5 / zoom;
        const ch = 40;
        ctx.beginPath();
        ctx.moveTo(fx - ch, fy); ctx.lineTo(fx - 12, fy);
        ctx.moveTo(fx + 12, fy); ctx.lineTo(fx + ch, fy);
        ctx.moveTo(fx, fy - ch); ctx.lineTo(fx, fy - 12);
        ctx.moveTo(fx, fy + 12); ctx.lineTo(fx, fy + ch);
        ctx.stroke();

        // Precision coordinate label
        ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
        ctx.font = `bold ${14 / zoom}px monospace`;
        ctx.textAlign = "left";
        ctx.fillText(`${pos.lat.toFixed(6)}°N`, fx + 45, fy - 8);
        ctx.fillText(`${Math.abs(pos.lon).toFixed(6)}°${pos.lon >= 0 ? "E" : "W"}`, fx + 45, fy + 8);
      }
    }
    ctx.restore();

    // ===== HUD layer (fixed, not zoomed) =====
    if (isZoomed && selectedDevice) {
      const pos = devicePositions[selectedDevice.id];
      // Precision view banner
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.fillRect(w / 2 - 110, 12, 220, 32);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 110, 12, 220, 32);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRECISION GPS VIEW", w / 2, 28);
      ctx.fillStyle = "rgba(241, 245, 249, 0.7)";
      ctx.font = "9px monospace";
      ctx.fillText(`LOCK: ${selectedDevice.name.slice(0, 18)}`, w / 2, 40);
      if (pos) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${pos.lat.toFixed(6)}°N  ${Math.abs(pos.lon).toFixed(6)}°${pos.lon >= 0 ? "E" : "W"}`, w - 12, h - 12);
      }
    } else {
      ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(new Date().toISOString().slice(0, 19).replace("T", " "), w - 12, h - 12);
    }

  }, [data, devicePositions, selectedDevice, zoom, panX, panY]);

  const devices = data?.devices || [];

  const exitFocus = () => {
    focusDeviceId.current = null;
    targetZoom.current = 1;
    targetPanX.current = 0;
    targetPanY.current = 0;
    onFocusCleared?.();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
            <Globe className="h-5 w-5 text-[#14b8a6]" />
            Global Operations Monitor
          </h2>
          <p className="text-xs text-[#64748b]">
            Real-time geographic tracking — all units on constant live feed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30 text-[10px]">
            <Signal className="h-2.5 w-2.5 mr-1 animate-pulse" />
            {devices.length} LIVE
          </Badge>
          <Badge variant="outline" className="text-[10px] border-[#334155] text-[#94a3b8]">
            <Smartphone className="h-2.5 w-2.5 mr-1" />
            {devices.length} UNITS
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 cursor-pointer text-[#64748b] hover:text-white" onClick={fetchData}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* World Map Canvas */}
        <Card className="lg:col-span-2 border-[#1e3a5f]/50 overflow-hidden" 
          style={{ background: "linear-gradient(180deg, #0f1729, #1a2744)" }}>
          <CardContent className="p-0">
            <div className="relative w-full" style={{ height: "460px" }}>
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ width: "100%", height: "460px" }}
              />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0f1729]/80">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#14b8a6]" />
                </div>
              )}
              {/* Overlays */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0f1729]/80 backdrop-blur border border-[#1e3a5f]/50">
                  <div className="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
                  <span className="text-[10px] text-[#10b981] font-mono font-medium tracking-wider">LIVE FEED</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0f1729]/80 backdrop-blur border border-[#1e3a5f]/50">
                  <Crosshair className="h-2.5 w-2.5 text-[#64748b]" />
                  <span className="text-[10px] text-[#64748b] font-mono">
                    {Math.floor((Date.now() - lastFetchRef.current) / 1000)}s
                  </span>
                </div>
              </div>
              {/* Legend */}
              <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0f1729]/80 backdrop-blur border border-[#1e3a5f]/50">
                  <div className="h-2 w-2 rounded-full bg-[#10b981]" />
                  <span className="text-[9px] text-[#94a3b8]">Active Unit</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0f1729]/80 backdrop-blur border border-[#1e3a5f]/50">
                  <div className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                  <span className="text-[9px] text-[#94a3b8]">Selected</span>
                </div>
              </div>
              {/* Exit focus button */}
              {zoom > 1.5 && (
                <button
                  onClick={exitFocus}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#f59e0b]/10 border border-[#f59e0b]/40 text-[#f59e0b] text-[11px] font-mono font-medium hover:bg-[#f59e0b]/20 transition-colors cursor-pointer"
                >
                  <Crosshair className="h-3 w-3" />
                  EXIT PRECISION VIEW
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Units Panel */}
        <Card className="border-[#1e3a5f]/50" style={{ background: "linear-gradient(180deg, #111827, #0f1729)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-white">
              <Radio className="h-3.5 w-3.5 text-[#10b981]" />
              Active Field Units
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[410px] overflow-y-auto divide-y divide-[#1e3a5f]/30">
              {devices.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#64748b]">
                  No field units registered
                </div>
              ) : (
                devices.map((device) => {
                  const pos = devicePositions[device.id];
                  const region = WORLD_REGIONS.find(r => 
                    pos && Math.abs(r.lat - pos.lat) < 5 && Math.abs(r.lon - pos.lon) < 5
                  );
                  return (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(selectedDevice?.id === device.id ? null : device)}
                      className={cn(
                        "w-full flex items-start gap-2.5 p-3 text-left transition-all cursor-pointer",
                        selectedDevice?.id === device.id 
                          ? "bg-[#f59e0b]/5 border-l-2 border-l-[#f59e0b]" 
                          : "hover:bg-[#1e3a5f]/20 border-l-2 border-l-transparent"
                      )}
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                        <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-[#10b981] animate-ping opacity-40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-white truncate">{device.name}</span>
                          <Badge className="text-[8px] px-1 py-0 h-4 bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30">
                            LIVE
                          </Badge>
                        </div>
                        <div className="text-[10px] text-[#64748b]">
                          {device.make} {device.model}
                        </div>
                        <div className="text-[10px] text-[#14b8a6] flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {region?.name || device.gpsLocationName || "Active Tracking"}
                        </div>
                        {pos && (
                          <div className="text-[9px] text-[#475569] font-mono">
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
                          {device.batteryPercent}%
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
          </CardContent>
        </Card>
      </div>

      {/* Selected Unit Detail */}
      {selectedDevice && (
        <Card className="border-[#1e3a5f]/50 border-l-2 border-l-[#f59e0b]" 
          style={{ background: "linear-gradient(180deg, #111827, #0f1729)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-white">
              <Activity className="h-4 w-4 text-[#f59e0b]" />
              Unit Telemetry — {selectedDevice.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                { label: "Status", value: "CONSTANT LIVE", color: "text-[#10b981]" },
                { label: "Connection", value: selectedDevice.connectionStatus, color: "text-[#10b981]" },
                { label: "Battery", value: `${selectedDevice.batteryPercent}%`, color: "text-white" },
                { label: "Evidence", value: `${selectedDevice.evidenceCount} items`, color: "text-white" },
                { label: "Latitude", value: devicePositions[selectedDevice.id]?.lat.toFixed(6) ?? "—", color: "text-white font-mono" },
                { label: "Longitude", value: devicePositions[selectedDevice.id]?.lon.toFixed(6) ?? "—", color: "text-white font-mono" },
                { label: "Accuracy", value: selectedDevice.gpsAccuracy ? `±${selectedDevice.gpsAccuracy}m` : "±3m", color: "text-white" },
                { label: "Region", value: selectedDevice.gpsLocationName || "Active Tracking", color: "text-[#14b8a6]" },
                { label: "OS", value: selectedDevice.os, color: "text-white capitalize" },
                { label: "Operator", value: selectedDevice.addedBy?.name ?? "—", color: "text-white" },
                { label: "Case", value: selectedDevice.case?.caseNumber ?? "—", color: "text-white" },
                { label: "Model", value: `${selectedDevice.make} ${selectedDevice.model}`, color: "text-white" },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="text-[10px] text-[#64748b] uppercase tracking-wider">{item.label}</div>
                  <div className={`text-xs font-medium ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
