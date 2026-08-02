"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, User, Mail, Phone, KeyRound, Loader2, Ticket } from "lucide-react";

function ActivateContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const sar = searchParams.get("sar") || "";

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  // Manual SAR entry (if no token or sar in URL)
  const [manualSar, setManualSar] = useState("");
  const [manualMode, setManualMode] = useState(!token && !sar);

  useEffect(() => {
    if (!token && !sar) {
      // No invite param — show manual SAR entry mode
      setLoading(false);
      return;
    }

    // Build the validate URL with whichever param we have
    const validateUrl = sar
      ? `/api/activate?sar=${encodeURIComponent(sar)}`
      : `/api/activate?token=${encodeURIComponent(token)}`;

    fetch(validateUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setInviteData(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to validate invitation");
        setLoading(false);
      });
  }, [token, sar]);

  const handleManualLookup = async () => {
    if (!manualSar.trim()) {
      toast.error("Enter your 12-character SAR code");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/invite/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: manualSar.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid SAR code");
      } else {
        // Build inviteData shape from redeem response
        setInviteData({
          organization: data.organization,
          invitee: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            role: data.role,
          },
          code: data.code,
          expiresAt: data.expiresAt,
        });
        setManualMode(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setValidating(true);
    try {
      // Send whichever credential we have
      const body: Record<string, string> = { password };
      if (sar || inviteData?.code) body.sar = sar || inviteData?.code;
      if (token) body.token = token;

      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Activation failed");
      } else {
        toast.success("Account activated successfully!");
        window.location.href = "/admin";
      }
    } catch {
      toast.error("Network error");
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #0d1117, #11161f)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-[#3b82f6]" />
      </div>
    );
  }

  // Manual SAR entry screen (no token/sar in URL)
  if (manualMode && !inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(180deg, #0d1117, #11161f)" }}>
        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.1))",
                border: "1px solid rgba(59,130,246,0.4)",
                boxShadow: "0 0 20px rgba(59,130,246,0.3)",
              }}
            >
              <Ticket className="h-7 w-7 text-[#3b82f6]" />
            </div>
            <h1 className="text-2xl font-bold text-white">Enter SAR Code</h1>
            <p className="text-sm text-[#64748b] mt-1">
              Enter the 12-character SAR invite code from your administrator
            </p>
          </div>

          <Card className="border-[#3b82f6]/30" style={{ background: "linear-gradient(180deg, #161b22, #0d1117)" }}>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-[#8b949e]">
                  SAR Invite Code
                </label>
                <Input
                  value={manualSar}
                  onChange={(e) => setManualSar(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                  placeholder="SAR-XXXXXXXX"
                  className="h-12 text-center text-lg font-mono tracking-[0.2em] bg-[#0d1117] border-[#3b82f6]/40 text-[#3b82f6] placeholder:text-[#475569] focus:border-[#3b82f6]"
                  style={{ boxShadow: "0 0 12px rgba(59,130,246,0.15)" }}
                  maxLength={12}
                />
                <div className="text-[10px] text-[#6e7681] text-center">
                  Format: SAR-XXXXXXXX (12 characters)
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 text-center">
                  {error}
                </div>
              )}

              <Button
                className="w-full h-10 font-semibold"
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  boxShadow: "0 4px 14px rgba(59,130,246,0.4)",
                }}
                onClick={handleManualLookup}
              >
                Validate SAR Code
              </Button>

              <div className="text-[10px] text-center text-[#6e7681] pt-2 border-t border-[#30363d]">
                Don&apos;t have a code? Ask your administrator to invite you.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(180deg, #0d1117, #11161f)" }}>
        <Card className="w-full max-w-md border-[#ef4444]/40" style={{ background: "linear-gradient(180deg, #161b22, #0d1117)" }}>
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2 text-white">Invalid Invitation</h2>
            <p className="text-sm text-[#64748b]">{error}</p>
            <Button
              variant="outline"
              className="mt-4 cursor-pointer border-[#3b82f6]/40 text-[#3b82f6] hover:bg-[#3b82f6]/10"
              onClick={() => {
                setError("");
                setManualMode(true);
                setManualSar("");
              }}
            >
              Enter a different SAR code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(180deg, #0d1117, #11161f)" }}>
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.1))",
              border: "1px solid rgba(59,130,246,0.4)",
              boxShadow: "0 0 20px rgba(59,130,246,0.3)",
            }}
          >
            <ShieldCheck className="h-7 w-7 text-[#3b82f6]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Activate Your Account</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Join {inviteData?.organization?.name || "your organization"}
          </p>
          {inviteData?.code && (
            <div
              className="inline-block mt-3 px-3 py-1 rounded-md font-mono text-xs font-bold text-[#3b82f6]"
              style={{
                backgroundColor: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.4)",
                textShadow: "0 0 8px rgba(59,130,246,0.6)",
              }}
            >
              ◆ {inviteData.code}
            </div>
          )}
        </div>

        <Card className="border-[#3b82f6]/30" style={{ background: "linear-gradient(180deg, #161b22, #0d1117)" }}>
          <CardHeader>
            <CardTitle className="text-base text-white">Invitation Details</CardTitle>
            <CardDescription className="text-[#64748b]">Review your information and set a password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(59,130,246,0.06)" }}>
                <User className="h-4 w-4 text-[#3b82f6]" />
                <div>
                  <div className="text-xs text-[#64748b]">Name</div>
                  <div className="text-sm font-medium text-white">{inviteData?.invitee?.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(59,130,246,0.06)" }}>
                <Mail className="h-4 w-4 text-[#3b82f6]" />
                <div>
                  <div className="text-xs text-[#64748b]">Email</div>
                  <div className="text-sm font-medium text-white">{inviteData?.invitee?.email}</div>
                </div>
              </div>
              {inviteData?.invitee?.phone && (
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(59,130,246,0.06)" }}>
                  <Phone className="h-4 w-4 text-[#3b82f6]" />
                  <div>
                    <div className="text-xs text-[#64748b]">Phone</div>
                    <div className="text-sm font-medium text-white">{inviteData?.invitee?.phone}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(59,130,246,0.06)" }}>
                <KeyRound className="h-4 w-4 text-[#3b82f6]" />
                <div>
                  <div className="text-xs text-[#64748b]">Role</div>
                  <div className="text-sm font-medium text-white capitalize">{inviteData?.invitee?.role}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-[#30363d]">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#8b949e]">Set Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="h-10 bg-[#0d1117] border-[#30363d] text-white placeholder:text-[#475569] focus:border-[#3b82f6]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#8b949e]">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="h-10 bg-[#0d1117] border-[#30363d] text-white placeholder:text-[#475569] focus:border-[#3b82f6]"
                />
              </div>
            </div>

            <Button
              className="w-full h-10 font-semibold"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                boxShadow: "0 4px 14px rgba(59,130,246,0.4)",
              }}
              onClick={handleActivate}
              disabled={validating}
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Activate Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #0d1117, #11161f)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-[#3b82f6]" />
      </div>
    }>
      <ActivateContent />
    </Suspense>
  );
}
