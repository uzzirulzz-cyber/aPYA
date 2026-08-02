"use client";

import { GeoMapView } from "./geo-map-view";
import { useState, useRef } from "react";
import { useSession, useTeam, useUpdateTeamMember, useOrganization } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn, formatDateTime } from "@/lib/utils";
import {
  ShieldCheck, Users, Building2, KeyRound, Lock, Plus, Pencil,
  Trash2, Copy, Check, Phone, Mail, User, Loader2, ExternalLink, MapPin, Crosshair
} from "lucide-react";

const roleColors: Record<string, string> = {
  admin: "text-destructive bg-destructive/10 border-destructive/30",
  investigator: "text-primary bg-primary/10 border-primary/30",
  reviewer: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  viewer: "text-[#64748b] bg-[#1e293b]/60 border-border",
};

export function AdminView() {
  const { data: session } = useSession();
  const { data: team, isLoading, refetch } = useTeam(session?.organization?.id ?? null);
  const update = useUpdateTeamMember();
  const { data: org } = useOrganization();

  const [editUser, setEditUser] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  // Member → Global Operations Monitor linkage
  const [focusUserId, setFocusUserId] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

  // Add member form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("investigator");
  const [generating, setGenerating] = useState(false);

  const user = session?.user;
  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-[800px] mx-auto">
        <Card className="border-[#1e293b]">
          <CardContent className="py-12 text-center">
            <Lock className="h-8 w-8 text-[#64748b] mx-auto mb-3" />
            <div className="text-sm font-medium text-[#f1f5f9]">Admin access required</div>
            <div className="text-xs text-[#64748b] mt-1">
              You need an admin role to view this page.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleGenerateInvite = async () => {
    if (!newName || !newEmail) {
      toast.error("Name and email are required");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail, phone: newPhone, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate invite");
      } else {
        setInviteResult(data);
        toast.success("Invitation link generated");
        setNewName("");
        setNewEmail("");
        setNewPhone("");
        setNewRole("investigator");
        refetch();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await fetch(`/api/team/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Member removed");
        refetch();
      } else {
        toast.error("Failed to remove member");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const maxUsers = org?.licenseType === "enterprise" ? 50 : org?.licenseType === "professional" ? 15 : 5;

  const handleLocateMember = (memberId: string) => {
    setFocusUserId(memberId);
    // Scroll to the Global Operations Monitor so the user sees the zoom-in
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9] tracking-tight">Admin Panel</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Manage your organization and team members.
          </p>
        </div>
        <Button onClick={() => { setAddOpen(true); setInviteResult(null); }} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" /> Add Member
        </Button>
      </div>

      <div ref={mapSectionRef} className="scroll-mt-4">
        <GeoMapView
          focusUserId={focusUserId}
          onFocusCleared={() => setFocusUserId(null)}
        />
      </div>

      {/* Organization card */}{/* Organization card */}
      <Card className="border-[#1e293b]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Organization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat label="Organization" value={org?.name ?? "—"} icon={<Building2 className="h-3 w-3" />} />
            <Stat label="License Type" value={<span className="uppercase">{org?.licenseType ?? "—"}</span>} icon={<KeyRound className="h-3 w-3" />} />
            <Stat label="Members" value={`${team?.length ?? 0} / ${maxUsers}`} icon={<Users className="h-3 w-3" />} />
          </div>
        </CardContent>
      </Card>

      {/* Team management */}
      <Card className="border-[#1e293b]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" /> Team Members
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">{team?.length ?? 0} members</Badge>
          </div>
          <CardDescription>Manage roles and access for your team.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <div className="divide-y divide-[#1e293b]">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-[#64748b]">Loading…</div>
              ) : !team?.length ? (
                <div className="p-6 text-center text-sm text-[#64748b]">No team members yet.</div>
              ) : (
                team.map((member: any) => (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 hover:bg-[#1e293b]/40 transition-colors",
                      focusUserId === member.id && "bg-[#f59e0b]/5 border-l-2 border-l-[#f59e0b]"
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {(member.name || member.email || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#f1f5f9] truncate">{member.name || member.email}</div>
                      <div className="text-xs text-[#64748b] truncate">{member.email}</div>
                      {member.phone && (
                        <div className="text-[10px] text-[#64748b] flex items-center gap-1">
                          <Phone className="h-2.5 w-2.5" /> {member.phone}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] capitalize", roleColors[member.role] || "")}>
                      {member.role}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-7 w-7 cursor-pointer",
                          focusUserId === member.id
                            ? "text-[#f59e0b] bg-[#f59e0b]/10"
                            : "text-[#14b8a6] hover:bg-[#14b8a6]/10"
                        )}
                        title={focusUserId === member.id ? "Tracking on map" : "Locate on Global Operations Monitor"}
                        onClick={() => {
                          if (focusUserId === member.id) {
                            setFocusUserId(null);
                          } else {
                            handleLocateMember(member.id);
                          }
                        }}
                      >
                        {focusUserId === member.id
                          ? <Crosshair className="h-3 w-3" />
                          : <MapPin className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 cursor-pointer"
                        onClick={() => setEditUser(member)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {member.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive cursor-pointer"
                          onClick={() => handleDelete(member.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editUser && (
        <Dialog open onOpenChange={(v) => !v && setEditUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Member</DialogTitle>
              <DialogDescription>Update member details and role.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={editUser.name || ""} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={editUser.phone || ""} onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="investigator">Investigator</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditUser(null)} className="cursor-pointer">Cancel</Button>
              <Button
                onClick={async () => {
                  try {
                    await update.mutateAsync({ id: editUser.id, name: editUser.name, phone: editUser.phone, role: editUser.role });
                    toast.success("Updated");
                    setEditUser(null);
                    refetch();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                className="cursor-pointer"
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Member</DialogTitle>
            <DialogDescription>
              Enter member details to generate an invitation link.
            </DialogDescription>
          </DialogHeader>

          {!inviteResult ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="john@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone Number</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+1 234 567 8900" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investigator">Investigator</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-center">
                <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <div className="text-sm font-medium text-[#f1f5f9] text-green-500">Invitation Ready</div>
                <div className="text-xs text-[#64748b] mt-1">
                  Share this code with {inviteResult.invitee.name}
                </div>
              </div>

              {/* SAR CODE — featured prominently at the top */}
              {inviteResult.sarCode && (
                <div
                  className="rounded-lg p-4 text-center"
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.08)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                    boxShadow: "0 0 16px rgba(59, 130, 246, 0.2)",
                  }}
                >
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] mb-2">
                    ◆ 12-Character SAR Invite Code ◆
                  </div>
                  <div
                    className="text-2xl font-bold font-mono tracking-[0.15em] text-[#3b82f6] mb-2"
                    style={{ textShadow: "0 0 12px rgba(59, 130, 246, 0.6)" }}
                  >
                    {inviteResult.sarCode}
                  </div>
                  <div className="text-[10px] text-[#64748b]">
                    Expires {new Date(inviteResult.expiresAt).toLocaleDateString()} · 12 chars · shareable via SMS / chat
                  </div>
                </div>
              )}

              {/* SAR shareable link */}
              {inviteResult.sarCode && (
                <div className="rounded-md bg-[#1e293b]/60 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] mb-1 flex items-center justify-between">
                    <span>SAR Invite Link</span>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/activate?sar=${inviteResult.sarCode}`;
                        navigator.clipboard.writeText(url);
                        toast.success("SAR link copied");
                      }}
                      className="text-[#3b82f6] hover:text-[#60a5fa] cursor-pointer"
                    >
                      <Copy className="h-3 w-3 inline" /> Copy
                    </button>
                  </div>
                  <div className="text-xs font-mono break-all text-[#f1f5f9]">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/activate?sar=${inviteResult.sarCode}`
                      : `/activate?sar=${inviteResult.sarCode}`}
                  </div>
                </div>
              )}

              {/* Long link (collapsible / secondary) */}
              <details className="rounded-md bg-[#1e293b]/60 p-3">
                <summary className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] cursor-pointer select-none">
                  Long invite link (advanced)
                </summary>
                <div className="mt-2 text-xs font-mono break-all text-[#f1f5f9]">
                  {typeof window !== "undefined" ? `${window.location.origin}${inviteResult.link}` : inviteResult.link}
                </div>
                <div className="mt-2">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-[#64748b] mb-1">
                    Encoded Token
                  </div>
                  <div className="text-[10px] font-mono break-all text-[#64748b]">{inviteResult.token}</div>
                </div>
              </details>
            </div>
          )}

          <DialogFooter>
            {!inviteResult ? (
              <>
                <Button variant="ghost" onClick={() => setAddOpen(false)} className="cursor-pointer">Cancel</Button>
                <Button onClick={handleGenerateInvite} disabled={generating} className="cursor-pointer">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {generating ? "Generating..." : "Generate Code"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => { setInviteResult(null); setAddOpen(false); }} className="cursor-pointer">Close</Button>
                <a
                  href={inviteResult.sarCode ? `/activate?sar=${inviteResult.sarCode}` : inviteResult.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-9 px-3 border border-input bg-transparent hover:bg-accent hover:text-accent-foreground cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
                {inviteResult.sarCode ? (
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteResult.sarCode);
                      setCopied(true);
                      toast.success("SAR code copied to clipboard");
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="cursor-pointer bg-[#3b82f6] hover:bg-[#2563eb] text-white"
                  >
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copied ? "Copied!" : "Copy SAR Code"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      const fullUrl = `${window.location.origin}${inviteResult.link}`;
                      navigator.clipboard.writeText(fullUrl);
                      setCopied(true);
                      toast.success("Link copied to clipboard");
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="cursor-pointer"
                  >
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copied ? "Copied" : "Copy Link"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#64748b]">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
